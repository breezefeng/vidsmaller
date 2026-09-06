/**
 * How long the provider takes to encode, measured.
 *
 * The provider's API reports task *status* and nothing else: a compress task
 * that has been running for eight minutes looks exactly like one that started
 * two seconds ago (verified against the live API on 2026-09-06 — the task
 * object carries no percent, no frame count, no bytes-written). So a progress
 * bar driven by task status alone can only ever show three values, and it sits
 * frozen on the middle one for the entire encode.
 *
 * The way out is to predict the encode time and interpolate against the clock.
 * That is only honest if the prediction comes from measurements, so the model
 * is the one already fitted to real jobs in config/compress.ts:
 *
 *   scripts/fc-benchmark-results.jsonl (2026-09-06, libx264, speed=medium)
 *     1080p  60s source -> 13.15s compress
 *     1080p 600s source -> 77.48s compress   => 6.1s + 0.1191 x duration
 *     1080p  60s source -> 33.04s compress   (libx265, 3.77x the per-second term)
 *
 *   scripts/fc-speed-preset-results.jsonl (2026-09-06, 720p 507.6s source)
 *     medium -> 61.68s compress              => height factor 0.92
 *
 * Note how little the frame size matters next to the source duration: 720p
 * costs 92% of 1080p per second of video, not the 44% its pixel count would
 * suggest. The provider's pipeline is not purely encode-bound.
 *
 * The encoder-speed multipliers are measured on the provider itself, same file
 * three times (scripts/fc-speed-preset-results.jsonl):
 *
 *   medium 61.7s   fast 43.2s (0.70x)   faster 27.3s (0.44x)
 *
 * with the output size identical to within 0.006% — the target is a percentage
 * of the source, so the preset buys wall clock, not bytes. What it costs is
 * quality, measured locally at a fixed bitrate on a 60s 720p clip:
 *
 *   VMAF  medium 96.06   fast 96.05   faster 95.96   veryfast 95.34
 *
 * HOW ACCURATE CAN THIS BE — read this before "fixing" the constants.
 *
 * The same file at the same settings, four separate runs, was measured at
 * 16.5s, 19.4s, 27.3s and ~45s of compress time. The provider spreads jobs
 * across machines of visibly different speeds, so a 2.7x spread on identical
 * input is normal and no constant can predict a single run. The prediction
 * therefore aims at the middle of that spread, and the curve in progress.ts is
 * built to survive being wrong in both directions: an early finish snaps to
 * 100%, a late one slows down and keeps creeping.
 */

import {
  PROVIDER_CODEC_FACTOR,
  PROVIDER_JOB_OVERHEAD_SECONDS,
  PROVIDER_SECONDS_PER_SOURCE_SECOND,
  PROVIDER_SPEED_FACTOR,
  providerHeightFactor,
} from '@/config/compress';
import type { CompressSettings } from '@/lib/freeconvert/presets';

/**
 * The constants live in config/compress.ts because the billing estimate reads
 * the same ones. Two models of "how long will the provider take" that can
 * drift apart is one model too many.
 */

export interface CompressEtaInput {
  durationSeconds: number | null;
  /** Source height, when the browser managed to read it. */
  height?: number | null;
  /** Only used when the duration is missing. */
  sizeBytes?: number | null;
  settings?: Partial<Pick<CompressSettings, 'codec' | 'speed'>> | null;
}

/**
 * Duration guessed from file size when the browser could not read it (some
 * containers refuse to report one before a full parse). 4 Mbps is a middle-of
 * -the-road bitrate for consumer video; the guess only has to be good enough
 * to keep the bar moving at a plausible rate.
 */
function durationFromSize(sizeBytes: number | null | undefined): number | null {
  if (!sizeBytes || sizeBytes <= 0) return null;
  return (sizeBytes * 8) / (4_000_000);
}

/**
 * Predicted provider-side encode time, in seconds.
 * Returns null when the duration is unknown — the caller must then fall back
 * to a status-only progress bar rather than invent a number.
 */
export function estimateCompressSeconds({
  durationSeconds,
  height,
  sizeBytes,
  settings,
}: CompressEtaInput): number | null {
  const duration =
    durationSeconds && durationSeconds > 0
      ? durationSeconds
      : durationFromSize(sizeBytes);
  if (!duration) return null;

  // Frame size, codec and preset all scale the per-second term only: the fixed
  // overhead is the provider starting a task, and that costs the same either
  // way. Verified against the x265 run — 6.1 + 60 x 0.1191 x 3.77 = 33.0s,
  // measured 33.04s.
  const factor =
    providerHeightFactor(height && height > 0 ? height : 1080) *
    (PROVIDER_CODEC_FACTOR[settings?.codec ?? 'libx264'] ?? 1) *
    (PROVIDER_SPEED_FACTOR[settings?.speed ?? 'medium'] ?? 1);

  const seconds =
    PROVIDER_JOB_OVERHEAD_SECONDS +
    duration * PROVIDER_SECONDS_PER_SOURCE_SECOND * factor;

  return Math.max(seconds, 3);
}

/**
 * Predicted time for the provider to pull the file out of our bucket.
 * Server-to-server, so it is bandwidth-bound rather than encode-bound; 25 MB/s
 * is the conservative end of what we have seen.
 */
export function estimateImportSeconds(sizeBytes: number | null): number | null {
  if (!sizeBytes || sizeBytes <= 0) return null;
  return Math.max(2, sizeBytes / (25 * 1024 * 1024));
}
