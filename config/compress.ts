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

/** Free daily compressions for signed-out visitors (per IP). */
export const ANONYMOUS_DAILY_LIMIT = 2;

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

/** Measured: libx265 is 3.77x slower than libx264 at the same resolution. */
export const PROVIDER_CODEC_FACTOR: Record<string, number> = {
  libx264: 1,
  h264_nvenc: 1,
  libx265: 3.77,
  hevc_nvenc: 3.77,
  av1_nvenc: 6,
};

/**
 * Encode cost tracks pixel count. We cannot see the resolution server-side,
 * so infer it from bitrate — good enough to keep the budget honest.
 * (4K factor 3.85x verified locally with the same encoder + settings.)
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
  /** false when the browser uploads to the provider directly (slow uplink) */
  staged?: boolean;
  uplinkMBps?: number;
}): number {
  const seconds =
    input.durationSeconds && input.durationSeconds > 0
      ? input.durationSeconds
      : // no duration from the browser: assume a middling 8 Mbps stream
        (input.fileSizeBytes * 8) / (8 * 1_000_000);

  const bitrateMbps =
    seconds > 0 ? (input.fileSizeBytes * 8) / seconds / 1_000_000 : 8;

  const factor =
    providerResolutionFactor(bitrateMbps) *
    (PROVIDER_CODEC_FACTOR[input.codec] ?? 1);

  const compressSeconds =
    PROVIDER_JOB_OVERHEAD_SECONDS +
    PROVIDER_SECONDS_PER_SOURCE_SECOND * factor * seconds;

  // Staged jobs are pulled from our CDN at ~30 MB/s; direct uploads are
  // metered at the visitor's uplink, which we cannot see — assume a pessimistic
  // 3 MB/s so the budget is never surprised.
  const mbps =
    input.uplinkMBps ?? (input.staged === false ? 3 : PROVIDER_IMPORT_MBPS);
  const importSeconds = input.fileSizeBytes / (mbps * 1024 * 1024);

  return (
    billedMinutes(importSeconds) + // import
    billedMinutes(compressSeconds) + // compress
    1 // export/url, always sub-second, always billed a full minute
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
 * 1 credit == 1 minute of source video with the default (H.264) codec.
 * Heavier codecs burn more machine time, so they cost more.
 */
export const CREDIT_COST_PER_MINUTE: Record<string, number> = {
  libx264: 1,
  h264_nvenc: 1,
  libx265: 2,
  hevc_nvenc: 2,
  av1_nvenc: 3,
};

/**
 * FreeConvert bills per *task*, rounded up, with a one-minute floor each:
 *
 *   job_minutes = Σ max(1, ceil(task_seconds / 60))
 *
 * Our pipeline is import + compress + export, so **no job can ever cost less
 * than 3 conversion minutes** — a 5-second clip costs exactly as much as a
 * 3-minute one. Charging 1 credit for those was a guaranteed loss: 600
 * one-minute clips on the $9 Pro plan burned ~1800 minutes ($13.50) for $9 of
 * revenue.
 *
 * Setting the floor to 3 mirrors the provider's own floor. Worst case (a user
 * spending every credit on tiny clips) now lands at ~42% margin instead of
 * -50%; a normal mix sits above 70%.
 *
 * See docs/freeconvert-benchmark.md §5.
 */
export const MIN_CREDITS_PER_JOB = 3;

/** Fallback when the browser could not read the duration (charge by size). */
export const FALLBACK_MINUTES_PER_100MB = 2;

export function estimateCredits(input: {
  durationSeconds?: number | null;
  fileSizeBytes: number;
  codec: string;
}): number {
  const perMinute = CREDIT_COST_PER_MINUTE[input.codec] ?? 1;

  const minutes =
    input.durationSeconds && input.durationSeconds > 0
      ? input.durationSeconds / 60
      : (input.fileSizeBytes / (100 * MB)) * FALLBACK_MINUTES_PER_100MB;

  return Math.max(MIN_CREDITS_PER_JOB, Math.ceil(minutes * perMinute));
}

/* ------------------------------------------------------------------ */
/* Job lifecycle                                                       */
/* ------------------------------------------------------------------ */

/** Stop polling / mark stale after this long. */
export const JOB_TIMEOUT_MS = 60 * 60 * 1000; // 1h
export const POLL_INTERVAL_MS = 2000;
export const POLL_INTERVAL_MAX_MS = 8000;
