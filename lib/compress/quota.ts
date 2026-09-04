import 'server-only';

import { getUserBenefits } from '@/actions/usage/benefits';
import {
  ANONYMOUS_DAILY_LIMIT,
  TIER_LIMITS,
  type PlanTier,
  type TierLimits,
} from '@/config/compress';
import { getSession } from '@/lib/auth/server';
import { checkRateLimit, getClientIPFromRequest } from '@/lib/upstash';
import { LOWER_CASE_SITE_NAME } from '@/lib/upstash/redis-keys';
import { createHash } from 'crypto';

export interface Requester {
  userId: string | null;
  anonKey: string | null;
  tier: PlanTier;
  limits: TierLimits;
  credits: number;
  planId: string | null;
}

/** Stable, non-reversible identifier for signed-out visitors. */
export function buildAnonKey(req: Request): string {
  const ip = getClientIPFromRequest(req);
  const ua = req.headers.get('user-agent') || '';
  return createHash('sha256')
    .update(`${ip}|${ua}|${process.env.BETTER_AUTH_SECRET || 'vidsmaller'}`)
    .digest('hex')
    .slice(0, 40);
}

/**
 * Map a subscription plan id to a capability tier.
 * Configure PLAN_TIER_MAP as `planId:tier,planId:tier` once real plans exist.
 */
function resolveTierFromPlan(planId: string | null): PlanTier {
  if (!planId) return 'free';

  const raw = process.env.PLAN_TIER_MAP || '';
  for (const pair of raw.split(',')) {
    const [id, tier] = pair.split(':').map((s) => s?.trim());
    if (id && id === planId && (tier === 'pro' || tier === 'max')) {
      return tier;
    }
  }

  // Sensible default: any active paid plan gets at least `pro`.
  return 'pro';
}

export async function resolveRequester(req: Request): Promise<Requester> {
  const session = await getSession();
  const user = session?.user;

  if (!user) {
    return {
      userId: null,
      anonKey: buildAnonKey(req),
      tier: 'anonymous',
      limits: TIER_LIMITS.anonymous,
      credits: 0,
      planId: null,
    };
  }

  let credits = 0;
  let planId: string | null = null;
  try {
    const benefits = await getUserBenefits(user.id);
    credits = benefits?.totalAvailableCredits ?? 0;
    planId = benefits?.activePlanId ?? null;
  } catch (err) {
    console.error('[compress] failed to read user benefits', err);
  }

  const tier = resolveTierFromPlan(planId);

  return {
    userId: user.id,
    anonKey: null,
    tier,
    limits: TIER_LIMITS[tier],
    credits,
    planId,
  };
}

export async function checkAnonymousDailyQuota(
  req: Request
): Promise<{ allowed: boolean }> {
  const ip = getClientIPFromRequest(req);
  const allowed = await checkRateLimit(ip, {
    prefix: `${LOWER_CASE_SITE_NAME}:rl:anon-compress`,
    maxRequests: ANONYMOUS_DAILY_LIMIT,
    window: '1 d',
  });
  return { allowed };
}

/** Belt-and-braces per-user throttle so one account cannot flood the queue. */
export async function checkUserBurstQuota(userId: string): Promise<boolean> {
  return checkRateLimit(userId, {
    prefix: `${LOWER_CASE_SITE_NAME}:rl:user-compress`,
    maxRequests: 60,
    window: '1 h',
  });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}
