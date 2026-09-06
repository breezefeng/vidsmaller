import 'server-only';

import { billedMinutes, estimateCredits, TIER_LIMITS } from '@/config/compress';
import {
  recordProviderMinutes,
  settleFreeBudget,
} from '@/lib/compress/budget';
import { refundCredits } from '@/lib/compress/credits';
import { deleteOutputObject, deleteStagedObject } from '@/lib/compress/staging';
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
import type { FCJob, FCTask } from '@/lib/freeconvert/types';
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

function spanSeconds(
  start?: string | null,
  end?: string | null
): number | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms / 1000 : null;
}

function taskSeconds(task?: FCTask): number | null {
  const t = task as Record<string, unknown> | undefined;
  return spanSeconds(
    t?.startedAt as string | undefined,
    t?.endedAt as string | undefined
  );
}

/**
 * The provider's actual bill for a job: every task is rounded up on its own,
 * with a one-minute floor, so a three-task pipeline can never cost less than
 * three minutes.
 *
 * A task that *ran* is billed even when the API omits its timestamps, which
 * it often does. Counting those as zero (the previous behaviour) made the
 * recorded "actual" systematically lower than the invoice — measured on
 * 2026-09-06: 14 minutes recorded against 10 jobs that cannot have cost less
 * than 30. Only tasks that never reached a terminal state are free.
 */
function billedMinutesForJob(fcJob: FCJob): number {
  let total = 0;
  for (const task of fcJob.tasks ?? []) {
    const ran = task.status === 'completed' || task.status === 'failed';
    if (!ran) continue;

    const seconds = taskSeconds(task);
    // No timestamps but it ran: charge the floor the provider charges.
    total += seconds === null ? 1 : billedMinutes(seconds);
  }
  return total;
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

  /* What this job really cost us upstream. Estimates gate the free pool;
   * these actuals are what the upgrade decision is made on. */
  const isTerminal = status === 'completed' || status === 'failed';
  const compressSeconds = isTerminal ? taskSeconds(compressTask) : null;
  const billed = isTerminal ? billedMinutesForJob(fcJob) : null;

  // Only persist on the terminal transition. Writing a partial value earlier
  // would make the `!job.providerBilledMinutes` guard below skip the very
  // sync that is supposed to count this job.
  if (isTerminal) {
    if (compressSeconds !== null) {
      patch.providerCompressSeconds = compressSeconds.toFixed(3);
    }
    const jobSeconds = spanSeconds(
      fcJob.startedAt as string | undefined,
      fcJob.endedAt as string | undefined
    );
    if (jobSeconds !== null) {
      patch.providerJobSeconds = jobSeconds.toFixed(3);
    }
    patch.providerBilledMinutes = billed;
  }

  if (status === 'completed') {
    // export/s3 returns no URL — the file is in our bucket and the download
    // route signs a short-lived URL for it on demand. Older jobs, and any run
    // where R2 was not configured, still carry the provider's own URL.
    const outputKey = (job.settings as { outputKey?: string | null })?.outputKey;
    patch.downloadUrl = outputKey
      ? `r2:${outputKey}`
      : (exportTask?.result?.url ?? null);
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

  // Count usage once, on the transition into a terminal state.
  if (isTerminal && billed !== null && job.providerBilledMinutes === null) {
    void recordProviderMinutes(billed, { free: !job.userId });

    /**
     * Replace the gate's estimate with what actually happened. The estimate
     * is deliberately pessimistic (per-task one-minute floors, a worst-case
     * uplink), so without this the counter ratchets upward and the pool reads
     * as exhausted while real spend is half of it.
     */
    const jobSettings = job.settings as {
      budgetReservedMinutes?: number | null;
      budgetDay?: string | null;
    } | null;
    const reserved = Number(jobSettings?.budgetReservedMinutes ?? 0);
    if (reserved > 0) {
      void settleFreeBudget({
        reservedMinutes: reserved,
        actualMinutes: billed,
        day: jobSettings?.budgetDay ?? undefined,
      });
    }
  }

  // The provider has the file now; drop our staged copy either way.
  if (status === 'completed' || status === 'failed') {
    const stagingKey = (job.settings as { stagingKey?: string | null })
      ?.stagingKey;
    if (stagingKey) {
      void deleteStagedObject(stagingKey);
    }
    // A failed job may still have written a partial object.
    if (status === 'failed') {
      const outputKey = (job.settings as { outputKey?: string | null })
        ?.outputKey;
      if (outputKey) void deleteOutputObject(outputKey);
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
