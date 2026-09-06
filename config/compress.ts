/**
 * Product-level configuration for the video compressor.
 * Keep every tunable number here so pricing / limits can be changed in one place.
 */

export const VIDEO_INPUT_FORMATS = [
  'mp4',
  'mov',
  'mkv',
  'avi',
  'webm',
  'flv',
  'wmv',
  'm4v',
  'mpeg',
  'mpg',
  '3gp',
  'ts',
  'mts',
  'm2ts',
  'ogv',
  'asf',
  'rm',
  'rmvb',
  'vob',
  'divx',
  'f4v',
  'swf',
] as const;

export type VideoInputFormat = (typeof VIDEO_INPUT_FORMATS)[number];

export const VIDEO_OUTPUT_FORMATS = ['mp4', 'mkv', 'webm', 'mov'] as const;
export type VideoOutputFormat = (typeof VIDEO_OUTPUT_FORMATS)[number];

export const ACCEPTED_MIME = 'video/*';

/* ------------------------------------------------------------------ */
/* Plan limits                                                         */
/* ------------------------------------------------------------------ */

export type PlanTier = 'anonymous' | 'free' | 'pro' | 'max';

export interface TierLimits {
  /** hard cap for a single upload, in bytes */
  maxFileSize: number;
  /** how many files can be queued in one batch */
  maxBatchFiles: number;
  /** monthly credits granted (informational; real grants come from pricing_plans) */
  monthlyCredits: number;
  /** how long finished files stay downloadable, in hours */
  retentionHours: number;
  /** allow the slower / stronger codecs */
  allowAdvancedCodecs: boolean;
}

export const GB = 1024 * 1024 * 1024;
export const MB = 1024 * 1024;

export const TIER_LIMITS: Record<PlanTier, TierLimits> = {
  anonymous: {
    maxFileSize: 200 * MB,
    maxBatchFiles: 1,
    monthlyCredits: 0,
    retentionHours: 2,
    allowAdvancedCodecs: false,
  },
  free: {
    maxFileSize: 1 * GB,
    maxBatchFiles: 3,
    monthlyCredits: 30,
    retentionHours: 24,
    allowAdvancedCodecs: false,
  },
  pro: {
    maxFileSize: 5 * GB,
    maxBatchFiles: 10,
    monthlyCredits: 600,
    retentionHours: 24 * 7,
    allowAdvancedCodecs: true,
  },
  max: {
    maxFileSize: 10 * GB,
    maxBatchFiles: 25,
    monthlyCredits: 2000,
    retentionHours: 24 * 30,
    allowAdvancedCodecs: true,
  },
};

/**
 * Free daily compressions for signed-out visitors (per IP).
 *
 * Raised from 2 on 2026-09-06. Two is below the point where a first-time
 * visitor can try the thing twice and still have a go at their real file, and
 * the competitor we benchmark against (videocompress.ai) lets an anonymous
 * visitor run at least six in a row with no gate at all.
 *
 * This can be loosened safely because it is not the real protection:
 * FREE_DAILY_MINUTE_BUDGET caps the whole site's anonymous spend regardless
 * of how many IPs show up. This number only shapes single-visitor behaviour.
 */
export const ANONYMOUS_DAILY_LIMIT = 4;

/* ------------------------------------------------------------------ */
/* Upstream provider ceiling                                           */
/* ------------------------------------------------------------------ */

/**
 * TIER_LIMITS above are *product promises*. This block is what FreeConvert
 * will actually accept on the plan we pay for. Every size check must go
 * through `effectiveMaxFileSize()` so we never take money for a job the
 * provider is guaranteed to reject.
 *
 * Upgrading is a one-word change: flip PROVIDER_PLAN to 'pro' and the Pro
 * tier's advertised 5 GB comes back automatically.
 *
 * Measured 2026-09-06, see docs/freeconvert-benchmark.md.
 */
export const PROVIDER_PLANS = {
  /** 20 conv-min/day AND ~10 operations/day == 3 jobs/day. Cannot serve traffic. */
  free: { maxFileSize: 1 * GB, monthlyMinutes: 0, usd: 0 },
  basic: { maxFileSize: 1.5 * GB, monthlyMinutes: 1500, usd: 12.99 },
  standard: { maxFileSize: 2 * GB, monthlyMinutes: 2000, usd: 24.99 },
  pro: { maxFileSize: 5 * GB, monthlyMinutes: 4000, usd: 29.99 },
} as const;

export type ProviderPlan = keyof typeof PROVIDER_PLANS;

/** The FreeConvert plan currently paid for. */
export const PROVIDER_PLAN: ProviderPlan = 'basic';

/**
 * Never offer the provider's exact ceiling — container overhead and their
 * rounding both bite at the boundary.
 */
export const PROVIDER_SIZE_HEADROOM = 100 * MB;

export const PROVIDER_MAX_FILE_SIZE =
  PROVIDER_PLANS[PROVIDER_PLAN].maxFileSize - PROVIDER_SIZE_HEADROOM;

/** What a tier can *actually* upload right now. */
export function effectiveMaxFileSize(tier: PlanTier): number {
  return Math.min(TIER_LIMITS[tier].maxFileSize, PROVIDER_MAX_FILE_SIZE);
}

/** True when the provider plan is the thing capping this tier, not our own limit. */
export function isProviderCapped(tier: PlanTier): boolean {
  return PROVIDER_MAX_FILE_SIZE < TIER_LIMITS[tier].maxFileSize;
}

/* ------------------------------------------------------------------ */
/* Conversion-minute budget                                            */
/* ------------------------------------------------------------------ */

/**
 * FreeConvert bills "conversion minutes" = server-side processing wall clock,
 * pooled across the whole account. Calibrated against the live API:
 *
 *   compress_seconds ≈ 6.1 + 0.1191 × source_seconds   (1080p, libx264, medium)
 *
 * i.e. ~8.4x realtime. Raw data: scripts/fc-benchmark-results.jsonl
 */
export const PROVIDER_JOB_OVERHEAD_SECONDS = 6.1;
export const PROVIDER_SECONDS_PER_SOURCE_SECOND = 0.1191;

/**
 * The fit above was measured on generated test footage (testsrc2 + a sine
 * tone). Real files cost more: the encoder has actual detail and grain to
 * describe, and the decoder has a real stream to read.
 *
 * Measured on real user jobs, all 720p at speed=faster, cost per second of
 * source video (scripts/fc-real-job-costs.jsonl):
 *
 *   8.5 min,  54 MB, 0.86 Mbps -> 0.041 s/s   (mean of 3 runs)
 *   80  min, 363 MB, 0.60 Mbps -> 0.064 s/s
 *   46  min, 702 MB, 2.12 Mbps -> 0.139 s/s
 *
 * The model above predicts 0.048 s/s for all three. So real content runs
 * 0.85x to 2.9x the synthetic fit, median 1.33x. That is the factor below.
 *
 * The spread is not modelling error to be tuned away: the same file at the
 * same settings has been measured at 16.5s and 45s depending on which machine
 * the provider picks. Which is why credits are settled against the provider's
 * own meter when the job finishes (lib/compress/service.ts) instead of trusting
 * this number.
 */
export const PROVIDER_REAL_CONTENT_FACTOR = 1.35;

/**
 * Extra headroom applied when the number is used to *charge* rather than to
 * predict. Puts the estimate near the top of the observed spread, so a job is
 * held against enough credits and the free pool is never short. Anything not
 * used comes back to the user at settlement.
 */
export const PROVIDER_ESTIMATE_HEADROOM = 1.5;

/**
 * Export writes the finished file into our bucket, so it scales with the
 * output, and it is not the free task the old model assumed.
 *
 * Measured (output size -> export seconds): 337 MB -> 61.1s, 178 MB -> 18.2s,
 * 178 MB -> 11.6s, 178 MB -> 6.6s, 25 MB -> 0.2-1.5s. The 337 MB one cost two
 * billed minutes on its own while the model charged one.
 */
export const PROVIDER_EXPORT_MBPS = 6;

/** Measured: libx265 is 3.77x slower than libx264 at the same resolution. */
export const PROVIDER_CODEC_FACTOR: Record<string, number> = {
  libx264: 1,
  h264_nvenc: 1,
  libx265: 3.77,
  hevc_nvenc: 3.77,
  av1_nvenc: 6,
};

/**
 * x264 preset multipliers, applied to the per-second term.
 *
 * Measured on the provider, same 8.5-minute 720p file three times
 * (scripts/fc-speed-preset-results.jsonl, 2026-09-06):
 *
 *   medium 61.7s · fast 43.2s (0.70x) · faster 27.3s (0.44x)
 *
 * veryfast and slow have never been run upstream; those two are extrapolated
 * from x264's own ladder and marked as such.
 */
export const PROVIDER_SPEED_FACTOR: Record<string, number> = {
  veryfast: 0.3, // extrapolated
  faster: 0.44,
  fast: 0.7,
  medium: 1,
  slow: 1.7, // extrapolated
};

/**
 * Encode cost tracks pixel count — but far less than pixel count alone would
 * suggest, because the pipeline is not purely encode-bound.
 *
 * Measured against the 1080p anchor above, same provider, same day: a 720p
 * source of 507.6s took 61.7s at speed=medium, i.e.
 *
 *   (61.7 - 6.1) / (0.1191 x 507.6) = 0.92
 *
 * (4K factor 3.85x verified locally with the same encoder + settings.)
 */
export function providerHeightFactor(height: number): number {
  if (height >= 2160) return 3.85;
  if (height >= 1440) return 1.78;
  if (height >= 1080) return 1;
  return 0.92;
}

/**
 * Fallback for when the browser could not tell us the frame size: infer it
 * from bitrate. Deliberately kept, but only as a fallback — it reads a
 * low-bitrate 720p rip as "cheap" and under-reserves the pool by ~2x, which
 * is exactly the kind of file people bring to a video compressor.
 */
export function providerResolutionFactor(bitrateMbps: number): number {
  if (bitrateMbps >= 20) return 3.85; // 4K
  if (bitrateMbps >= 10) return 1.78; // 1440p
  if (bitrateMbps >= 3) return 1; // 1080p
  return 1 / 2.25; // 720p and below
}

/**
 * FreeConvert bills each task separately, rounded up, with a one-minute floor:
 *
 *   job_minutes = Σ over tasks: max(1, ceil(task_seconds / 60))
 *
 * So the raw wall clock is almost never what we pay. A 5-second clip and a
 * 3-minute one both cost the 3-minute floor.
 */
export const billedMinutes = (seconds: number): number =>
  Math.max(1, Math.ceil(seconds / 60));

/**
 * Measured pull rate for `import/url` against the R2 custom domain:
 * 593 MB in 18.3 s (2026-09-06). Conservative round-down.
 */
export const PROVIDER_IMPORT_MBPS = 30;

/**
 * Predicted conversion minutes for a job. Gates the free pool, so it must
 * mirror the real billing rule rather than raw processing time — the earlier
 * version modelled only compress wall clock and under-counted by 3–18x.
 */
export function estimateProviderMinutes(input: {
  durationSeconds?: number | null;
  fileSizeBytes: number;
  codec: string;
  /** x264 preset. Changes the encode time by up to 2.3x. */
  speed?: string;
  /** Source height when the browser read it; beats inferring from bitrate. */
  heightPx?: number | null;
  /** Predicted output size, for the export leg. Defaults to 60% of the input. */
  outputBytes?: number | null;
  /** false when the browser uploads to the provider directly (slow uplink) */
  staged?: boolean;
  uplinkMBps?: number;
  /**
   * True when the result decides money or capacity rather than a progress bar:
   * adds PROVIDER_ESTIMATE_HEADROOM so the hold sits above the spread.
   */
  conservative?: boolean;
}): number {
  const seconds =
    input.durationSeconds && input.durationSeconds > 0
      ? input.durationSeconds
      : // no duration from the browser: assume a middling 8 Mbps stream
        (input.fileSizeBytes * 8) / (8 * 1_000_000);

  const bitrateMbps =
    seconds > 0 ? (input.fileSizeBytes * 8) / seconds / 1_000_000 : 8;

  const factor =
    (input.heightPx && input.heightPx > 0
      ? providerHeightFactor(input.heightPx)
      : providerResolutionFactor(bitrateMbps)) *
    (PROVIDER_CODEC_FACTOR[input.codec] ?? 1) *
    (PROVIDER_SPEED_FACTOR[input.speed ?? 'medium'] ?? 1);

  const compressSeconds =
    (PROVIDER_JOB_OVERHEAD_SECONDS +
      PROVIDER_SECONDS_PER_SOURCE_SECOND * factor * seconds) *
    PROVIDER_REAL_CONTENT_FACTOR *
    (input.conservative ? PROVIDER_ESTIMATE_HEADROOM : 1);

  // Staged jobs are pulled from our CDN at ~30 MB/s; direct uploads are
  // metered at the visitor's uplink, which we cannot see — assume a pessimistic
  // 3 MB/s so the budget is never surprised.
  const mbps =
    input.uplinkMBps ?? (input.staged === false ? 3 : PROVIDER_IMPORT_MBPS);
  const importSeconds = input.fileSizeBytes / (mbps * 1024 * 1024);

  const outputBytes = input.outputBytes ?? input.fileSizeBytes * 0.6;
  const exportSeconds = outputBytes / (PROVIDER_EXPORT_MBPS * 1024 * 1024);

  return (
    billedMinutes(importSeconds) +
    billedMinutes(compressSeconds) +
    billedMinutes(exportSeconds)
  );
}

/**
 * Share of the monthly pool that anonymous + free users may burn. The rest is
 * reserved so a spike in free traffic can never break a paying customer.
 */
export const FREE_TRAFFIC_BUDGET_SHARE = 0.6;

export const PROVIDER_DAILY_MINUTES =
  PROVIDER_PLANS[PROVIDER_PLAN].monthlyMinutes / 30;

export const FREE_DAILY_MINUTE_BUDGET =
  PROVIDER_DAILY_MINUTES * FREE_TRAFFIC_BUDGET_SHARE;

/** Upgrade the FreeConvert plan when monthly burn crosses this. */
export const PROVIDER_UPGRADE_THRESHOLD =
  PROVIDER_PLANS[PROVIDER_PLAN].monthlyMinutes * 0.8;

/* ------------------------------------------------------------------ */
/* Credits                                                             */
/* ------------------------------------------------------------------ */

/**
 * FreeConvert bills per *task*, rounded up, with a one-minute floor each:
 *
 *   job_minutes = Σ max(1, ceil(task_seconds / 60))
 *
 * Our pipeline is import + compress + export, so **no job can ever cost less
 * than 3 conversion minutes** — a 5-second clip costs exactly as much as a
 * 3-minute one.
 */
export const MIN_CREDITS_PER_JOB = 3;

/**
 * 1 credit == 1 conversion minute the provider actually bills us for.
 *
 * This used to be "1 credit == 1 minute of *source video*", which had the
 * price growing linearly with duration while the cost did not. The encode
 * leg is `6.1 + 0.1191 × source_seconds`, so it does not cross into a second
 * billed minute until ~7.5 minutes of 1080p source: **every job under that
 * costs us exactly the same 3 minutes**. Charging by duration meant a
 * 15-minute meeting recording cost 15 credits to produce something we were
 * billed 4 minutes for — 5x the true cost, and 5x what videocompress.ai
 * charges for the same file.
 *
 * Pricing off the provider's own meter fixes that in both directions and
 * makes the codec surcharge fall out for free: libx265 is 3.77x slower, so
 * it books more minutes without a separate multiplier table.
 *
 * The ceiling is unchanged. N credits still buys at most N conversion
 * minutes, so the worst case a balance can inflict on the upstream bill is
 * exactly what it was before; only the mid-range gets cheaper.
 *
 * Always priced as if staged, because whether the file goes through R2 is
 * our infrastructure decision and must not show up in the user's price.
 *
 * See docs/freeconvert-benchmark.md §5.
 */
export function estimateCredits(input: {
  durationSeconds?: number | null;
  fileSizeBytes: number;
  codec: string;
  speed?: string;
  heightPx?: number | null;
  outputBytes?: number | null;
}): number {
  return Math.max(
    MIN_CREDITS_PER_JOB,
    estimateProviderMinutes({
      durationSeconds: input.durationSeconds ?? null,
      fileSizeBytes: input.fileSizeBytes,
      codec: input.codec,
      speed: input.speed,
      heightPx: input.heightPx ?? null,
      outputBytes: input.outputBytes ?? null,
      staged: true,
      conservative: true,
    })
  );
}

/* ------------------------------------------------------------------ */
/* Job lifecycle                                                       */
/* ------------------------------------------------------------------ */

/** Stop polling / mark stale after this long. */
export const JOB_TIMEOUT_MS = 60 * 60 * 1000; // 1h
export const POLL_INTERVAL_MS = 2000;
export const POLL_INTERVAL_MAX_MS = 8000;
