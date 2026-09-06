'use client';

import type { CompressItem } from '@/components/compress/useCompressor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { formatBytes, formatDuration } from '@/lib/compress/client';
import { estimateOutputBytes } from '@/lib/compress/estimate';
import type { CompressSettings } from '@/lib/freeconvert/presets';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileVideo,
  Loader2,
  RotateCcw,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

interface Props {
  item: CompressItem;
  settings: CompressSettings;
  /**
   * False when the result summary below already owns the download — a single
   * finished file otherwise renders two identical buttons.
   */
  showDownload?: boolean;
  onRemove: (key: string) => void;
  onRetry: (key: string) => void;
  onCancel: (key: string) => void;
}

export default function FileItem({
  item,
  settings,
  showDownload = true,
  onRemove,
  onRetry,
  onCancel,
}: Props) {
  const t = useTranslations('Compressor.queue');

  const busy =
    item.phase === 'creating' ||
    item.phase === 'uploading' ||
    item.phase === 'processing';

  const percent =
    item.phase === 'uploading'
      ? item.uploadPercent
      : item.phase === 'processing'
        ? Math.max(item.processPercent, 5)
        : item.phase === 'done'
          ? 100
          : 0;

  // Only meaningful before the real number arrives.
  const predicted =
    item.phase === 'ready'
      ? estimateOutputBytes(settings, {
          sizeBytes: item.size,
          durationSeconds: item.durationSeconds,
          width: item.width,
          height: item.height,
        })
      : null;

  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-3 transition-colors sm:p-4',
        item.phase === 'done' && 'border-emerald-500/40 bg-emerald-500/5',
        item.phase === 'error' && 'border-destructive/40 bg-destructive/5'
      )}
    >
      <div className="flex items-start gap-3">
        {/* thumbnail, falling back to a state icon */}
        <div className="relative shrink-0">
          {item.poster ? (
            <div className="relative h-14 w-20 overflow-hidden rounded-lg bg-muted sm:h-16 sm:w-24">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.poster}
                alt=""
                className={cn(
                  'h-full w-full object-cover transition-opacity',
                  busy && 'opacity-40'
                )}
              />
              {busy && (
                <div className="absolute inset-0 grid place-items-center">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              )}
              {item.phase === 'done' && (
                <div className="absolute bottom-1 right-1 rounded-full bg-emerald-600 p-0.5">
                  <CheckCircle2 className="h-3 w-3 text-white" />
                </div>
              )}
            </div>
          ) : (
            <div className="grid h-14 w-20 place-items-center rounded-lg bg-muted sm:h-16 sm:w-24">
              {item.phase === 'done' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : item.phase === 'error' ? (
                <AlertCircle className="h-5 w-5 text-destructive" />
              ) : busy ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : (
                <FileVideo className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium" title={item.name}>
                {item.name}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatBytes(item.size)}
                {item.durationSeconds
                  ? ` · ${formatDuration(item.durationSeconds)}`
                  : ''}
                {item.width && item.height
                  ? ` · ${item.width}×${item.height}`
                  : ''}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {busy ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => onCancel(item.key)}
                >
                  {t('cancel')}
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onRemove(item.key)}
                  aria-label={t('remove')}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* queued: say what is about to happen */}
          {item.phase === 'ready' && predicted !== null && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t.rich('willBe', {
                size: formatBytes(predicted),
                hl: (chunks) => (
                  <span className="font-medium text-foreground">{chunks}</span>
                ),
              })}
            </p>
          )}

          {item.phase === 'canceled' && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t('phase.canceled')}
            </p>
          )}

          {busy && (
            <div className="mt-2.5 space-y-1">
              <Progress value={percent} className="h-1.5" />
              <p className="text-[11px] tabular-nums text-muted-foreground">
                {item.phase === 'uploading'
                  ? t('progress.uploading', { percent: item.uploadPercent })
                  : item.phase === 'creating'
                    ? t('progress.creating')
                    : t('progress.processing', {
                        percent: item.processPercent,
                      })}
              </p>
            </div>
          )}

          {item.phase === 'done' && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="text-sm tabular-nums">
                <span className="text-muted-foreground line-through">
                  {formatBytes(item.size)}
                </span>
                <span className="mx-1.5 text-muted-foreground">→</span>
                <span className="font-semibold text-emerald-600">
                  {formatBytes(item.outputSize)}
                </span>
                {item.savedPercent !== null && item.savedPercent > 0 && (
                  <Badge className="ml-2 bg-emerald-600 text-[10px] hover:bg-emerald-600">
                    −{item.savedPercent}%
                  </Badge>
                )}
              </div>
              {item.downloadUrl && showDownload && (
                <Button asChild size="sm" className="ml-auto h-8">
                  <a href={item.downloadUrl} download>
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    {t('download')}
                  </a>
                </Button>
              )}
            </div>
          )}

          {item.phase === 'error' && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-xs text-destructive">
                {item.error || t('errorFallback')}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => onRetry(item.key)}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                {t('retry')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
