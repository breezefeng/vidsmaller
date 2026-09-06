'use client';

import type { CompressItem } from '@/components/compress/useCompressor';
import { computeProgress, type ProgressOutput } from '@/lib/compress/progress';
import { useEffect, useState } from 'react';

/**
 * Re-renders the progress curve on a local clock.
 *
 * Polling alone can only step the bar once every few seconds, and the provider
 * hands us no percentage to step to — so without this the bar would still be a
 * staircase with one very long tread. The server says which stage the job is
 * in, how long that stage has been running and how long it should take; this
 * evaluates the same shared curve (lib/compress/progress.ts) every second, so
 * the movement is continuous and the ETA counts down.
 *
 * Only the *elapsed since the response* is measured locally, never a wall
 * clock difference against the server, so a device with a wrong clock still
 * sees the right progress.
 */
export function useLiveProgress(item: CompressItem): ProgressOutput {
  const running = item.phase === 'processing';
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, item.stage, item.stageSyncedAt]);

  if (!running) {
    return { percent: item.phase === 'done' ? 100 : 0, etaSeconds: null };
  }

  return computeProgress({
    runtime: item.stage
      ? {
          stage: item.stage,
          stageElapsedSeconds: item.stageElapsedSeconds,
          stageEstimateSeconds: item.stageEstimateSeconds,
        }
      : null,
    fallbackProgress: item.processPercent,
    extraElapsedSeconds: item.stageSyncedAt
      ? (nowMs - item.stageSyncedAt) / 1000
      : 0,
  });
}
