import { sendEmail } from "@/actions/resend";
import { siteConfig } from "@/config/site";
import { grantSignupCredits } from "@/lib/compress/signup-grant";
import MagicLinkEmail from '@/emails/magic-link-email';
import OTPCodeEmail from '@/emails/otp-code-email';
import { UserWelcomeEmail } from "@/emails/user-welcome";
import { db } from "@/lib/db";
import { account, session, user, verification } from "@/lib/db/schema";
import {
  buildUserSourceData,
  parseTrackingCookie,
  saveUserSource,
  TRACKING_COOKIE_NAME,
} from "@/lib/tracking/server";
import { isTrackingEnabled } from "@/lib/tracking/shared";
import { redis } from "@/lib/upstash";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin, anonymous, captcha, emailOTP, lastLoginMethod, magicLink, oneTap } from "better-auth/plugins";
import { cookies } from "next/headers";

export const auth = betterAuth({
  appName: siteConfig.name,
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL || process.env.NEXT_PUBLIC_SITE_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
    // Use Cloudflare IP header for accurate IP detection
    ipAddress: {
      ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for", "x-real-ip"],
    },
  },
  // IP-based rate limiting configuration
  rateLimit: {
    enabled: process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_RATE_LIMIT_ENABLED === 'true',
    window: 60, // 60 seconds default window
    max: 100, // 100 requests per window (global default)
    customRules: {
      "/get-session": false,
      "/sign-in/magic-link": {
        window: 60, // 60 seconds
        max: 3, // Max 3 magic link requests per 60 seconds
      },
      "/email-otp/send-verification-otp": {
        window: 60,
        max: 3,
      },
      "/sign-in/email-otp": {
        window: 60,
        max: 5,
      },
    },
    // Use Upstash Redis for rate limit storage (works with serverless).
    // better-auth >= 1.7 requires an atomic `consume` implementation.
    ...(redis && {
      customStorage: {
        consume: async (key: string, rule: { window: number; max: number }) => {
          const count = await redis!.incr(key);
          if (count === 1) {
            await redis!.expire(key, rule.window);
          }
          if (count > rule.max) {
            const ttl = await redis!.ttl(key);
            return {
              allowed: false,
              retryAfter: ttl && ttl > 0 ? ttl : rule.window,
            };
          }
          return { allowed: true, retryAfter: null };
        },
      },
    }),
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 10 * 60, // Cache duration in seconds
    },
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    // freshAge: 0
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google', 'github'],
    },
  },
  user: {
    deleteUser: {
      enabled: true,
    },
    // Surface the `role` column on the session user (the admin plugin writes it,
    // but better-auth >= 1.7 no longer infers it into the session type).
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        input: false,
        defaultValue: 'user',
      },
    },
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: user,
      session: session,
      account: account,
      verification: verification,
    },
  }),
  // Register a provider only when its credentials exist, otherwise better-auth
  // logs a warning on every request and the UI offers a button that always fails.
  socialProviders: {
    ...(process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? {
        github: {
          clientId: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
        },
      }
      : {}),
    ...(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
        google: {
          clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      }
      : {}),
  },
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          // Seed the credit ledger so the first compression works right away.
          await grantSignupCredits(createdUser.id);

          const cookieStore = await cookies();

          // Only track user source if enabled via environment variable
          const isTrackingEnabledValue = await isTrackingEnabled()
          if (isTrackingEnabledValue) {
            try {
              const trackingCookie = cookieStore.get(TRACKING_COOKIE_NAME);
              const clientData = parseTrackingCookie(trackingCookie?.value);

              const sourceData = await buildUserSourceData(createdUser.id, clientData || undefined);
              await saveUserSource(sourceData);

              cookieStore.delete(TRACKING_COOKIE_NAME);
            } catch (error) {
              console.error('Failed to save user source data:', error);
            }
          }

          // Send welcome email
          if (createdUser.email) {
            try {
              const unsubscribeToken = Buffer.from(createdUser.email).toString('base64');
              const unsubscribeLink = `${process.env.NEXT_PUBLIC_SITE_URL}/unsubscribe/newsletter?token=${unsubscribeToken}`;

              await sendEmail({
                email: createdUser.email,
                subject: `Welcome to ${siteConfig.name}!`,
                react: UserWelcomeEmail,
                reactProps: {
                  name: createdUser.name,
                  email: createdUser.email,
                  unsubscribeLink: unsubscribeLink,
                },
                isAddContacts: true
              });
              console.log(`Welcome email sent to ${createdUser.email}`);
            } catch (error) {
              console.error('Failed to send welcome email:', error);
            }
          }
        },
      },
    },
  },
  trustedOrigins: process.env.NODE_ENV === 'development' ? [process.env.NEXT_PUBLIC_SITE_URL!, 'http://localhost:3000'] : [process.env.NEXT_PUBLIC_SITE_URL!],
  plugins: [
    ...(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? [oneTap()] : []),
    ...(process.env.TURNSTILE_SECRET_KEY ? [captcha({
      provider: "cloudflare-turnstile",
      secretKey: process.env.TURNSTILE_SECRET_KEY,
    })] : []),
    magicLink({
      sendMagicLink: async ({ email, url, token }) => {
        const result = await sendEmail({
          email,
          subject: `Sign in to ${siteConfig.name}`,
          react: MagicLinkEmail,
          reactProps: {
            url
          }
        })
        // Without this the endpoint answers 200 while nothing was delivered,
        // and the user just stares at an empty inbox.
        if (result && !result.success) {
          throw new Error(result.error || 'Failed to send magic link email')
        }
      },
      expiresIn: 60 * 5,
    }),
    emailOTP({
      otpLength: 6,
      expiresIn: 60 * 10, // 10 minutes
      sendVerificationOTP: async ({ email, otp, type }) => {
        const result = await sendEmail({
          email,
          subject: `Your ${siteConfig.name} verification code: ${otp}`,
          react: OTPCodeEmail,
          reactProps: {
            otp,
            type
          }
        })
        if (result && !result.success) {
          throw new Error(result.error || 'Failed to send verification code')
        }
      },
    }),
    lastLoginMethod(),
    admin(),
    anonymous(),
    nextCookies() // make sure this is the last plugin in the array
  ]
});