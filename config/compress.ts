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

export const MIN_CREDITS_PER_JOB = 1;

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
