'use server';

import { ActionResult, actionResponse } from '@/lib/action-response';
import { isAdmin } from '@/lib/auth/server';
import { db } from '@/lib/db';
import {
  compressionJobs as jobsSchema,
  user as userSchema,
} from '@/lib/db/schema';
import { getErrorMessage } from '@/lib/error-utils';
import { and, count, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';

const FilterSchema = z.object({
  pageIndex: z.coerce.number().default(0),
  pageSize: z.coerce.number().default(20),
  filter: z.string().optional(),
  status: z.string().optional(),
  /** 'all' | 'signed_in' | 'anonymous' */
  owner: z.string().optional(),
});

export interface CompressionJobRow {
  id: string;
  status: string;
  progress: number;
  originalFilename: string;
  outputFilename: string;
  inputFormat: string;
  outputFormat: string;
  inputSize: number;
  outputSize: number | null;
  savedPercent: number | null;
  durationSeconds: number | null;
  creditsCharged: number;
  creditsRefunded: boolean;
  errorMessage: string | null;
  settings: Record<string, unknown>;
  createdAt: string;
  completedAt: string | null;
  userEmail: string | null;
}

export interface CompressionStats {
  total: number;
  completed: number;
  failed: number;
  inFlight: number;
  anonymous: number;
  /** completed jobs only */
  bytesIn: number;
  bytesOut: number;
  savedPercent: number | null;
  creditsCharged: number;
  creditsRefunded: number;
  /** completed / (completed + failed) */
  successRate: number | null;
}

export type GetCompressionJobsResult = ActionResult<{
  jobs: CompressionJobRow[];
  totalCount: number;
}>;

function buildConditions(params: z.infer<typeof FilterSchema>) {
  const { filter, status, owner } = params;
  const conditions = [];

  if (status && status !== 'all') {
    conditions.push(
      eq(jobsSchema.status, status as typeof jobsSchema.status.enumValues[number])
    );
  }
  if (owner === 'anonymous') {
    conditions.push(isNull(jobsSchema.userId));
  } else if (owner === 'signed_in') {
    conditions.push(sql`${jobsSchema.userId} is not null`);
  }
  if (filter) {
    conditions.push(
      or(
        ilike(jobsSchema.originalFilename, `%${filter}%`),
        ilike(userSchema.email, `%${filter}%`),
        sql`CAST(${jobsSchema.id} AS TEXT) ILIKE ${`%${filter}%`}`
      )
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function getCompressionJobs(
  params: z.infer<typeof FilterSchema>
): Promise<GetCompressionJobsResult> {
  if (!(await isAdmin())) {
    return actionResponse.forbidden('Admin privileges required.');
  }

  try {
    const parsed = FilterSchema.parse(params);
    const { pageIndex, pageSize } = parsed;
    const whereClause = buildConditions(parsed);

    const rowsQuery = db
      .select({ job: jobsSchema, email: userSchema.email })
      .from(jobsSchema)
      .leftJoin(userSchema, eq(jobsSchema.userId, userSchema.id))
      .where(whereClause)
      .orderBy(desc(jobsSchema.createdAt))
      .offset(pageIndex * pageSize)
      .limit(pageSize);

    const totalQuery = db
      .select({ value: count() })
      .from(jobsSchema)
      .leftJoin(userSchema, eq(jobsSchema.userId, userSchema.id))
      .where(whereClause);

    const [rows, totalResult] = await Promise.all([rowsQuery, totalQuery]);

    const jobs: CompressionJobRow[] = rows.map(({ job, email }) => {
      const inputSize = Number(job.inputSize ?? 0);
      const outputSize =
        job.outputSize === null || job.outputSize === undefined
          ? null
          : Number(job.outputSize);

      return {
        id: job.id,
        status: job.status,
        progress: job.progress,
        originalFilename: job.originalFilename,
        outputFilename: job.outputFilename,
        inputFormat: job.inputFormat,
        outputFormat: job.outputFormat,
        inputSize,
        outputSize,
        savedPercent:
          outputSize !== null && inputSize > 0
            ? Math.round((1 - outputSize / inputSize) * 1000) / 10
            : null,
        durationSeconds:
          job.durationSeconds === null ? null : Number(job.durationSeconds),
        creditsCharged: job.creditsCharged,
        creditsRefunded: job.creditsRefunded,
        errorMessage: job.errorMessage,
        settings: (job.settings ?? {}) as Record<string, unknown>,
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt ? job.completedAt.toISOString() : null,
        userEmail: email ?? null,
      };
    });

    return actionResponse.success({
      jobs,
      totalCount: totalResult[0].value,
    });
  } catch (error) {
    console.error('Error getting compression jobs', error);
    return actionResponse.error(getErrorMessage(error));
  }
}

/**
 * Aggregate over the whole table, not the current page — the point of this
 * screen is spotting a rising failure rate or credits leaking into jobs that
 * never finish.
 */
export async function getCompressionStats(): Promise<
  ActionResult<CompressionStats>
> {
  if (!(await isAdmin())) {
    return actionResponse.forbidden('Admin privileges required.');
  }

  try {
    const [row] = await db
      .select({
        total: count(),
        completed: sql<number>`count(*) filter (where ${jobsSchema.status} = 'completed')::int`,
        failed: sql<number>`count(*) filter (where ${jobsSchema.status} = 'failed')::int`,
        inFlight: sql<number>`count(*) filter (where ${jobsSchema.status} in ('awaiting_upload','queued','processing'))::int`,
        anonymous: sql<number>`count(*) filter (where ${jobsSchema.userId} is null)::int`,
        bytesIn: sql<string>`coalesce(sum(${jobsSchema.inputSize}) filter (where ${jobsSchema.status} = 'completed'), 0)::text`,
        bytesOut: sql<string>`coalesce(sum(${jobsSchema.outputSize}) filter (where ${jobsSchema.status} = 'completed'), 0)::text`,
        creditsCharged: sql<number>`coalesce(sum(${jobsSchema.creditsCharged}), 0)::int`,
        creditsRefunded: sql<number>`coalesce(sum(${jobsSchema.creditsCharged}) filter (where ${jobsSchema.creditsRefunded}), 0)::int`,
      })
      .from(jobsSchema);

    const bytesIn = Number(row.bytesIn ?? 0);
    const bytesOut = Number(row.bytesOut ?? 0);
    const settled = row.completed + row.failed;

    return actionResponse.success({
      total: row.total,
      completed: row.completed,
      failed: row.failed,
      inFlight: row.inFlight,
      anonymous: row.anonymous,
      bytesIn,
      bytesOut,
      savedPercent:
        bytesIn > 0 ? Math.round((1 - bytesOut / bytesIn) * 1000) / 10 : null,
      creditsCharged: row.creditsCharged,
      creditsRefunded: row.creditsRefunded,
      successRate:
        settled > 0 ? Math.round((row.completed / settled) * 1000) / 10 : null,
    });
  } catch (error) {
    console.error('Error getting compression stats', error);
    return actionResponse.error(getErrorMessage(error));
  }
}
