import 'server-only';

import { TIER_LIMITS } from '@/config/compress';
import { db } from '@/lib/db';
import {
  creditLogs as creditLogsSchema,
  usage as usageSchema,
} from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

/**
 * Every signed-up user needs a `usage` row — without one the credit ledger has
 * nothing to lock and every charge fails as "insufficient credits".
 *
 * We create it at signup and seed it with the free tier's allowance so the
 * first compression works immediately.
 */
export async function grantSignupCredits(userId: string): Promise<void> {
  const credits = TIER_LIMITS.free.monthlyCredits;

  try {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(usageSchema)
        .values({
          userId,
          oneTimeCreditsBalance: credits,
          subscriptionCreditsBalance: 0,
        })
        .onConflictDoNothing({ target: usageSchema.userId })
        .returning({
          oneTime: usageSchema.oneTimeCreditsBalance,
          sub: usageSchema.subscriptionCreditsBalance,
        });

      // Row already existed (e.g. account linking) — nothing to grant.
      if (!row) return;

      await tx.insert(creditLogsSchema).values({
        userId,
        amount: credits,
        oneTimeCreditsSnapshot: row.oneTime,
        subscriptionCreditsSnapshot: row.sub,
        type: 'signup_grant',
        notes: `Welcome credits (${credits})`,
      });
    });
  } catch (err) {
    // Never block signup on this.
    console.error('[compress] failed to grant signup credits', userId, err);
  }
}

/**
 * Top the free allowance back up. Intended for a monthly cron:
 *   POST /api/cron/refresh-free-credits
 * Only tops *up to* the allowance so it can't be farmed by spending early.
 */
export async function refreshFreeCredits(userId: string): Promise<void> {
  const target = TIER_LIMITS.free.monthlyCredits;

  await db
    .update(usageSchema)
    .set({
      oneTimeCreditsBalance: sql`GREATEST(${usageSchema.oneTimeCreditsBalance}, ${target})`,
    })
    .where(sql`${usageSchema.userId} = ${userId}`);
}
