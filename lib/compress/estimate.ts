/**
 * Client-side output-size prediction.
 *
 * Every number here is an *estimate* shown with a "≈" — the point is not
 * accuracy to the byte, it is that the user should never have to click
 * "Compress" to find out roughly what they are going to get. Before this
 * existed the UI said "~50% of original" and left the arithmetic to the user.
 *
 * Returns `null` whenever we genuinely cannot say (e.g. bitrate mode with no
 * readable duration). Callers must render nothing rather than guess.
 */

import { QUICK_PRESETS, type CompressSettings } from '@/lib/freeconvert/presets';

const MB = 1024 * 1024;

export interface EstimateInput {
  /** source file size in bytes */
  sizeBytes: number;
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
}

/**
 * Common upload ceilings, in MB. These are the reason most people land on a
 * video compressor at all, so they get one tap instead of a prose hint.
 */
export const PLATFORM_TARGETS = [
  { key: 'discord', mb: 10 },
  { key: 'whatsapp', mb: 16 },
  { key: 'email', mb: 25 },
  { key: 'reddit', mb: 100 },
] as const;

export type PlatformTargetKey = (typeof PLATFORM_TARGETS)[number]['key'];

/**
 * CRF moves bitrate by roughly a factor of two every six points. We anchor the
 * curve at CRF 28 ≈ half the original, which is what our "Balanced" preset
 * promises, and clamp hard at both ends so the label can never claim a 20x win.
 */
function crfRatio(crf: number): number {
  const ratio = 0.5 * Math.pow(2, (28 - crf) / 6);
  return Math.min(Math.max(ratio, 0.04), 1);
}

/**
 * Bitrate scales sub-linearly with pixel count — halving the width does not
 * quarter the file. 0.75 is the usual exponent quoted for H.264 rescaling.
 */
function resolutionRatio(
  target: string,
  width?: number | null,
  height?: number | null
): number | null {
  if (!width || !height) return null;
  const [tw, th] = target.split(':').map(Number);
  if (!tw || !th) return null;

  const sourcePixels = width * height;
  const targetPixels = Math.min(tw * th, sourcePixels);
  if (sourcePixels <= 0) return null;

  return Math.min(Math.pow(targetPixels / sourcePixels, 0.75), 1);
}

/** Predicted output size in bytes, or null when it cannot be estimated. */
export function estimateOutputBytes(
  settings: CompressSettings,
  input: EstimateInput
): number | null {
  const { sizeBytes, durationSeconds, width, height } = input;
  if (!sizeBytes || sizeBytes <= 0) return null;

  switch (settings.mode) {
    case 'preset': {
      const pct = QUICK_PRESETS[settings.preset]?.percentage;
      if (!pct) return null;
      return Math.round(sizeBytes * (pct / 100));
    }

    case 'target_size': {
      if (!settings.targetSizeMb) return null;
      // The encoder cannot inflate a file that is already smaller.
      return Math.round(Math.min(settings.targetSizeMb * MB, sizeBytes));
    }

    case 'quality': {
      if (settings.crf === undefined) return null;
      return Math.round(sizeBytes * crfRatio(settings.crf));
    }

    case 'resolution': {
      if (!settings.resolution) return null;
      const ratio = resolutionRatio(settings.resolution, width, height);
      if (ratio === null) return null;
      return Math.round(sizeBytes * ratio);
    }

    case 'bitrate': {
      if (!settings.bitrateKbps || !durationSeconds) return null;
      // video bitrate + a nominal 128 kbps audio track
      const bytes = ((settings.bitrateKbps + 128) * 1000 * durationSeconds) / 8;
      return Math.round(Math.min(bytes, sizeBytes));
    }

    default:
      return null;
  }
}

/** Output size for one specific quick preset, used to label the preset chips. */
export function estimatePresetBytes(
  preset: keyof typeof QUICK_PRESETS,
  sizeBytes: number
): number | null {
  if (!sizeBytes || sizeBytes <= 0) return null;
  return Math.round(sizeBytes * (QUICK_PRESETS[preset].percentage / 100));
}

/** 0..100, how much smaller the output is predicted to be. */
export function estimateSavedPercent(
  settings: CompressSettings,
  input: EstimateInput
): number | null {
  const out = estimateOutputBytes(settings, input);
  if (out === null || !input.sizeBytes) return null;
  return Math.max(0, Math.round((1 - out / input.sizeBytes) * 100));
}

/**
 * Rough wall-clock estimate for the whole job, in seconds, so the button can
 * say "about a minute" instead of leaving the user staring at a spinner.
 *
 * Mirrors the server-side model in config/compress.ts:
 *   compress_seconds ≈ 6.1 + 0.1191 × source_seconds
 * plus an upload leg at a pessimistic 4 MB/s and provider queue overhead.
 */
export function estimateJobSeconds(input: {
  sizeBytes: number;
  durationSeconds?: number | null;
  codec: string;
}): number {
  const codecFactor = input.codec === 'libx265' ? 3.77 : 1;
  const seconds =
    input.durationSeconds && input.durationSeconds > 0
      ? input.durationSeconds
      : (input.sizeBytes * 8) / (8 * 1_000_000);

  const upload = input.sizeBytes / (4 * MB);
  const encode = 6.1 + 0.1191 * codecFactor * seconds;

  return Math.round(upload + encode + 8);
}
