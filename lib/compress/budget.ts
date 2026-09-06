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
 * account, so a spike of free traffic can starve paying customers. This
 * module keeps a running tally and refuses new *free* work once the free
 * share of the daily pool is gone. Paid jobs are never blocked here — they
 * are already bounded by the user's own credit balance.
 *
 * Estimates gate; actuals (from the provider's own task timestamps) are what
 * we report on. See docs/freeconvert-benchmark.md.
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

  if (!redis) {
    return { allowed: true, usedMinutes: 0, budgetMinutes, estimateMinutes };
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
      };
    }

    const next = await redis.incrbyfloat(key, estimateMinutes);
    await redis.expire(key, DAY_TTL);

    return {
      allowed: true,
      usedMinutes: Number(next),
      budgetMinutes,
      estimateMinutes,
    };
  } catch (err) {
    console.error('[compress] free budget check failed, allowing', err);
    return { allowed: true, usedMinutes: 0, budgetMinutes, estimateMinutes };
  }
}

/** Give the estimate back when the job never made it to the provider. */
export async function releaseFreeBudget(estimateMinutes: number): Promise<void> {
  if (!redis || estimateMinutes <= 0) return;
  try {
    await redis.incrbyfloat(`${dayKey()}:free`, -estimateMinutes);
  } catch (err) {
    console.error('[compress] free budget release failed', err);
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
