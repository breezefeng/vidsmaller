# VidSmaller

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

Run `pnpm test:freeconvert ./some.mp4` — it reports whether the upload host
sends CORS headers, which tells you if you need the fallback at all.

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

Or point `DATABASE_URL` at Supabase / Neon.

### 3. FreeConvert (required)

1. Sign up at <https://www.freeconvert.com/pricing> — the API needs a paid plan
   (from $12.99/mo for 1,500 conversion minutes).
2. Create an API key: <https://www.freeconvert.com/account/api>
3. Add a webhook pointing at `https://vidsmaller.com/api/webhooks/freeconvert`
   and copy its signing secret: <https://www.freeconvert.com/account/webhooks>

```env
FREECONVERT_API_KEY=...
FREECONVERT_WEBHOOK_SECRET=...
```

Verify end to end:

```bash
pnpm test:freeconvert ./sample.mp4
```

### 4. Auth

```env
BETTER_AUTH_SECRET=          # openssl rand -base64 32
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
RESEND_API_KEY=              # magic links / OTP emails
```

### 5. Payments

Create the products in Stripe, then paste the ids into
`lib/db/seed/pricing-config.ts`, duplicate each plan with `environment: 'live'`,
and run `pnpm db:seed` again.

Finally map plan ids to compressor tiers:

```env
PLAN_TIER_MAP=<pro-plan-uuid>:pro,<max-plan-uuid>:max
```

### 6. Run

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

## TODO before launch

- [ ] Buy a FreeConvert API plan and fill in the two env vars
- [ ] Create Stripe products, update `pricing-config.ts`, set `PLAN_TIER_MAP`
- [ ] Replace `public/logo.png` / favicon with real branding
- [ ] Set up Upstash Redis (anonymous rate limiting is a no-op without it)
- [ ] Programmatic SEO landing pages (`/compress-mp4`, `/compress-for-discord`, …)
- [ ] Decide on the desktop app angle — videocompress.ai ships an Electron build
