import { pricingPlans as pricingPlansSchema } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Which set of pricing rows this deployment talks to.
 *
 * Every plan is seeded twice — once for `test`, once for `live` — from a single
 * definition in lib/db/seed/pricing-config.ts. Both rows therefore carry the
 * *same* provider price ids, so any lookup by `stripePriceId` /
 * `creemProductId` / `paypalPlanId` must also filter on environment. Without
 * it `limit(1)` returns whichever row Postgres happens to yield first, and a
 * subscription can end up bound to the plan id of the wrong environment.
 */
export function currentPricingEnvironment(): 'live' | 'test' {
  return process.env.NODE_ENV === 'production' ? 'live' : 'test';
}

/** Drizzle predicate for the active environment. */
export function pricingEnvironmentFilter() {
  return eq(pricingPlansSchema.environment, currentPricingEnvironment());
}
