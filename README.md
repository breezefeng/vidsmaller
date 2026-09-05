# VidSmaller

**Live: <https://vidsmaller.com>**

Cloud video compression — Next.js 16 + Tailwind, full stack in one repo.

The compression itself is done by the [FreeConvert API](https://www.freeconvert.com/api/v1/);
everything else (auth, credits, payments, quotas, download proxy, i18n, CMS, admin)
lives here.

Built on the [nexty.dev](https://nexty.dev) SaaS boilerplate.

---

## Architecture at a glance

```
browser                    vidsmaller (Next.js)              FreeConvert
   |                              |                               |
   |  1. POST /api/compress/jobs  |                               |
   |----------------------------->|  create job                   |
   |                              |   import/upload               |
   |                              |   -> compress                 |
   |                              |   -> export/url               |
   |                              |------------------------------>|
   |  { jobId, uploadUrl, params }|<------------------------------|
   |<-----------------------------|                               |
   |                                                              |
   |  2. POST the file straight to uploadUrl (multipart)          |
   |------------------------------------------------------------->|
   |                                                              |
   |  3. GET /api/compress/jobs/:id (poll)                        |
   |----------------------------->|  GET /process/jobs/:id        |
   |                              |------------------------------>|
   |                                                              |
   |  4. GET /api/compress/jobs/:id/download  (streamed proxy)    |
   |----------------------------->|------------------------------>|
```

### Why there is no S3 / R2 / OSS in the main path

videocompress.ai stages every upload in Alibaba OSS first. That is not necessary:
FreeConvert's `import/upload` task hands back a **per-job upload URL**, so the
browser can POST the file directly to the encoder. No bucket, no egress bill, no
copy of the user's footage on our side.

An **optional** Cloudflare R2 fallback exists (`lib/compress/staging.ts`) for the
one case direct upload cannot cover — a browser or corporate proxy blocking the
cross-origin POST. If `R2_*` is configured, the client detects the failure,
PUTs to a presigned R2 URL instead, and the job is recreated with `import/url`.
The staged object is deleted as soon as the job settles.

**Verified 2026-09-04:** the upload host responds with
`Access-Control-Allow-Origin: *`, so direct browser upload works and the R2
fallback is genuinely optional. Re-check any time with
`pnpm test:freeconvert ./some.mp4`.

---

## What videocompress.ai uses (for reference)

Reverse-engineered from their production bundle:

| Concern  | videocompress.ai                                                     | VidSmaller                                           |
| -------- | -------------------------------------------------------------------- | ---------------------------------------------------- |
| Frontend | Nuxt 3 (Vue), ~30 locales                                             | Next.js 16 (React), en / zh / ja                      |
| Login    | Google One Tap (`accounts.google.com/gsi/client`) + email&nbsp;OTP, own JWT backend | better-auth: Google, GitHub, magic link, email OTP    |
| Payment  | own `/api/billing/checkout` → hosted checkout in a popup, `/api/billing/portal` | Stripe / Creem / PayPal, all wired in the boilerplate |
| Storage  | Alibaba OSS staging                                                    | none in the default path (see above)                  |
| Logging  | Alibaba SLS (`us-west-1.log.aliyuncs.com`)                            | Pino + Sentry                                         |
| Engine   | FreeConvert                                                            | FreeConvert                                           |

---

## Setup

### 1. Install

```bash
pnpm install
cp .env.example .env.local
```

### 2. Database

Local Postgres via Docker:

```bash
pnpm db:up          # docker compose up -d   (port 5433)
pnpm db:push        # create tables
pnpm db:seed        # seed the pricing plans
```

**Production** is Supabase project `vidsmaller` (`twzvincfksdupxicwozb`, us-east-1),
sitting in the same region as Vercel's default `iad1` functions.

Use the **transaction pooler on 6543** — Supabase's free tier no longer exposes
IPv4 for direct connections, and `lib/db/config.ts` already sets `prepare: false`
on Vercel, which is exactly what pgbouncer transaction mode requires:

```
postgresql://postgres.twzvincfksdupxicwozb:<pw>@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

The Data API is deliberately **disabled** on that project. We talk to Postgres
directly through Drizzle and never use supabase-js, so leaving the auto-generated
REST API on would only expose `user`, `account`, `session` and friends for free.

To migrate production, point `DATABASE_URL` at the pooler and run
`pnpm db:push && pnpm db:seed`.

### 3. FreeConvert — done

API key `vidsmaller-prod` and a live webhook are already provisioned on the
account; both values are in `.env.local`.

- Keys: <https://www.freeconvert.com/account/api-tokens>
- Webhook: <https://www.freeconvert.com/account/webhooks> →
  `https://vidsmaller.com/api/webhooks/freeconvert` (job.created / success / failed)

The account is still on the **Free** plan (20 conversion minutes total), which
is enough to develop against. Upgrade before launch:
<https://www.freeconvert.com/pricing> — from $12.99/mo for 1,500 minutes.

Verify end to end at any time:

```bash
pnpm test:freeconvert ./sample.mp4
```

### 4. Auth — done

Google Cloud project `vidsmaller` (org `breezeszfeng-org`) is configured:

- OAuth client "VidSmaller Web" — origins `localhost:3000`, `vidsmaller.com`,
  `www.vidsmaller.com`; redirects `<origin>/api/auth/callback/google`
- Consent screen: External, non-sensitive scopes only
  (`openid`, `userinfo.email`, `userinfo.profile`) → no Google review needed
- Publishing status: **In production**. Any Google account can sign in; no
  Google review was required because only non-sensitive scopes are requested.

Still to add:

```env
RESEND_API_KEY=              # magic links / OTP emails
NEXT_PUBLIC_GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

### 5. Payments — done

Live Stripe products (account is HK, prices are USD):

| Product | Monthly | Yearly |
| --- | --- | --- |
| VidSmaller Pro | $9 | $90 |
| VidSmaller Max | $29 | $290 |
| VidSmaller 500 Credits | — | $12 one-time |

Webhook endpoint `https://vidsmaller.com/api/stripe/webhook` is registered for
the eight events `app/api/stripe/webhook/route.ts` actually handles.

`PLAN_TIER_MAP` maps plan uuids to compressor tiers and is already set for both
the `test` and `live` rows.

### 6. Email — needs DNS

`RESEND_API_KEY` is set and `vidsmaller.com` is registered with Resend, but the
domain is **unverified** until these three records exist. Until then no
magic-link or OTP mail can be delivered, and `ADMIN_EMAIL`
(`noreply@vidsmaller.com`) cannot send.

| Type | Name | Value | Priority |
| --- | --- | --- | --- |
| TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDoC0aY+buFKbb3LVVHYe7Vyw7T5jlTsffRzABc7uIKESlcbNlGGQMAcQrYnYJbHUFIbvXHew2mvqtiVnBlPLUyoGnmIsJRe4V37OMaae8MpprrQjs6B7TgyjXknCjauoAoP0LpkxgJ4oOcBqkYVRGHhckrMdg7Z+LzJ/exH4tBtwIDAQAB` | — |
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com` | 10 |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | — |

Then hit Verify in the Resend dashboard.

### 7. Run

```bash
pnpm dev
```

---

## Business rules

Everything tunable lives in **`config/compress.ts`**.

| Tier      | Max file | Batch | Credits/mo | Retention | H.265 |
| --------- | -------- | ----- | ---------- | --------- | ----- |
| anonymous | 200 MB   | 1     | –          | 2 h       | no    |
| free      | 1 GB     | 3     | 30         | 24 h      | no    |
| pro       | 5 GB     | 10    | 600        | 7 d       | yes   |
| max       | 10 GB    | 25    | 2,000      | 30 d      | yes   |

- Signed-out visitors get `ANONYMOUS_DAILY_LIMIT` (2) free jobs per day per IP,
  enforced through Upstash Redis. Without Redis the limiter fails open.
- **1 credit = 1 minute of source video** on H.264, 2 on H.265, 3 on AV1,
  minimum 1. Duration is read in the browser via `<video>` metadata; if that
  fails we fall back to charging by file size.
- Credits are charged when the job is created and **automatically refunded**
  (exactly once) if the provider reports failure.

## Compression modes

`lib/freeconvert/presets.ts` maps the UI onto FreeConvert's advanced options
(fetched from `GET /v1/query/options/compress?input_format=mp4`):

| UI mode       | FreeConvert `compress_video` | Key option                                        |
| ------------- | ---------------------------- | ------------------------------------------------- |
| Preset        | `by_percentage`              | `video_compress_quality_percentage` (70/50/30/15)  |
| Target size   | `by_size`                    | `video_compress_max_filesize` (MB)                 |
| Quality       | `by_video_quality`           | `video_compress_crf_x264` / `_x265` (18–51)        |
| Resolution    | `by_resolution`              | `video_compression_resolution_preset`              |
| Bitrate       | `by_max_bitrate`             | `video_compress_max_bitrate` (kbps)                |

## Key files

```
config/compress.ts                       tiers, limits, credit maths
lib/freeconvert/client.ts                typed FreeConvert API client
lib/freeconvert/presets.ts               settings schema -> job definition
lib/compress/quota.ts                    tier resolution + rate limiting
lib/compress/credits.ts                  charge / refund (userId-scoped)
lib/compress/service.ts                  provider sync, refunds, job view
lib/compress/staging.ts                  optional R2 fallback
lib/compress/client.ts                   browser upload + API helpers
app/api/compress/jobs/route.ts           POST create job
app/api/compress/jobs/[id]/route.ts      GET poll / PATCH uploaded / DELETE
app/api/compress/jobs/[id]/download/     streamed download proxy
app/api/compress/staging-url/route.ts    presigned R2 PUT (fallback)
app/api/webhooks/freeconvert/route.ts    HMAC-verified job events
components/compress/                     dropzone, settings, queue UI
```

## Verified in production (vidsmaller.com)

- [x] Google sign-in, including One Tap
- [x] Signup grant: new user received 30 credits
- [x] Real compression: 52.4 MB -> 23.9 MB (-54.5%), 1 credit charged
- [x] Direct browser -> FreeConvert upload (CORS confirmed `*`)
- [x] Pricing section reads live plans from Supabase

## TODO before launch

- [ ] Upgrade the FreeConvert plan (20 free minutes will run out fast)
- [ ] Publish the three Resend DNS records so email can actually send
- [ ] Test a real checkout once before announcing anything
- [ ] Set up Upstash Redis — without it the anonymous daily limit fails open,
      which matters the moment FreeConvert minutes cost money
- [ ] Replace `public/logo.png` / favicon with real branding
- [ ] Set up Upstash Redis (anonymous rate limiting is a no-op without it)
- [ ] Monthly cron calling `refreshFreeCredits` (lib/compress/signup-grant.ts)
- [ ] Programmatic SEO landing pages (`/compress-mp4`, `/compress-for-discord`, …)
- [ ] Decide on the desktop app angle — videocompress.ai ships an Electron build
