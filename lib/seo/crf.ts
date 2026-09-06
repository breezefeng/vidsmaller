import data from '@/lib/seo/data/crf-sweep.json';

/**
 * A measured CRF sweep: 3 content classes x 6 CRF values, with VMAF and SSIM.
 *
 * This is the data `lib/seo/benchmark.ts` explicitly said it did not have.
 *
 * HOW IT WAS PRODUCED, AND WHAT THAT LIMITS
 *
 * Run locally with ffmpeg (libx264, preset medium), not through our provider.
 * The CRF curve is a property of the encoder, and our service hands the same
 * encoder the same numbers, so this is a faithful proxy for what we output —
 * but it is a proxy, not a recording of our pipeline. The provider may use a
 * different preset or tune. Any figure built on this must say "libx264", not
 * "VidSmaller".
 *
 * Video only. Audio was excluded so the byte counts are pure video bitrate,
 * consistent with lib/seo/bitrate-budget.ts which treats audio as a flat
 * 128 kbps addition.
 *
 * WHAT IT STILL DOES NOT COVER
 *
 *   · One clip per class, 10 seconds each, all 1080p. Enough to show that the
 *     three classes sit in completely different places; not enough to quote a
 *     tolerance on any single number.
 *   · H.264 only. No H.265 sweep, so nothing here supports a claim about how
 *     the 30%-smaller figure behaves across CRF.
 *   · No competitor runs. Still nothing measured about anyone else's output.
 */

export interface CrfRun {
  /** Content class: camera / animation / screen. */
  label: string;
  source: string;
  sourceHash: string;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  sourceBytes: number;
  codec: string;
  preset: string;
  crf: number;
  /** Encoded video track only, in bytes. */
  videoBytes: number;
  videoKbps: number;
  vmafMean: number;
  vmafMin: number;
  ssim: number;
}

export const CRF_MEASURED_AT: string = data.measuredAt;
export const CRF_RUNS: CrfRun[] = data.runs as CrfRun[];

export const CRF_LABELS = ['screen', 'animation', 'camera'] as const;
export type CrfLabel = (typeof CRF_LABELS)[number];

/** Human-facing names. The raw labels are lab shorthand. */
export const CRF_LABEL_NAMES: Record<string, string> = {
  camera: 'Camera footage',
  animation: 'Animation',
  screen: 'Screen recording',
};

export const runsFor = (label: string): CrfRun[] =>
  CRF_RUNS.filter((r) => r.label === label).sort((a, b) => a.crf - b.crf);

export const CRF_VALUES: number[] = [
  ...new Set(CRF_RUNS.map((r) => r.crf)),
].sort((a, b) => a - b);

/**
 * VMAF around 93 is the figure the streaming industry generally treats as the
 * point where most viewers stop noticing the difference on a normal screen.
 * It is a convention borrowed from Netflix's published work, not something we
 * measured, and it is drawn as a reference line rather than a verdict.
 */
export const VMAF_TRANSPARENCY_REFERENCE = 93;
