import 'server-only';

import { db } from '@/lib/db';
import {
  creditLogs as creditLogsSchema,
  usage as usageSchema,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export class InsufficientCreditsError extends Error {
  constructor(public required: number, public available: number) {
    super('INSUFFICIENT_CREDITS');
    this.name = 'InsufficientCreditsError';
  }
}

/**
 * Deduct credits for a specific user id (no session lookup),
 * so it can be called from webhooks and background sync.
 */
export async function chargeCredits(
  userId: string,
  amount: number,
  notes: string
): Promise<void> {
  if (amount <= 0) return;

  await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        oneTime: usageSchema.oneTimeCreditsBalance,
        sub: usageSchema.subscriptionCreditsBalance,
      })
      .from(usageSchema)
      .where(eq(usageSchema.userId, userId))
      .for('update');

    const row = rows[0];
    const available = (row?.oneTime ?? 0) + (row?.sub ?? 0);
    if (!row || available < amount) {
      throw new InsufficientCreditsError(amount, available);
    }

    const fromSub = Math.min(row.sub, amount);
    const fromOneTime = amount - fromSub;
    const newSub = row.sub - fromSub;
    const newOneTime = row.oneTime - fromOneTime;

    await tx
      .update(usageSchema)
      .set({
        subscriptionCreditsBalance: newSub,
        oneTimeCreditsBalance: newOneTime,
      })
      .where(eq(usageSchema.userId, userId));

    await tx.insert(creditLogsSchema).values({
      userId,
      amount: -amount,
      oneTimeCreditsSnapshot: newOneTime,
      subscriptionCreditsSnapshot: newSub,
      type: 'feature_usage',
      notes,
    });
  });
}

/** Give credits back when a job fails on the provider side. */
export async function refundCredits(
  userId: string,
  amount: number,
  notes: string
): Promise<void> {
  if (amount <= 0) return;

  await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        oneTime: usageSchema.oneTimeCreditsBalance,
        sub: usageSchema.subscriptionCreditsBalance,
      })
      .from(usageSchema)
      .where(eq(usageSchema.userId, userId))
      .for('update');

    const row = rows[0];
    if (!row) return;

    const newSub = row.sub + amount;

    await tx
      .update(usageSchema)
      .set({ subscriptionCreditsBalance: newSub })
      .where(eq(usageSchema.userId, userId));

    await tx.insert(creditLogsSchema).values({
      userId,
      amount,
      oneTimeCreditsSnapshot: row.oneTime,
      subscriptionCreditsSnapshot: newSub,
      type: 'feature_refund',
      notes,
    });
  });
}
