import { TIER_LIMITS } from '@/config/compress';
import { apiResponse } from '@/lib/api-response';
import { resolveRequester } from '@/lib/compress/quota';
import { toJobView } from '@/lib/compress/service';
import { isStagingEnabled } from '@/lib/compress/staging';
import { db } from '@/lib/db';
import { compressionJobs as jobsSchema } from '@/lib/db/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';

export const runtime = 'nodejs';

/** Capabilities + recent jobs for the current visitor. */
export async function GET(req: Request) {
  const requester = await resolveRequester(req);

  const where = requester.userId
    ? eq(jobsSchema.userId, requester.userId)
    : and(
        isNull(jobsSchema.userId),
        eq(jobsSchema.anonKey, requester.anonKey ?? '__none__')
      );

  const rows = await db
    .select()
    .from(jobsSchema)
    .where(where)
    .orderBy(desc(jobsSchema.createdAt))
    .limit(20);

  return apiResponse.success({
    tier: requester.tier,
    signedIn: !!requester.userId,
    credits: requester.credits,
    /** whether the browser can fall back to staged uploads */
    stagingAvailable: isStagingEnabled(),
    limits: {
      maxFileSize: requester.limits.maxFileSize,
      maxBatchFiles: requester.limits.maxBatchFiles,
      retentionHours: requester.limits.retentionHours,
      allowAdvancedCodecs: requester.limits.allowAdvancedCodecs,
    },
    tiers: TIER_LIMITS,
    jobs: rows.map(toJobView),
  });
}
