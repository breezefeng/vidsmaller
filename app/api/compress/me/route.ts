import {
  effectiveMaxFileSize,
  PROVIDER_MAX_FILE_SIZE,
  TIER_LIMITS,
  type PlanTier,
} from '@/config/compress';
import { apiResponse } from '@/lib/api-response';
import { getFreeCapacity } from '@/lib/compress/budget';
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

  /**
   * Only signed-out visitors draw on the shared pool, so only they need to
   * know about it — and they need to know *before* picking a file, not as a
   * 429 after the upload form is already filled in.
   */
  const freeCapacity = requester.userId ? null : await getFreeCapacity();

  return apiResponse.success({
    tier: requester.tier,
    signedIn: !!requester.userId,
    credits: requester.credits,
    /** whether the browser can fall back to staged uploads */
    stagingAvailable: isStagingEnabled(),
    freeCapacity,
    limits: {
      maxFileSize: effectiveMaxFileSize(requester.tier),
      maxBatchFiles: requester.limits.maxBatchFiles,
      retentionHours: requester.limits.retentionHours,
      allowAdvancedCodecs: requester.limits.allowAdvancedCodecs,
    },
    /**
     * Tier comparison table for the UI. Sizes are clamped to what the current
     * provider plan can actually accept, so the pricing page can never promise
     * an upload that the API would reject.
     */
    tiers: Object.fromEntries(
      (Object.keys(TIER_LIMITS) as PlanTier[]).map((tier) => [
        tier,
        { ...TIER_LIMITS[tier], maxFileSize: effectiveMaxFileSize(tier) },
      ])
    ),
    providerMaxFileSize: PROVIDER_MAX_FILE_SIZE,
    jobs: rows.map(toJobView),
  });
}
