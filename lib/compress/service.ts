import 'server-only';

import { estimateCredits, TIER_LIMITS } from '@/config/compress';
import { refundCredits } from '@/lib/compress/credits';
import { deleteStagedObject } from '@/lib/compress/staging';
import { db } from '@/lib/db';
import {
  compressionJobs as jobsSchema,
  type CompressionJob,
  type CompressionStatus,
} from '@/lib/db/schema';
import {
  collectJobError,
  computeJobProgress,
  getJob,
} from '@/lib/freeconvert/client';
import { TASK_COMPRESS, TASK_EXPORT } from '@/lib/freeconvert/presets';
import type { FCJob } from '@/lib/freeconvert/types';
import { and, eq, isNull } from 'drizzle-orm';

/** Public shape returned to the browser. */
export interface JobView {
  id: string;
  status: CompressionStatus;
  progress: number;
  originalFilename: string;
  outputFilename: string;
  inputSize: number;
  outputSize: number | null;
  savedBytes: number | null;
  savedPercent: number | null;
  downloadUrl: string | null;
  errorMessage: string | null;
  creditsCharged: number;
  createdAt: string;
  completedAt: string | null;
}

export function toJobView(job: CompressionJob): JobView {
  const inputSize = Number(job.inputSize ?? 0);
  const outputSize =
    job.outputSize === null || job.outputSize === undefined
      ? null
      : Number(job.outputSize);

  const savedBytes =
    outputSize !== null && inputSize > 0 ? inputSize - outputSize : null;
  const savedPercent =
    savedBytes !== null && inputSize > 0
      ? Math.round((savedBytes / inputSize) * 1000) / 10
      : null;

  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    originalFilename: job.originalFilename,
    outputFilename: job.outputFilename,
    inputSize,
    outputSize,
    savedBytes,
    savedPercent,
    downloadUrl:
      job.status === 'completed' ? `/api/compress/jobs/${job.id}/download` : null,
    errorMessage: job.errorMessage,
    creditsCharged: job.creditsCharged,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt ? job.completedAt.toISOString() : null,
  };
}

function mapProviderStatus(fcJob: FCJob): CompressionStatus {
  switch (fcJob.status) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'deleted':
      return 'expired';
    case 'processing':
      return 'processing';
    default:
      return 'queued';
  }
}

/**
 * Pull the latest state from FreeConvert and persist it.
 * Refunds credits exactly once when a paid job ends in failure.
 */
export async function syncJob(job: CompressionJob): Promise<CompressionJob> {
  if (
    job.status === 'completed' ||
    job.status === 'failed' ||
    job.status === 'expired'
  ) {
    return job;
  }

  let fcJob: FCJob;
  try {
    fcJob = await getJob(job.providerJobId);
  } catch (err) {
    console.error('[compress] provider sync failed', job.id, err);
    return job;
  }

  const status = mapProviderStatus(fcJob);
  const progress = computeJobProgress(fcJob);

  const exportTask = fcJob.tasks?.find((t) => t.name === TASK_EXPORT);
  const compressTask = fcJob.tasks?.find((t) => t.name === TASK_COMPRESS);

  const patch: Partial<typeof jobsSchema.$inferInsert> = {
    status,
    progress: status === 'completed' ? 100 : progress,
  };

  if (status === 'completed') {
    patch.downloadUrl = exportTask?.result?.url ?? null;
    patch.completedAt = new Date();

    const retentionHours = job.userId
      ? TIER_LIMITS.pro.retentionHours
      : TIER_LIMITS.anonymous.retentionHours;
    patch.downloadExpiresAt = new Date(
      Date.now() + retentionHours * 60 * 60 * 1000
    );

    const size =
      (exportTask?.result?.size as number | undefined) ??
      (compressTask?.result?.size as number | undefined);
    if (typeof size === 'number' && size > 0) {
      patch.outputSize = String(size);
    }
  }

  if (status === 'failed') {
    patch.errorMessage = collectJobError(fcJob) ?? 'Compression failed';
    patch.errorCode =
      fcJob.result?.errorCode ??
      fcJob.tasks?.find((t) => t.status === 'failed')?.result?.errorCode ??
      null;
    patch.completedAt = new Date();
  }

  const [updated] = await db
    .update(jobsSchema)
    .set(patch)
    .where(eq(jobsSchema.id, job.id))
    .returning();

  // The provider has the file now; drop our staged copy either way.
  if (status === 'completed' || status === 'failed') {
    const stagingKey = (job.settings as { stagingKey?: string | null })
      ?.stagingKey;
    if (stagingKey) {
      void deleteStagedObject(stagingKey);
    }
  }

  // Refund once, and only if we actually charged something.
  if (
    status === 'failed' &&
    updated?.userId &&
    updated.creditsCharged > 0 &&
    !updated.creditsRefunded
  ) {
    const [claimed] = await db
      .update(jobsSchema)
      .set({ creditsRefunded: true })
      .where(
        and(eq(jobsSchema.id, job.id), eq(jobsSchema.creditsRefunded, false))
      )
      .returning();

    if (claimed) {
      try {
        await refundCredits(
          updated.userId,
          updated.creditsCharged,
          `Refund for failed compression ${updated.originalFilename}`
        );
      } catch (err) {
        console.error('[compress] refund failed', job.id, err);
        await db
          .update(jobsSchema)
          .set({ creditsRefunded: false })
          .where(eq(jobsSchema.id, job.id));
      }
    }
  }

  return updated ?? job;
}

export async function findJobForRequester(
  jobId: string,
  requester: { userId: string | null; anonKey: string | null }
): Promise<CompressionJob | null> {
  const where = requester.userId
    ? and(eq(jobsSchema.id, jobId), eq(jobsSchema.userId, requester.userId))
    : and(
        eq(jobsSchema.id, jobId),
        isNull(jobsSchema.userId),
        eq(jobsSchema.anonKey, requester.anonKey ?? '__none__')
      );

  const rows = await db.select().from(jobsSchema).where(where).limit(1);
  return rows[0] ?? null;
}

export { estimateCredits };
