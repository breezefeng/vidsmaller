/**
 * Turning "the provider says it is still working" into a progress bar that
 * actually moves.
 *
 * The provider gives us three task statuses and no percentage (see
 * lib/compress/eta.ts for the verification). Weighting those statuses equally
 * — which is what we used to do — produces exactly one number for the whole
 * encode: import done + compress running + export waiting = 50%. On a
 * 90-minute file that is eight to ten minutes frozen on "50%", which reads as
 * a hung job. Competitors do not look faster there; they look *alive*.
 *
 * So progress is derived from the clock instead: which stage the job is in,
 * when that stage started, and how long that stage is predicted to take. The
 * prediction is measured (eta.ts), the elapsed time is real, and the curve
 * never reaches 100% on its own — an overrunning encode slows down and keeps
 * creeping rather than lying about being finished.
 *
 * This module is shared: the server derives the stage from the provider
 * payload, the browser re-renders the same curve every second so the bar moves
 * between polls.
 */

import { estimateCompressSeconds, estimateImportSeconds } from '@/lib/compress/eta';
import {
  TASK_COMPRESS,
  TASK_EXPORT,
  TASK_IMPORT,
  type CompressSettings,
} from '@/lib/freeconvert/presets';

export type CompressStage =
  | 'queued'
  | 'importing'
  | 'compressing'
  | 'exporting'
  | 'completed'
  | 'failed';

/**
 * Everything the browser needs to animate the bar without another round trip.
 * Transient — derived from the provider payload on each sync, never stored.
 */
export interface JobRuntime {
  stage: CompressStage;
  /**
   * How long the current stage had been running when the server answered.
   *
   * Deliberately not the provider's absolute timestamp: the browser would have
   * to compare it against its own clock, and a device that is two minutes fast
   * would show a job as two minutes further along than it is. Elapsed time is
   * computed entirely server-side; the browser only adds the time since the
   * response arrived, which it can measure without trusting its wall clock.
   */
  stageElapsedSeconds: number | null;
  /** Predicted length of the current stage, seconds. Null when unknowable. */
  stageEstimateSeconds: number | null;
}

/** Where each stage sits on the 0-100 bar. */
const STAGE_RANGE: Record<CompressStage, [number, number]> = {
  queued: [2, 5],
  importing: [5, 15],
  compressing: [15, 94],
  exporting: [94, 99],
  completed: [100, 100],
  failed: [100, 100],
};

/**
 * Fraction of the stage completed after `elapsed` seconds when the stage was
 * predicted to take `estimate` seconds.
 *
 * Linear up to 88% at the predicted finish, then asymptotic. Monotonic, and
 * bounded below 1 so the bar can never sit at 100% while work is running.
 */
export function stageFraction(elapsed: number, estimate: number): number {
  if (!(estimate > 0)) return 0;
  const ratio = Math.max(elapsed, 0) / estimate;
  if (ratio <= 1) return 0.88 * ratio;
  return 0.88 + 0.11 * (1 - Math.exp(-(ratio - 1) * 1.2));
}

export interface ProgressInput {
  runtime: JobRuntime | null;
  /** Persisted value, used as a floor so the bar can never run backwards. */
  fallbackProgress?: number;
  /** Seconds since the runtime was received. The browser's animation term. */
  extraElapsedSeconds?: number;
}

export interface ProgressOutput {
  percent: number;
  /** Seconds left in the whole job, or null when the estimate has run out. */
  etaSeconds: number | null;
}

export function computeProgress({
  runtime,
  fallbackProgress = 0,
  extraElapsedSeconds = 0,
}: ProgressInput): ProgressOutput {
  if (!runtime) {
    return { percent: clamp(fallbackProgress), etaSeconds: null };
  }

  const { stage, stageElapsedSeconds, stageEstimateSeconds } = runtime;

  if (stage === 'completed') return { percent: 100, etaSeconds: 0 };
  if (stage === 'failed') return { percent: clamp(fallbackProgress), etaSeconds: null };

  const [from, to] = STAGE_RANGE[stage];

  // No start time or no estimate: hold at the bottom of the stage rather than
  // pretending to know. Still ahead of the frozen-50% behaviour, because the
  // stage boundaries alone already move three times per job.
  if (stageElapsedSeconds === null || !stageEstimateSeconds) {
    return { percent: clamp(Math.max(from, fallbackProgress)), etaSeconds: null };
  }

  const elapsed = stageElapsedSeconds + Math.max(extraElapsedSeconds, 0);
  const fraction = stageFraction(elapsed, stageEstimateSeconds);
  const percent = from + (to - from) * fraction;

  const remaining = stageEstimateSeconds - elapsed;
  const etaSeconds = remaining > 1 ? Math.round(remaining) : null;

  return {
    percent: clamp(Math.max(percent, fallbackProgress)),
    etaSeconds,
  };
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/* ------------------------------------------------------------------ */
/* Provider payload -> stage                                           */
/* ------------------------------------------------------------------ */

type MinimalTask = {
  name?: string;
  status?: string;
  startedAt?: unknown;
  createdAt?: unknown;
};

type MinimalJob = {
  status?: string;
  startedAt?: unknown;
  createdAt?: unknown;
  tasks?: MinimalTask[];
};

export interface RuntimeInput {
  durationSeconds: number | null;
  inputSizeBytes: number | null;
  height?: number | null;
  settings?: Partial<Pick<CompressSettings, 'codec' | 'speed'>> | null;
}

/**
 * Read the current stage out of a provider job payload, together with the two
 * numbers the curve needs.
 */
export function deriveRuntime(
  job: MinimalJob,
  input: RuntimeInput,
  nowMs: number = Date.now()
): JobRuntime {
  const task = (name: string) => job.tasks?.find((t) => t.name === name);
  const elapsedOf = (t?: MinimalTask): number | null => {
    const startedAt =
      (typeof t?.startedAt === 'string' ? t.startedAt : null) ??
      (typeof t?.createdAt === 'string' ? t.createdAt : null);
    if (!startedAt) return null;
    const ms = nowMs - new Date(startedAt).getTime();
    return Number.isFinite(ms) ? Math.max(ms / 1000, 0) : null;
  };

  if (job.status === 'completed') {
    return { stage: 'completed', stageElapsedSeconds: null, stageEstimateSeconds: null };
  }
  if (job.status === 'failed') {
    return { stage: 'failed', stageElapsedSeconds: null, stageEstimateSeconds: null };
  }

  const importTask = task(TASK_IMPORT);
  const compressTask = task(TASK_COMPRESS);
  const exportTask = task(TASK_EXPORT);

  if (exportTask?.status === 'processing') {
    return {
      stage: 'exporting',
      stageElapsedSeconds: elapsedOf(exportTask),
      // Export writes straight to our bucket; measured at well under a second,
      // but the provider can queue it, so give it a few.
      stageEstimateSeconds: 4,
    };
  }

  if (compressTask?.status === 'processing') {
    return {
      stage: 'compressing',
      stageElapsedSeconds: elapsedOf(compressTask),
      stageEstimateSeconds: estimateCompressSeconds({
        durationSeconds: input.durationSeconds,
        height: input.height,
        sizeBytes: input.inputSizeBytes,
        settings: input.settings,
      }),
    };
  }

  if (importTask?.status === 'processing') {
    return {
      stage: 'importing',
      stageElapsedSeconds: elapsedOf(importTask),
      stageEstimateSeconds: estimateImportSeconds(input.inputSizeBytes),
    };
  }

  // Nothing running yet: queued behind the provider's own scheduler.
  return {
    stage: 'queued',
    stageElapsedSeconds: elapsedOf(job as MinimalTask),
    stageEstimateSeconds: 20,
  };
}
