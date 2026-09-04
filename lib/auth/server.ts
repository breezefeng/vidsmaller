import 'server-only';

import { auth } from "@/lib/auth";
import { db } from '@/lib/db';
import { user as userSchema } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { headers } from "next/headers";
import { redirect } from 'next/navigation';

type RawSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/**
 * better-auth >= 1.7 stopped inferring plugin/additional columns into the
 * session type, so we widen it here once instead of casting at every call site.
 */
export type SessionUser = RawSession['user'] & {
  role?: 'user' | 'admin' | null;
  banned?: boolean | null;
  banReason?: string | null;
  banExpires?: Date | null;
  isAnonymous?: boolean | null;
  stripeCustomerId?: string | null;
};

export type AppSession = Omit<RawSession, 'user'> & { user: SessionUser };

export const getSession = async (): Promise<AppSession | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  return (session as AppSession | null) ?? null;
};

export const isAdmin = async (): Promise<boolean> => {
  const session = await getSession()
  const user = session?.user;
  if (!user) {
    redirect('/login');
  }

  const userDataResults = await db
    .select({ role: userSchema.role })
    .from(userSchema)
    .where(eq(userSchema.id, user.id))
    .limit(1);

  const userData = userDataResults[0];
  return !!userData && userData.role === 'admin';
}