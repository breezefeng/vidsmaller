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

### Why every upload is staged in R2 first

> Reversed 2026-09-06. This used to say "there is no S3 / R2 / OSS in the main
> path" and treated staging as an optional fallback. Billing data killed that
> design — see docs/freeconvert-benchmark.md.

FreeConvert bills per *task*, rounded up, with a one-minute floor each:

```
job_minutes = Σ over tasks: max(1, ceil(task_seconds / 60))
```

The `import` task is metered by **wall clock**, so a browser POSTing straight to
the encoder bills us for the visitor's uplink. The same 600 MB file costs 1
conversion minute at 10 MB/s and **10 minutes at 1 MB/s** — a variable we do not
control and cannot see.

Staging in R2 moves that time off their meter. The browser PUTs to our bucket
(not billed by FreeConvert), then `import/url` pulls server-to-server from the
Cloudflare edge. Measured on a 593 MB file:

| | import | compress | export | billed |
| --- | --- | --- | --- | --- |
| browser → FreeConvert | 127.8 s → 3 | 81 s → 2 | → 1 | **6 min** |
| browser → R2 → FreeConvert | 18.3 s → 1 | 81 s → 2 | → 1 | **4 min** |

R2 egress is free, so the 33% saving costs nothing. It also removed a silent
waste in the old fallback: it created a job, tried the direct upload, and on
failure created a *second* job — burning a full set of operations on the
abandoned one.

The staged object is deleted as soon as the job settles, with an R2 lifecycle
rule as backstop (see §8).

---

## What videocompress.ai uses (for reference)

Reverse-engineered from their production bundle:

| Concern  | videocompress.ai                                                     | VidSmaller                                           |
| -------- | -------------------------------------------------------------------- | ---------------------------------------------------- |
| Frontend | Nuxt 3 (Vue), ~30 locales                                             | Next.js 16 (React), en / zh / ja                      |
| Login    | Google One Tap (`accounts.google.com/gsi/client`) + email&nbsp;OTP, own JWT backend | better-auth: Google, GitHub, magic link, email OTP    |
| Payment  | own `/api/billing/checkout` → hosted checkout in a popup, `/api/billing/portal` | Stripe / Creem / PayPal, all wired in the boilerplate |
| Storage  | Alibaba OSS staging                                                    | none for video; R2 for avatars / blog images          |
| Logging  | Alibaba SLS (`us-west-1.log.aliyuncs.com`)                            | Pino + Sentry                                         |
| Engine   | FreeConvert                                                            | FreeConvert                                           |

---

## Setup

### 1. Install

```bash
pnpm install
cp .env.example .env.local
```

### 1b. Where environment variables actually live

**The local files are the source of truth. Vercel is a write-only projection of
them.** Every production variable is stored on Vercel as `type: sensitive`, so
`vercel env pull` and even `GET /v9/projects/:id/env?decrypt=true` return empty
strings. Nothing you put there can ever be read back.

| File | Role | In git? |
| --- | --- | --- |
| `.env.local` | 26 of the 28 production values, plus local-only dev toggles | no |
| `.env.production.snapshot` | overlay: only the values that differ in production | no |
| `.env.example` | key names, no values | yes |

```bash
pnpm env:check   # compare key sets local vs Vercel, flag drift (read-only)
pnpm env:push    # push .env.local + overlay -> Vercel production
```

Both read `scripts/lib/env-source.mjs`. Values are sent over stdin (never argv,
so they stay out of `ps`), and a push is refused outright if any value is empty,
still holds a `<pw>` placeholder, or points at localhost. `env:push` also takes
`--dry-run`.

Six keys are deliberately never published: `VERCEL_OIDC_TOKEN` (minted per
deployment) and five `NEXT_PUBLIC_*` dev toggles whose production behaviour is
the code default.

Env changes only affect **new** builds — redeploy after pushing.

The boilerplate's `env:sync` / `env:clear` scripts (push every secret to GitHub
Actions) were removed: this repo has no `.github/workflows/`, so nothing consumed
them, and keeping a one-command path to publish live Stripe and Resend keys was
more risk than it was worth. Recover them from git history if CI ever lands.

Both files are untracked and exist only on one machine. `.env.local` is the
recovery point for the whole production environment; back it up somewhere real
(password manager, encrypted archive), not just on this laptop.

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

### 6. Email — done, both directions

> Corrected 2026-09-06. This section said the three Resend records were missing
> and that no mail could be delivered. They are published and the domain is
> verified — confirmed by `dig` and by `GET api.resend.com/domains`
> (`status: verified`, `sending: enabled`). Don't trust a TODO you haven't
> re-measured.

**Outbound works.** `vidsmaller.com` is verified with Resend, so magic links,
OTP codes and `ADMIN_EMAIL` (`noreply@vidsmaller.com`) all send. The three
records now live on the zone:

| Type | Name | Value | Priority |
| --- | --- | --- | --- |
| TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDoC0aY+buFKbb3LVVHYe7Vyw7T5jlTsffRzABc7uIKESlcbNlGGQMAcQrYnYJbHUFIbvXHew2mvqtiVnBlPLUyoGnmIsJRe4V37OMaae8MpprrQjs6B7TgyjXknCjauoAoP0LpkxgJ4oOcBqkYVRGHhckrMdg7Z+LzJ/exH4tBtwIDAQAB` | — |
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com` | 10 |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | — |

**Inbound works too, as of 2026-09-06.** `support@vidsmaller.com` is printed on
the About page and all three legal pages, and until that day the root domain had
no MX at all, so every one of those invitations bounced. It now forwards to
`breezeszfeng@gmail.com` through **Cloudflare Email Routing** (account-level UI:
Email Service → Email Routing; the old per-zone `/email/routing` URL redirects).

Resend was not an option for the inbound half: this domain's `receiving`
capability is `disabled`, and Resend's inbound product delivers to a webhook,
which would mean writing a forwarding service just to read support mail.

| Record | Owner | Note |
| --- | --- | --- |
| MX `vidsmaller.com` → `route1/2/3.mx.cloudflare.net` (89/40/47) | Email Routing | locked by Cloudflare |
| TXT `vidsmaller.com` → `v=spf1 include:_spf.mx.cloudflare.net ~all` | Email Routing | |
| TXT `cf2024-1._domainkey` | Email Routing | Cloudflare's own DKIM |
| MX/TXT on `send.` + `resend._domainkey` | Resend | untouched |

The two halves do not collide: Resend's SPF and MX live on `send.`, and SPF is
checked against the Return-Path domain, so root SPF listing only Cloudflare does
not affect Resend's outbound.

To add `billing@` or similar later: Email Routing → the zone → 路由规则 →
创建路由规则. A destination address that equals the Cloudflare account's own
login email is auto-verified, so no confirmation click is needed for it.

Verify the whole chain from a shell:

```bash
dig +short MX vidsmaller.com                      # expect the three route*.mx hosts
curl -s -H "Authorization: Bearer $RESEND_API_KEY" \
     https://api.resend.com/emails/<id> | jq .last_event
```

**If mail to an address silently stops arriving, check the suppression list
before anything else:**

```bash
curl -s -H "Authorization: Bearer $RESEND_API_KEY" https://api.resend.com/suppressions
curl -s -X DELETE -H "Authorization: Bearer $RESEND_API_KEY" \
     https://api.resend.com/suppressions/<id>
```

One hard bounce puts the recipient on that list permanently and every later send
returns `last_event: suppressed` — no error, no delivery. It bit us during this
setup: a test sent while Cloudflare was still syncing got `550 5.1.1 Address
does not exist`, and the retry after the fix was suppressed rather than sent.
The entry has been removed.

**Replying as support@ is configured too.** Gmail (breezeszfeng@gmail.com) has
`VidSmaller Support <support@vidsmaller.com>` under 账号和导入 → 用其他地址发送邮件,
relaying through Resend:

| Field | Value |
| --- | --- |
| SMTP server | `smtp.resend.com` |
| Port / security | 587, STARTTLS |
| Username | `resend` |
| Password | `RESEND_API_KEY` |

回复邮件时 is set to **用此相同地址回复**, not the default address — without that,
hitting reply on a support mail would quietly answer from the personal Gmail
address, which defeats the whole setup.

Verified end to end 2026-09-06: mail to support@ → forwarded to the Gmail inbox
→ reply auto-selected `VidSmaller Support <support@vidsmaller.com>` → delivered
and displayed under that identity.

One quirk worth knowing: Gmail prefills the SMTP server by guessing from the
domain's MX, so it offered `route2.mx.cloudflare.net`. That is the *inbound*
host and would never have worked — it has to be overwritten with
`smtp.resend.com`.

### 7. Rate limiting — done

`UPSTASH_REDIS_REST_*` point at the **shared** `videocompress-waitlist` instance
(`adapting-llama-169809`, us-east-1). The Upstash free tier allows only one
database per account, and every key this app writes is namespaced under
`vidsmaller:` via `LOWER_CASE_SITE_NAME`, so the two projects cannot collide.

Quota is 500K commands/month against a handful of commands per compression, so
sharing is comfortable for now. Split it out if either project gets busy.

Without these vars `checkRateLimit` **fails open** — the anonymous daily cap
silently stops existing. Verified in production: request 3 of 4 is rejected with
"Free daily limit reached".

### 8. Cloudflare R2 — done

R2 is **on the critical path for every compression** (see "Why every upload is
staged in R2 first" above), and also carries user avatars and the admin
blog/glossary image picker. Without `R2_*` set, every avatar upload fails with
"Failed to upload avatar" — and because the server action returns early, the
Full Name change is silently dropped with it.

| Var | Value |
| --- | --- |
| `R2_ACCOUNT_ID` | `807a23a72068c63cfd42b6a8a196013a` |
| `R2_BUCKET_NAME` | `vidsmaller` (APAC, created Sep 5 2026) |
| `R2_PUBLIC_URL` | `https://cdn.vidsmaller.com` |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | account token `vidsmaller-app`, Object Read & Write, scoped to the `vidsmaller` bucket only |

`cdn.vidsmaller.com` is an R2 **custom domain** (auto-created CNAME on the
vidsmaller.com zone), not the rate-limited `*.r2.dev` URL, so objects are served
and cached at the Cloudflare edge.

#### Bucket configuration (not in code — set it in the dashboard)

Two bucket-level settings the app depends on. Neither can be managed by the
running code: `R2_ACCESS_KEY_ID` is scoped *Object Read & Write*, so
`PutBucketCors` / `PutBucketLifecycleConfiguration` both return `AccessDenied`.
Changing them needs the dashboard or a separate Admin-scoped token.

**1. CORS policy** — R2 → `vidsmaller` → Settings → CORS Policy

```json
[
  {
    "AllowedOrigins": [
      "https://vidsmaller.com",
      "https://www.vidsmaller.com",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

**A new bucket has no CORS policy, and without one every staged upload fails.**
The browser's preflight gets:

```
OPTIONS → 403  <Code>Unauthorized</Code>
              <Message>CORS not configured for this bucket</Message>
```

which surfaces to the user as *"Staged upload failed. Check your network and
retry."* This took production down on 2026-09-06: staging had just been promoted
from fallback to default, and the end-to-end test used `node fetch`, which does
not send a preflight. **Any change to the upload path has to be exercised in a
real browser** — `node` will happily pass a test the browser cannot.

Add a new origin here whenever the site gains a domain (Vercel preview URLs are
not covered).

**2. Object lifecycle rule** — same settings page

| Rule | Prefix | Action |
| --- | --- | --- |
| `expire-compress-input` | `compress-input/` | delete 1 day after upload |

`syncJob` deletes the staged object when a job reaches a terminal state, but
there are paths it never reaches: the visitor closes the tab, the upload aborts,
or the job fails before creation. Two 60 MB orphans showed up during a single
afternoon of testing. The rule is the backstop.

Check both with `node scripts/r2-staging-check.mjs` — it lists what is sitting in
`compress-input/` and flags anything older than the lifecycle window.

#### Other gotchas

- `next.config.mjs` reads `R2_PUBLIC_URL` at **build** time to build
  `images.remotePatterns`. Changing it requires a redeploy, not just an env update.
- Enabling R2 requires a payment method on the Cloudflare account even though
  the free tier (10 GB, 1M class-A, 10M class-B per month) covers this workload
  many times over.
- `import/url` is handed the **public** `cdn.vidsmaller.com` URL, not a presigned
  one. Presigned URLs do not survive third-party HTTP clients: the AWS SDK signs
  non-standard query params (`x-id`, `x-amz-checksum-mode`) and dropping *any* of
  them yields `SignatureDoesNotMatch`. FreeConvert normalises the URL and strips
  them, so every staged import 403'd. Confidentiality now rests on the key being
  unguessable (v4 UUID, 122 bits) plus prompt deletion.

### 9. Run

```bash
pnpm dev
```

---

## Business rules

Everything tunable lives in **`config/compress.ts`**.

| Tier      | Promised | **Effective** | Batch | Credits/mo | Retention | H.265 |
| --------- | -------- | ------------- | ----- | ---------- | --------- | ----- |
| anonymous | 200 MB   | 200 MB        | 1     | –          | 2 h       | no    |
| free      | 1 GB     | 1 GB          | 3     | 30         | 24 h      | no    |
| pro       | 5 GB     | **1.4 GB**    | 10    | 600        | 7 d       | yes   |
| max       | 10 GB    | **1.4 GB**    | 25    | 2,000      | 30 d      | yes   |

`TIER_LIMITS` holds the *product promise*; `PROVIDER_MAX_FILE_SIZE` is what the
FreeConvert plan we pay for will actually accept. Every size check goes through
`effectiveMaxFileSize()` — `min()` of the two — so we can never take money for a
job the provider is guaranteed to reject. Upgrading is one word: flip
`PROVIDER_PLAN` to `'pro'` and the 5 GB promise comes back on its own.

**The `max` tier is switched off** in `lib/db/seed/pricing-config.ts` until then:
its headline is 10 GB per file, which the current plan cannot deliver.

- Signed-out visitors get `ANONYMOUS_DAILY_LIMIT` (2) free jobs per day per IP,
  enforced through Upstash Redis. Without Redis the limiter fails open.
- A second, account-wide gate (`lib/compress/budget.ts`) ring-fences
  `FREE_TRAFFIC_BUDGET_SHARE` (60%) of the daily conversion-minute pool for
  anonymous + free traffic, so a spike cannot starve paying customers mid-month.
  Tune without a deploy via `FC_FREE_DAILY_MINUTES`.
- **1 credit = 1 minute of source video** on H.264, 2 on H.265, 3 on AV1,
  **minimum 3**. Duration is read in the browser via `<video>` metadata; if that
  fails we fall back to charging by file size.
  The floor is 3 because the provider's own floor is 3 (one minute per task ×
  import + compress + export). Charging 1 credit for a short clip was a
  guaranteed loss: 600 one-minute clips on the $9 Pro plan burned ~1800
  conversion minutes ($13.50) for $9 of revenue.
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
lib/compress/staging.ts                  R2 staging (default upload path)
lib/compress/budget.ts                   account-wide conversion-minute budget
lib/compress/client.ts                   browser upload + API helpers
app/api/compress/jobs/route.ts           POST create job
app/api/compress/jobs/[id]/route.ts      GET poll / PATCH uploaded / DELETE
app/api/compress/jobs/[id]/download/     streamed download proxy
app/api/compress/staging-url/route.ts    presigned R2 PUT (default path)
app/api/webhooks/freeconvert/route.ts    HMAC-verified job events
components/compress/                     dropzone, settings, queue UI
```

## Verified in production (vidsmaller.com)

- [x] Google sign-in, including One Tap
- [x] Signup grant: new user received 30 credits
- [x] Real compression: 52.4 MB -> 23.9 MB (-54.5%), 1 credit charged
- [x] Pricing section reads live plans from Supabase
- [x] Live Stripe checkout session ($9 USD, correct live plan id in metadata)
- [x] Anonymous rate limit enforced (2/day per IP)
- [x] Avatar upload -> R2, served from `cdn.vidsmaller.com`

Re-verified 2026-09-06 after the switch to R2 staging, **from a real browser**
(`node fetch` skips the CORS preflight and cannot prove this path works):

- [x] CORS preflight `OPTIONS` -> 204 with `Allow-Origin/Methods/Headers`
- [x] Cross-origin `PUT` browser -> R2 -> 200
- [x] `import/url` pulls from `cdn.vidsmaller.com` -> 200, byte-exact
- [x] Full job: staging-url -> R2 -> create -> compress -> completed
- [x] Oversize upload rejected with 413 at the clamped 1.4 GB ceiling
- [x] `provider_billed_minutes` persisted; estimator matches actuals
      (59 MB/1 min -> 3, 593 MB/10 min -> 4)

## TODO before launch

- [ ] Upgrade the FreeConvert plan (20 free minutes will run out fast)
- [x] Publish the three Resend DNS records so email can actually send
- [x] Point `support@vidsmaller.com` at a real inbox — Cloudflare Email Routing
      → breezeszfeng@gmail.com, verified end to end 2026-09-06
- [ ] Test a real checkout once before announcing anything
- [ ] Upgrade FreeConvert — this is now the only thing gating real traffic
- [ ] Replace `public/logo.png` / favicon with real branding
- [ ] Set up Upstash Redis (anonymous rate limiting is a no-op without it)
- [ ] Monthly cron calling `refreshFreeCredits` (lib/compress/signup-grant.ts)
- [ ] Programmatic SEO landing pages (`/compress-mp4`, `/compress-for-discord`, …)
- [ ] Decide on the desktop app angle — videocompress.ai ships an Electron build
