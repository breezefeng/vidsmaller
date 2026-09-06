'use client';

import FileItem from '@/components/compress/FileItem';
import SettingsPanel from '@/components/compress/SettingsPanel';
import { useCompressor } from '@/components/compress/useCompressor';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { estimateCredits } from '@/config/compress';
import { Link as I18nLink } from '@/i18n/routing';
import { formatBytes } from '@/lib/compress/client';
import { estimateOutputBytes } from '@/lib/compress/estimate';
import type { CompressSettings } from '@/lib/freeconvert/presets';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  Coins,
  Download,
  Plus,
  Sparkles,
  Trash2,
  UploadCloud,
  Zap,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useDropzone } from 'react-dropzone';

export default function Compressor({
  initialSettings,
}: {
  /** Pre-fill the settings panel, e.g. target-size 19 MB on the Discord page. */
  initialSettings?: CompressSettings;
} = {}) {
  const t = useTranslations('Compressor');
  const {
    items,
    settings,
    setSettings,
    context,
    globalError,
    addFiles,
    removeItem,
    clearAll,
    cancelItem,
    startAll,
    retryItem,
    stats,
    pendingItems,
  } = useCompressor(initialSettings);

  const actionRef = useRef<HTMLDivElement>(null);
  const hadItems = useRef(false);

  const onDrop = useCallback(
    (accepted: File[]) => {
      void addFiles(accepted);
    },
    [addFiles]
  );

  const maxBatch = context?.limits.maxBatchFiles ?? 1;

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    accept: { 'video/*': [] },
    multiple: maxBatch > 1,
  });

  const maxSize = context?.limits.maxFileSize ?? 200 * 1024 * 1024;

  /**
   * The dropzone used to stay at full height forever, which pushed the only
   * button that matters below the fold on a laptop. Now it collapses the
   * moment there is something to act on — and we bring the action into view
   * on the first file so the next step is never off-screen.
   */
  const empty = items.length === 0;

  useEffect(() => {
    if (!empty && !hadItems.current) {
      hadItems.current = true;
      // Wait for the collapsed layout to paint before measuring.
      requestAnimationFrame(() => {
        actionRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      });
    }
    if (empty) hadItems.current = false;
  }, [empty]);

  /**
   * Applied from the headroom notice on a file card. Settings are per batch,
   * not per file, which is right here: the notice fires on the file that has
   * no bitrate left, and the gentler setting should cover everything queued
   * behind it too.
   */
  const applySettingsPatch = useCallback(
    (patch: Partial<CompressSettings>) => {
      setSettings((prev) => ({ ...prev, ...patch }));
    },
    [setSettings]
  );

  /** The file the settings preview is about: the first thing we would run. */
  const previewItem = pendingItems[0] ?? items[0] ?? null;

  const source = previewItem
    ? {
        sizeBytes: previewItem.size,
        durationSeconds: previewItem.durationSeconds,
        width: previewItem.width,
        height: previewItem.height,
      }
    : null;

  /** Total predicted output across everything the button would start. */
  const predicted = useMemo(() => {
    if (!pendingItems.length) return null;
    let total = 0;
    for (const item of pendingItems) {
      const bytes = estimateOutputBytes(settings, {
        sizeBytes: item.size,
        durationSeconds: item.durationSeconds,
        width: item.width,
        height: item.height,
      });
      if (bytes === null) return null;
      total += bytes;
    }
    return total;
  }, [pendingItems, settings]);

  const predictedSavedPercent =
    predicted !== null && stats.pendingBytes > 0
      ? Math.max(0, Math.round((1 - predicted / stats.pendingBytes) * 100))
      : null;

  /**
   * The hold shown before the user commits. Must be computed from exactly the
   * same inputs as the server's, or the number on the button is not the number
   * that gets deducted. Whatever the job does not use is refunded when the
   * provider's meter comes back (lib/compress/service.ts).
   */
  const creditCost = useMemo(() => {
    if (!context?.signedIn || !pendingItems.length) return 0;
    return pendingItems.reduce(
      (sum, item) =>
        sum +
        estimateCredits({
          durationSeconds: item.durationSeconds,
          fileSizeBytes: item.size,
          codec: settings.codec,
          speed: settings.speed,
          heightPx: item.height,
          outputBytes: estimateOutputBytes(settings, {
            sizeBytes: item.size,
            durationSeconds: item.durationSeconds,
            width: item.width,
            height: item.height,
          }),
        }),
      0
    );
  }, [context?.signedIn, pendingItems, settings]);

  const notEnoughCredits =
    !!context?.signedIn && creditCost > 0 && creditCost > context.credits;

  /**
   * The shared anonymous pool. Signed-in users are never gated by it, so this
   * is null for them. Shown up front because finding out via a 429 after
   * picking a file and waiting through an upload is the worst possible time.
   */
  const capacityGone = context?.freeCapacity?.exhausted ?? false;
  const capacityResetHours = context?.freeCapacity
    ? Math.max(
        1,
        Math.round(
          (new Date(context.freeCapacity.resetsAt).getTime() - Date.now()) /
            3_600_000
        )
      )
    : 0;

  const showResults = stats.allSettled && stats.done > 0;
  const canAddMore = items.length < maxBatch;
  const singleDone =
    stats.done === 1 && items.length === 1 ? items[0] : null;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div {...getRootProps()} className="relative">
        <input {...getInputProps()} />

        {/* Drag-and-drop stays live over the whole card, not just the
            empty state, so users can drop a second file onto the queue. */}
        {isDragActive && !empty && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-2xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm">
            <p className="text-sm font-semibold text-primary">
              {t('dropzone.active')}
            </p>
          </div>
        )}

        {empty ? (
          /* ------------------------- empty state ------------------------- */
          <div
            className={cn(
              'rounded-2xl border-2 border-dashed bg-card/60 p-8 backdrop-blur transition-all sm:p-12',
              isDragActive
                ? 'border-primary bg-primary/5 scale-[1.01]'
                : 'border-border hover:border-primary/50'
            )}
          >
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="rounded-2xl bg-primary/10 p-4">
                <UploadCloud className="h-8 w-8 text-primary" />
              </div>

              <div>
                <p className="text-lg font-semibold">
                  {isDragActive ? t('dropzone.active') : t('dropzone.idle')}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('dropzone.formats', { size: formatBytes(maxSize) })}
                </p>
              </div>

              <Button size="lg" onClick={open} className="h-11 rounded-xl px-8">
                <Sparkles className="mr-2 h-4 w-4" />
                {t('dropzone.chooseVideo')}
              </Button>

              <p className="text-xs text-muted-foreground">
                {t('dropzone.privacy')}
              </p>
            </div>
          </div>
        ) : (
          /* ------------------------ working state ------------------------ */
          <div className="space-y-3 rounded-2xl border bg-card/60 p-3 backdrop-blur sm:p-4">
            <div className="space-y-2">
              {items.map((item) => (
                <FileItem
                  key={item.key}
                  item={item}
                  settings={settings}
                  showDownload={!singleDone}
                  onRemove={removeItem}
                  onRetry={retryItem}
                  onCancel={cancelItem}
                  onApplySettings={applySettingsPatch}
                />
              ))}
            </div>

            {canAddMore && !stats.busy && (
              <button
                type="button"
                onClick={open}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
                {t('queue.addAnother')}
              </button>
            )}

            {showResults ? (
              /* ---------------------- result summary ---------------------- */
              <div
                ref={actionRef}
                className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                      {t('result.title', { count: stats.done })}
                    </p>
                    {stats.savedBytes > 0 && (
                      <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
                        {t('result.saved', {
                          amount: formatBytes(stats.savedBytes),
                          percent: stats.savedPercent,
                        })}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {singleDone?.downloadUrl && (
                      <Button asChild size="lg" className="h-10">
                        <a href={singleDone.downloadUrl} download>
                          <Download className="mr-2 h-4 w-4" />
                          {t('queue.download')}
                        </a>
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="lg"
                      className="h-10"
                      onClick={clearAll}
                    >
                      {t('result.another')}
                    </Button>
                  </div>
                </div>

                {context?.limits.retentionHours && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {t('result.retention', {
                      hours: context.limits.retentionHours,
                    })}
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="rounded-xl border bg-background/60 p-3 sm:p-4">
                  <SettingsPanel
                    settings={settings}
                    onChange={setSettings}
                    context={context}
                    source={source}
                    disabled={stats.busy}
                  />
                </div>

                {/* ------------------------ action bar ------------------------ */}
                <div
                  ref={actionRef}
                  className="flex flex-wrap items-center gap-3"
                >
                  <Button
                    size="lg"
                    className="h-12 flex-1 rounded-xl text-base sm:flex-none sm:px-8"
                    disabled={
                      !stats.hasPending ||
                      stats.busy ||
                      notEnoughCredits ||
                      capacityGone
                    }
                    onClick={startAll}
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    {stats.busy
                      ? t('queue.working')
                      : stats.pendingCount > 1
                        ? t('queue.compressCount', { count: stats.pendingCount })
                        : t('queue.compressNow')}
                  </Button>

                  {!stats.busy && predicted !== null && (
                    <div className="text-sm tabular-nums text-muted-foreground">
                      {t.rich('queue.willProduce', {
                        size: formatBytes(predicted),
                        percent: predictedSavedPercent ?? 0,
                        hl: (chunks) => (
                          <span className="font-semibold text-foreground">
                            {chunks}
                          </span>
                        ),
                      })}
                    </div>
                  )}

                  {!stats.busy && (
                    <div className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground">
                      {context?.signedIn ? (
                        <>
                          <Coins className="h-3.5 w-3.5" />
                          <span
                            className="tabular-nums"
                            title={t('queue.costNote')}
                          >
                            {t('queue.costCredits', { count: creditCost })}
                          </span>
                        </>
                      ) : (
                        <>
                          <Zap className="h-3.5 w-3.5" />
                          <span>{t('queue.costFree')}</span>
                        </>
                      )}
                    </div>
                  )}

                  {/* The number above is a hold, not a price. Saying so here
                      costs one line and prevents the "why did it take 11 and
                      give 3 back" support thread. */}
                  {!stats.busy && context?.signedIn && creditCost > 0 && (
                    <p className="w-full text-[11px] text-muted-foreground/80">
                      {t('queue.costNote')}
                    </p>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-12 w-10 shrink-0"
                    onClick={clearAll}
                    disabled={stats.busy}
                    aria-label={t('queue.clear')}
                    title={t('queue.clear')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {notEnoughCredits && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {t('errors.notEnoughCredits', {
                        need: creditCost,
                        have: context?.credits ?? 0,
                      })}
                    </AlertDescription>
                  </Alert>
                )}

                {capacityGone && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {/* AlertDescription is a grid, so each child becomes its
                          own row — rich text has to stay inside one block. */}
                      <p>
                        {t.rich('errors.freePoolGone', {
                          hours: capacityResetHours,
                          signIn: (chunks) => (
                            <I18nLink
                              href="/login"
                              className="font-medium underline underline-offset-2"
                            >
                              {chunks}
                            </I18nLink>
                          ),
                        })}
                      </p>
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ------------------------- status line ------------------------- */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          {context?.signedIn ? (
            <span className="flex items-center gap-1">
              <Coins className="h-3.5 w-3.5" />
              {t('status.credits', { count: context.credits })}
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <Zap className="h-3.5 w-3.5" />
              {t('status.freeTrial')}
            </span>
          )}
          {context?.tier && (
            <Badge variant="outline" className="text-[10px] uppercase">
              {context.tier}
            </Badge>
          )}
        </div>

        {!context?.signedIn && (
          <I18nLink href="/login" className="underline hover:text-foreground">
            {t('status.signInCta')}
          </I18nLink>
        )}
      </div>

      {globalError && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{globalError}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
