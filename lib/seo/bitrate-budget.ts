/**
 * "What does N MB actually buy you?"
 *
 * This is the block competitors cannot copy, because they never worked it out.
 * Every other video-compression landing page tells you the platform's limit and
 * stops. The limit is the least useful half of the answer — what people need to
 * know is whether their 8-minute screen recording can survive it.
 *
 * Two very different kinds of number come out of here, and the UI must keep
 * them visually distinct:
 *
 *   bitrate  — exact arithmetic. Given a size and a duration there is exactly
 *              one answer, and it is a hard ceiling, not an opinion.
 *   verdict  — a judgement, from published H.264 bitrate ladders. Documented
 *              below, and labelled as a recommendation wherever it is rendered.
 *
 * Blurring those two together is how "we have real data" turns into the same
 * hand-waving everyone else ships.
 */

const MIB = 1024 * 1024;

/** Container + muxing overhead. MP4 costs ~1–2%; we budget the pessimistic end. */
const CONTAINER_OVERHEAD = 0.98;

/** Stereo AAC at a sane quality. Below ~96 kbps speech starts to sound thin. */
export const DEFAULT_AUDIO_KBPS = 128;

export type Verdict = 'good' | 'ok' | 'rough' | 'impossible';

export interface ResolutionTier {
  /** Vertical resolution, e.g. 1080 */
  height: number;
  label: string;
  /** kbps at 30fps below which quality visibly suffers */
  good: number;
  ok: number;
}

/**
 * Thresholds for H.264 at 30fps, in kbps.
 *
 * Derived from the published streaming ladders — YouTube's recommended upload
 * bitrates and Apple's HLS authoring specification — pulled down roughly a
 * third, because those ladders describe a first encode of a clean master. A
 * re-encode of footage that has already been through one lossy pass survives
 * lower bitrates than a master does, which is the whole reason compressing an
 * existing MP4 works at all.
 *
 * Deliberately conservative: the failure mode we care about is telling someone
 * their video will look fine when it won't.
 */
export const RESOLUTION_TIERS: ResolutionTier[] = [
  { height: 2160, label: '4K', good: 20000, ok: 12000 },
  { height: 1440, label: '1440p', good: 9000, ok: 5500 },
  { height: 1080, label: '1080p', good: 4000, ok: 2000 },
  { height: 720, label: '720p', good: 2200, ok: 1100 },
  { height: 480, label: '480p', good: 1000, ok: 500 },
  { height: 360, label: '360p', good: 600, ok: 300 },
];

export interface BudgetRow {
  durationSeconds: number;
  /** Total bits/s available across video + audio. Exact. */
  totalKbps: number;
  /** What is left for video after the audio track. Exact. */
  videoKbps: number;
  /** Highest tier that still clears its `good` threshold, if any. */
  bestResolution: ResolutionTier | null;
  /** Highest tier that at least clears `ok`. */
  watchableResolution: ResolutionTier | null;
  verdict: Verdict;
}

/**
 * Exact: how much bitrate a target size leaves you at a given duration.
 */
export function videoBitrateKbps(
  targetMb: number,
  durationSeconds: number,
  audioKbps: number = DEFAULT_AUDIO_KBPS
): { totalKbps: number; videoKbps: number } {
  const bits = targetMb * MIB * 8 * CONTAINER_OVERHEAD;
  const totalKbps = bits / durationSeconds / 1000;
  return {
    totalKbps: Math.round(totalKbps),
    videoKbps: Math.round(totalKbps - audioKbps),
  };
}

/**
 * Judgement: the largest resolution this bitrate can carry.
 */
export function classify(videoKbps: number): {
  best: ResolutionTier | null;
  watchable: ResolutionTier | null;
  verdict: Verdict;
} {
  if (videoKbps <= 0) {
    return { best: null, watchable: null, verdict: 'impossible' };
  }
  const best = RESOLUTION_TIERS.find((t) => videoKbps >= t.good) ?? null;
  const watchable = RESOLUTION_TIERS.find((t) => videoKbps >= t.ok) ?? null;

  let verdict: Verdict = 'impossible';
  if (best) verdict = 'good';
  else if (watchable) verdict = watchable.height >= 480 ? 'ok' : 'rough';
  else verdict = 'rough';

  return { best, watchable, verdict };
}

/** Durations the table shows. Chosen to bracket what people actually upload. */
export const DEFAULT_DURATIONS = [30, 60, 120, 300, 600, 1800];

export function buildBudget(
  targetMb: number,
  durations: number[] = DEFAULT_DURATIONS,
  audioKbps: number = DEFAULT_AUDIO_KBPS
): BudgetRow[] {
  return durations.map((durationSeconds) => {
    const { totalKbps, videoKbps } = videoBitrateKbps(
      targetMb,
      durationSeconds,
      audioKbps
    );
    const { best, watchable, verdict } = classify(videoKbps);
    return {
      durationSeconds,
      totalKbps,
      videoKbps,
      bestResolution: best,
      watchableResolution: watchable,
      verdict,
    };
  });
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`;
}

/** 1900 -> "1.9 GB", 200 -> "200 MB". Headings should not read "1900 MB". */
export function formatSize(mb: number): string {
  if (mb < 1024) return `${mb} MB`;
  const gb = mb / 1024;
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
}
