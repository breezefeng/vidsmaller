/**
 * "Is there anything left to squeeze out of this file?"
 *
 * A percentage preset is a statement about the *file*, not about the *video*.
 * Balanced takes any input down to 50% of its size — nearly free on a phone
 * recording carrying three times the bitrate its resolution needs, and
 * genuinely destructive on something that has already been compressed once.
 *
 * Measured, same 10s of 1080p footage, same Balanced 50% cut, each output
 * scored against the file it started from (scripts/headroom-results.json):
 *
 *   source with slack     5,896 -> 2,952 kbps   VMAF 80.4
 *   source already lean   1,462 ->   745 kbps   VMAF 38.1
 *   ...same lean source at Light 70%  -> 1,028 kbps   VMAF 51.9
 *
 * Same preset, same content, and one of those outcomes is unusable. Nothing in
 * the UI knew the difference, so the person with the already-lean file was
 * quietly handed the worst result we can produce, and only found out after
 * waiting through the encode. This module is what tells them beforehand.
 *
 * The judgement uses the resolution ladder in lib/seo/bitrate-budget.ts — the
 * same thresholds the blog tables are built on, so the site cannot say two
 * different things about the same bitrate.
 *
 * WHAT THIS CANNOT KNOW, and why the copy is worded the way it is: content.
 * From scripts/crf-sweep-results.jsonl, both at 1080p, both measured here:
 * screen capture at 663 kbps scores VMAF 89.9, camera footage at 2,035 kbps
 * scores 74.4. Three times the bitrate, far worse picture. No rule built on
 * duration, size and frame size can tell those two apart, so this never claims
 * a file *will* look bad — it states the arithmetic ("this leaves N kbps,
 * below the M kbps this resolution usually wants"), offers the gentler option,
 * and lets the person decide.
 */

import { estimateOutputBytes } from '@/lib/compress/estimate';
import { QUICK_PRESETS, type CompressSettings } from '@/lib/freeconvert/presets';
import {
  DEFAULT_AUDIO_KBPS,
  RESOLUTION_TIERS,
  type ResolutionTier,
} from '@/lib/seo/bitrate-budget';

export interface HeadroomInput {
  sizeBytes: number;
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
}

export type HeadroomLevel =
  /** Plenty of slack, or not enough information. Say nothing. */
  | 'fine'
  /** Source is below the comfortable bitrate, but the output still clears the floor. */
  | 'lean'
  /** The chosen setting lands the output below the watchable floor. */
  | 'over';

export type HeadroomSuggestion =
  | {
      kind: 'preset';
      preset: keyof typeof QUICK_PRESETS;
      outputKbps: number;
      /** False when it is merely less damaging, not actually comfortable. */
      clearsFloor: boolean;
    }
  | {
      kind: 'resolution';
      resolution: string;
      label: string;
      outputKbps: number;
      clearsFloor: true;
    }
  | null;

export interface HeadroomReport {
  level: HeadroomLevel;
  /** Video bitrate of the source, kbps. */
  sourceKbps: number;
  /** Predicted video bitrate of the output under the current settings, kbps. */
  outputKbps: number;
  /** The ladder tier of the source. */
  tier: ResolutionTier;
  /**
   * The ladder tier of the *output*, which is a different one as soon as the
   * settings scale the frame. Judging a 480p output against 720p thresholds is
   * how a notice ends up still complaining after its own advice was taken.
   */
  outputTier: ResolutionTier;
  /** The gentlest thing that would still be watchable, if anything is. */
  suggestion: HeadroomSuggestion;
}

function tierFor(height: number): ResolutionTier {
  return (
    RESOLUTION_TIERS.find((t) => height >= t.height) ??
    RESOLUTION_TIERS[RESOLUTION_TIERS.length - 1]
  );
}

/**
 * Video-only bitrate, kbps. The browser cannot tell us the audio bitrate, so
 * the nominal track is subtracted — the same assumption the budget tables make.
 */
function videoKbps(bytes: number, durationSeconds: number): number {
  const total = (bytes * 8) / durationSeconds / 1000;
  return Math.max(total - DEFAULT_AUDIO_KBPS, 0);
}

/**
 * Height of the encoded result. Only the resolution mode changes it, and it
 * can never scale a file up.
 */
function outputHeightFor(settings: CompressSettings, sourceHeight: number): number {
  if (settings.mode !== 'resolution' || !settings.resolution) return sourceHeight;
  const target = Number(settings.resolution.split(':')[1]);
  return Number.isFinite(target) ? Math.min(target, sourceHeight) : sourceHeight;
}

/** Resolutions the settings panel actually offers, largest first. */
const OFFERED_RESOLUTIONS: { value: string; height: number }[] = [
  { value: '3840:2160', height: 2160 },
  { value: '2560:1440', height: 1440 },
  { value: '1920:1080', height: 1080 },
  { value: '1280:720', height: 720 },
  { value: '1024:576', height: 576 },
  { value: '854:480', height: 480 },
  { value: '640:360', height: 360 },
];

export function analyzeHeadroom(
  settings: CompressSettings,
  input: HeadroomInput
): HeadroomReport | null {
  const { sizeBytes, durationSeconds, height } = input;
  if (!sizeBytes || !durationSeconds || durationSeconds <= 0) return null;
  if (!height || height <= 0) return null;

  const predicted = estimateOutputBytes(settings, input);
  if (predicted === null) return null;

  const tier = tierFor(height);
  const outputTier = tierFor(outputHeightFor(settings, height));
  const sourceKbps = Math.round(videoKbps(sizeBytes, durationSeconds));
  const outputKbps = Math.round(videoKbps(predicted, durationSeconds));

  const sourceIsLean = sourceKbps < tier.good;
  const outputIsRough = outputKbps < outputTier.ok;

  if (!outputIsRough) {
    return {
      level: sourceIsLean ? 'lean' : 'fine',
      sourceKbps,
      outputKbps,
      tier,
      outputTier,
      suggestion: null,
    };
  }

  return {
    level: 'over',
    sourceKbps,
    outputKbps,
    tier,
    outputTier,
    suggestion: findSuggestion(settings, input, durationSeconds),
  };
}

/**
 * What to offer instead.
 *
 *   1. the gentlest preset that clears the watchable floor — one tap, same
 *      frame size;
 *   2. failing that, a smaller frame: fewer pixels need fewer bits, so the
 *      bitrate the file already has becomes adequate again a tier or two down;
 *   3. failing that, the gentlest preset anyway, marked as "less damage" rather
 *      than "fine" — a low-bitrate rip has no comfortable setting, and pointing
 *      at one that pretends otherwise would be a lie;
 *   4. nothing, when the person has picked an exact size or an exact CRF. Those
 *      are hard requirements — a Discord upload has to fit under 19 MB — and
 *      quietly steering them off it would break the thing they came for. They
 *      still get the arithmetic.
 */
function findSuggestion(
  settings: CompressSettings,
  input: HeadroomInput,
  durationSeconds: number
): HeadroomSuggestion {
  const sourceHeight = input.height ?? 0;
  const sourceTier = tierFor(sourceHeight);

  const kbpsOf = (override: Partial<CompressSettings>): number | null => {
    const bytes = estimateOutputBytes({ ...settings, ...override } as CompressSettings, input);
    return bytes === null ? null : Math.round(videoKbps(bytes, durationSeconds));
  };

  const gentlerPresets =
    settings.mode === 'preset'
      ? (['strong', 'balanced', 'light'] as const).filter(
          (p) =>
            QUICK_PRESETS[p].percentage > QUICK_PRESETS[settings.preset].percentage
        )
      : [];

  // 1. Strongest first: the smallest file that is still watchable wins.
  //    A preset keeps the frame size, so the source tier is the one to clear.
  for (const preset of gentlerPresets) {
    const kbps = kbpsOf({ mode: 'preset', preset });
    if (kbps !== null && kbps >= sourceTier.ok) {
      return { kind: 'preset', preset, outputKbps: kbps, clearsFloor: true };
    }
  }

  // 2. A smaller frame, when the mode is one where that is a like-for-like swap.
  if (settings.mode === 'preset' || settings.mode === 'resolution') {
    for (const option of OFFERED_RESOLUTIONS) {
      if (option.height >= sourceHeight) continue;
      const kbps = kbpsOf({ mode: 'resolution', resolution: option.value as never });
      const tier = tierFor(option.height);
      if (kbps !== null && kbps >= tier.ok) {
        return {
          kind: 'resolution',
          resolution: option.value,
          label: tier.label,
          outputKbps: kbps,
          clearsFloor: true,
        };
      }
    }
  }

  // 3. Nothing is comfortable. Offer the least damaging thing that exists.
  const gentlest = gentlerPresets[gentlerPresets.length - 1];
  if (gentlest) {
    const kbps = kbpsOf({ mode: 'preset', preset: gentlest });
    if (kbps !== null) {
      return { kind: 'preset', preset: gentlest, outputKbps: kbps, clearsFloor: false };
    }
  }

  return null;
}
