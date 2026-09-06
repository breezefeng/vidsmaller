import 'server-only';

import {
  FREE_DAILY_MINUTE_BUDGET,
  PROVIDER_PLAN,
  PROVIDER_PLANS,
  PROVIDER_UPGRADE_THRESHOLD,
} from '@/config/compress';
import { redis } from '@/lib/upstash';
import { LOWER_CASE_SITE_NAME } from '@/lib/upstash/redis-keys';

/**
 * FreeConvert conversion minutes are a single pool shared by the whole
 * account, so a spike of anonymous traffic can starve paying customers. This
 * module keeps a running tally and refuses new *anonymous* work once the
 * ring-fenced share of the daily pool is gone.
 *
 * Signed-in users are deliberately **not** gated here. Their credit balance
 * is already the bound, and double-gating them made granted credits randomly
 * unspendable: a free-tier user with 30 credits would be told "try again
 * tomorrow" by a pool they cannot see and did not know existed.
 *
 * Estimates gate; actuals (from the provider's own task timestamps) are what
 * we report on. A reservation is an estimate, so it must be **settled**
 * against the real number when the job lands — otherwise the counter only
 * ever grows and the gate drifts away from reality. (Measured drift before
 * settlement existed: 30 minutes reserved against 14 actually spent.)
 *
 * See docs/freeconvert-benchmark.md.
 */

const NS = `${LOWER_CASE_SITE_NAME}:fc`;

const dayKey = (d = new Date()) =>
  `${NS}:day:${d.toISOString().slice(0, 10)}`;
const monthKey = (d = new Date()) =>
  `${NS}:month:${d.toISOString().slice(0, 7)}`;

const DAY_TTL = 60 * 60 * 24 * 3;
const MONTH_TTL = 60 * 60 * 24 * 70;

/** Env override so the free share can be retuned without a deploy. */
function freeDailyBudget(): number {
  const raw = Number(process.env.FC_FREE_DAILY_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : FREE_DAILY_MINUTE_BUDGET;
}

export interface BudgetDecision {
  allowed: boolean;
  /** free minutes already spent today */
  usedMinutes: number;
  budgetMinutes: number;
  /** what this job is predicted to cost */
  estimateMinutes: number;
  /**
   * The bucket this reservation landed in. Persisted with the job so a job
   * created at 23:59 settles against yesterday's counter, not today's.
   */
  day: string;
}

/** UTC date stamp of the bucket a reservation belongs to. */
export const budgetDay = (d = new Date()) => d.toISOString().slice(0, 10);

/** When the current bucket rolls over, so the UI can say more than "tomorrow". */
export function budgetResetsAt(now = new Date()): Date {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

/**
 * Reserve budget for a free/anonymous job.
 *
 * Fails open when Redis is unavailable, matching `checkRateLimit`: a Redis
 * blip should degrade protection, not take the product down.
 */
export async function reserveFreeBudget(
  estimateMinutes: number
): Promise<BudgetDecision> {
  const budgetMinutes = freeDailyBudget();
  const day = budgetDay();

  if (!redis) {
    return { allowed: true, usedMinutes: 0, budgetMinutes, estimateMinutes, day };
  }

  const key = `${dayKey()}:free`;

  try {
    const used = Number((await redis.get<string | number>(key)) ?? 0);

    if (used + estimateMinutes > budgetMinutes) {
      return {
        allowed: false,
        usedMinutes: used,
        budgetMinutes,
        estimateMinutes,
        day,
      };
    }

    const next = await redis.incrbyfloat(key, estimateMinutes);
    await redis.expire(key, DAY_TTL);

    return {
      allowed: true,
      usedMinutes: Number(next),
      budgetMinutes,
      estimateMinutes,
      day,
    };
  } catch (err) {
    console.error('[compress] free budget check failed, allowing', err);
    return { allowed: true, usedMinutes: 0, budgetMinutes, estimateMinutes, day };
  }
}

/** Give the estimate back when the job never made it to the provider. */
export async function releaseFreeBudget(
  estimateMinutes: number,
  day?: string
): Promise<void> {
  if (!redis || estimateMinutes <= 0) return;
  try {
    await redis.incrbyfloat(`${NS}:day:${day ?? budgetDay()}:free`, -estimateMinutes);
  } catch (err) {
    console.error('[compress] free budget release failed', err);
  }
}

/**
 * Replace a reservation with what the job actually cost.
 *
 * Without this the counter is a ratchet: every job adds its (deliberately
 * pessimistic) estimate and nothing ever comes back, so the gate closes long
 * before the real budget is gone. Applies the signed difference, so it both
 * refunds over-estimates and books under-estimates.
 */
export async function settleFreeBudget(input: {
  reservedMinutes: number;
  actualMinutes: number;
  /** bucket the reservation was made in; defaults to today */
  day?: string;
}): Promise<void> {
  if (!redis) return;

  const delta = input.actualMinutes - input.reservedMinutes;
  if (!Number.isFinite(delta) || delta === 0) return;

  const key = `${NS}:day:${input.day ?? budgetDay()}:free`;
  try {
    await redis.incrbyfloat(key, delta);
    await redis.expire(key, DAY_TTL);
  } catch (err) {
    console.error('[compress] free budget settle failed', err);
  }
}

export interface FreeCapacity {
  usedMinutes: number;
  budgetMinutes: number;
  remainingMinutes: number;
  exhausted: boolean;
  /** ISO timestamp of the next reset */
  resetsAt: string;
}

/**
 * Read-only view of the anonymous pool, so the browser can be told *before*
 * it uploads a file that there is no capacity left — and when it comes back.
 */
export async function getFreeCapacity(): Promise<FreeCapacity> {
  const budgetMinutes = freeDailyBudget();
  const resetsAt = budgetResetsAt().toISOString();

  if (!redis) {
    return {
      usedMinutes: 0,
      budgetMinutes,
      remainingMinutes: budgetMinutes,
      exhausted: false,
      resetsAt,
    };
  }

  try {
    const used = Number(
      (await redis.get<string | number>(`${dayKey()}:free`)) ?? 0
    );
    const remaining = Math.max(0, budgetMinutes - used);
    return {
      usedMinutes: used,
      budgetMinutes,
      remainingMinutes: remaining,
      // Nothing can be booked below the provider's 3-minute per-job floor.
      exhausted: remaining < 3,
      resetsAt,
    };
  } catch (err) {
    console.error('[compress] free capacity read failed', err);
    // Fail open, same as the reservation path.
    return {
      usedMinutes: 0,
      budgetMinutes,
      remainingMinutes: budgetMinutes,
      exhausted: false,
      resetsAt,
    };
  }
}

/**
 * Record what the job actually cost, read from the provider's task
 * timestamps. This is the number to trust for upgrade decisions.
 */
export async function recordProviderMinutes(
  minutes: number,
  opts: { free: boolean; at?: Date } = { free: false }
): Promise<void> {
  if (!redis || !Number.isFinite(minutes) || minutes <= 0) return;

  const at = opts.at ?? new Date();
  try {
    await Promise.all([
      redis
        .incrbyfloat(`${monthKey(at)}:actual`, minutes)
        .then(() => redis!.expire(`${monthKey(at)}:actual`, MONTH_TTL)),
      redis
        .incrbyfloat(`${dayKey(at)}:actual`, minutes)
        .then(() => redis!.expire(`${dayKey(at)}:actual`, DAY_TTL)),
      opts.free
        ? redis
            .incrbyfloat(`${monthKey(at)}:actual:free`, minutes)
            .then(() => redis!.expire(`${monthKey(at)}:actual:free`, MONTH_TTL))
        : Promise.resolve(),
    ]);
  } catch (err) {
    console.error('[compress] usage record failed', err);
  }
}

export interface UsageSnapshot {
  plan: string;
  monthlyMinutes: number;
  monthActual: number;
  monthActualFree: number;
  todayActual: number;
  todayFreeReserved: number;
  freeDailyBudget: number;
  percentOfPlan: number;
  shouldUpgrade: boolean;
}

/** Ops dashboard / upgrade trigger. */
export async function getUsageSnapshot(): Promise<UsageSnapshot | null> {
  if (!redis) return null;

  const plan = PROVIDER_PLANS[PROVIDER_PLAN];
  const num = (v: unknown) => Number(v ?? 0) || 0;

  try {
    const [monthActual, monthFree, todayActual, todayFree] = await Promise.all([
      redis.get<string | number>(`${monthKey()}:actual`),
      redis.get<string | number>(`${monthKey()}:actual:free`),
      redis.get<string | number>(`${dayKey()}:actual`),
      redis.get<string | number>(`${dayKey()}:free`),
    ]);

    const month = num(monthActual);

    return {
      plan: PROVIDER_PLAN,
      monthlyMinutes: plan.monthlyMinutes,
      monthActual: month,
      monthActualFree: num(monthFree),
      todayActual: num(todayActual),
      todayFreeReserved: num(todayFree),
      freeDailyBudget: freeDailyBudget(),
      percentOfPlan: plan.monthlyMinutes
        ? (month / plan.monthlyMinutes) * 100
        : 0,
      shouldUpgrade: month >= PROVIDER_UPGRADE_THRESHOLD,
    };
  } catch (err) {
    console.error('[compress] usage snapshot failed', err);
    return null;
  }
}
