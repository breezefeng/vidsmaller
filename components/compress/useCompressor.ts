'use client';

import { POLL_INTERVAL_MAX_MS, POLL_INTERVAL_MS } from '@/config/compress';
import {
  createJobRequest,
  fetchContext,
  fetchJob,
  markUploaded,
  probeVideoMeta,
  requestStagingUrl,
  uploadFileDirect,
  uploadFileToStaging,
  UploadTransportError,
  type CompressorContext,
  type JobView,
} from '@/lib/compress/client';
import {
  DEFAULT_SETTINGS,
  type CompressSettings,
} from '@/lib/freeconvert/presets';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type ItemPhase =
  | 'ready'
  | 'creating'
  | 'uploading'
  | 'processing'
  | 'done'
  | 'error'
  | 'canceled';

export interface CompressItem {
  /** local id, stable across the whole lifecycle */
  key: string;
  file: File;
  name: string;
  size: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;

  phase: ItemPhase;
  uploadPercent: number;
  processPercent: number;

  jobId: string | null;
  outputSize: number | null;
  savedPercent: number | null;
  downloadUrl: string | null;
  error: string | null;
}

let counter = 0;
const nextKey = () => `item-${Date.now().toString(36)}-${counter++}`;

export function useCompressor() {
  const [items, setItems] = useState<CompressItem[]>([]);
  const [settings, setSettings] = useState<CompressSettings>(DEFAULT_SETTINGS);
  const [context, setContext] = useState<CompressorContext | null>(null);
  const t = useTranslations('Compressor.errors');
  const [globalError, setGlobalError] = useState<string | null>(null);

  const abortControllers = useRef(new Map<string, AbortController>());
  const pollTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pollTimers.current.forEach((t) => clearTimeout(t));
      pollTimers.current.clear();
      abortControllers.current.forEach((c) => c.abort());
      abortControllers.current.clear();
    };
  }, []);

  const refreshContext = useCallback(async () => {
    try {
      const ctx = await fetchContext();
      if (mounted.current) setContext(ctx);
    } catch {
      /* context is best-effort */
    }
  }, []);

  useEffect(() => {
    refreshContext();
  }, [refreshContext]);

  const patch = useCallback((key: string, changes: Partial<CompressItem>) => {
    setItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, ...changes } : it))
    );
  }, []);

  /* ----------------------------- add files ----------------------------- */

  const addFiles = useCallback(
    async (files: File[]) => {
      setGlobalError(null);

      const maxFiles = context?.limits.maxBatchFiles ?? 1;
      const maxSize = context?.limits.maxFileSize ?? 200 * 1024 * 1024;

      const accepted: File[] = [];
      for (const file of files) {
        if (accepted.length >= maxFiles) {
          setGlobalError(t('batchLimit', { count: maxFiles }));
          break;
        }
        if (file.size > maxSize) {
          setGlobalError(t('fileTooLarge', { name: file.name }));
          continue;
        }
        accepted.push(file);
      }

      const drafts: CompressItem[] = accepted.map((file) => ({
        key: nextKey(),
        file,
        name: file.name,
        size: file.size,
        durationSeconds: null,
        width: null,
        height: null,
        phase: 'ready',
        uploadPercent: 0,
        processPercent: 0,
        jobId: null,
        outputSize: null,
        savedPercent: null,
        downloadUrl: null,
        error: null,
      }));

      if (!drafts.length) return;

      setItems((prev) => [...prev, ...drafts].slice(0, maxFiles));

      // Read duration locally so we can price the job before uploading.
      await Promise.all(
        drafts.map(async (draft) => {
          const meta = await probeVideoMeta(draft.file);
          if (mounted.current) patch(draft.key, meta);
        })
      );
    },
    [context, patch, t]
  );

  const removeItem = useCallback((key: string) => {
    abortControllers.current.get(key)?.abort();
    abortControllers.current.delete(key);
    const timer = pollTimers.current.get(key);
    if (timer) clearTimeout(timer);
    pollTimers.current.delete(key);
    setItems((prev) => prev.filter((it) => it.key !== key));
  }, []);

  const clearAll = useCallback(() => {
    abortControllers.current.forEach((c) => c.abort());
    abortControllers.current.clear();
    pollTimers.current.forEach((t) => clearTimeout(t));
    pollTimers.current.clear();
    setItems([]);
    setGlobalError(null);
  }, []);

  /* ------------------------------ polling ------------------------------ */

  const applyJob = useCallback(
    (key: string, job: JobView) => {
      const phase: ItemPhase =
        job.status === 'completed'
          ? 'done'
          : job.status === 'failed' || job.status === 'expired'
            ? 'error'
            : 'processing';

      patch(key, {
        phase,
        processPercent: job.progress,
        outputSize: job.outputSize,
        savedPercent: job.savedPercent,
        downloadUrl: job.downloadUrl,
        error: job.errorMessage,
      });

      return phase;
    },
    [patch]
  );

  const startPolling = useCallback(
    (key: string, jobId: string) => {
      let delay = POLL_INTERVAL_MS;
      let attempts = 0;

      const tick = async () => {
        if (!mounted.current) return;
        attempts += 1;

        try {
          const { job } = await fetchJob(jobId);
          const phase = applyJob(key, job);

          if (phase === 'done') {
            refreshContext();
            return;
          }
          if (phase === 'error') {
            refreshContext();
            return;
          }
        } catch (err) {
          if (attempts > 5) {
            patch(key, {
              phase: 'error',
              error: (err as Error).message || t('lostConnection'),
            });
            return;
          }
        }

        // 30 min ceiling
        if (attempts > 600) {
          patch(key, { phase: 'error', error: t('timedOut') });
          return;
        }

        delay = Math.min(Math.round(delay * 1.15), POLL_INTERVAL_MAX_MS);
        pollTimers.current.set(key, setTimeout(tick, delay));
      };

      pollTimers.current.set(key, setTimeout(tick, POLL_INTERVAL_MS));
    },
    [applyJob, patch, refreshContext, t]
  );

  /* ------------------------------- run --------------------------------- */

  const runItem = useCallback(
    async (item: CompressItem) => {
      const controller = new AbortController();
      abortControllers.current.set(item.key, controller);

      patch(item.key, {
        phase: 'creating',
        error: null,
        uploadPercent: 0,
        processPercent: 0,
      });

      const onUploadProgress = (percent: number) =>
        patch(item.key, { uploadPercent: percent });

      try {
        const created = await createJobRequest({
          filename: item.name,
          fileSize: item.size,
          durationSeconds: item.durationSeconds,
          settings,
        });

        let jobId = created.job.id;
        patch(item.key, { jobId, phase: 'uploading' });

        try {
          if (!created.upload) {
            throw new UploadTransportError(t('noUploadTarget'));
          }
          await uploadFileDirect(
            item.file,
            created.upload,
            onUploadProgress,
            controller.signal
          );
        } catch (uploadErr) {
          const recoverable =
            uploadErr instanceof UploadTransportError &&
            (context?.stagingAvailable ?? false);

          if (!recoverable) throw uploadErr;

          // The provider upload host was unreachable from this browser.
          // Stage the file in our own bucket and let the provider pull it.
          onUploadProgress(0);
          const staging = await requestStagingUrl({
            filename: item.name,
            fileSize: item.size,
            contentType: item.file.type || 'application/octet-stream',
          });

          await uploadFileToStaging(
            item.file,
            staging.url,
            staging.contentType,
            onUploadProgress,
            controller.signal
          );

          const restaged = await createJobRequest({
            filename: item.name,
            fileSize: item.size,
            durationSeconds: item.durationSeconds,
            settings,
            stagingKey: staging.key,
          });
          jobId = restaged.job.id;
          patch(item.key, { jobId });
        }

        patch(item.key, { phase: 'processing', uploadPercent: 100 });

        try {
          const { job: updated } = await markUploaded(jobId);
          applyJob(item.key, updated);
        } catch {
          /* the poller will pick it up */
        }

        startPolling(item.key, jobId);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          patch(item.key, { phase: 'canceled' });
          return;
        }
        patch(item.key, {
          phase: 'error',
          error: (err as Error).message || t('generic'),
        });
      } finally {
        abortControllers.current.delete(item.key);
        refreshContext();
      }
    },
    [applyJob, context, patch, refreshContext, settings, startPolling, t]
  );

  const startAll = useCallback(() => {
    setGlobalError(null);
    const pending = items.filter(
      (it) => it.phase === 'ready' || it.phase === 'error' || it.phase === 'canceled'
    );
    pending.forEach((it) => void runItem(it));
  }, [items, runItem]);

  const retryItem = useCallback(
    (key: string) => {
      const item = items.find((it) => it.key === key);
      if (item) void runItem(item);
    },
    [items, runItem]
  );

  /* ------------------------------ derived ------------------------------ */

  const stats = useMemo(() => {
    const done = items.filter((i) => i.phase === 'done');
    const totalIn = done.reduce((s, i) => s + i.size, 0);
    const totalOut = done.reduce((s, i) => s + (i.outputSize ?? i.size), 0);
    return {
      total: items.length,
      done: done.length,
      busy: items.some((i) =>
        ['creating', 'uploading', 'processing'].includes(i.phase)
      ),
      hasPending: items.some((i) =>
        ['ready', 'error', 'canceled'].includes(i.phase)
      ),
      totalIn,
      totalOut,
      savedBytes: Math.max(totalIn - totalOut, 0),
      savedPercent:
        totalIn > 0
          ? Math.round(((totalIn - totalOut) / totalIn) * 1000) / 10
          : 0,
    };
  }, [items]);

  return {
    items,
    settings,
    setSettings,
    context,
    globalError,
    setGlobalError,
    addFiles,
    removeItem,
    clearAll,
    startAll,
    retryItem,
    stats,
    refreshContext,
  };
}
