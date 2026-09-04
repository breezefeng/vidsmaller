'use client';

import type { CompressItem } from '@/components/compress/useCompressor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { formatBytes, formatDuration } from '@/lib/compress/client';
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

interface Props {
  item: CompressItem;
  onRemove: (key: string) => void;
  onRetry: (key: string) => void;
}

const PHASE_LABEL: Record<CompressItem['phase'], string> = {
  ready: 'Ready',
  creating: 'Preparing…',
  uploading: 'Uploading',
  processing: 'Compressing',
  done: 'Done',
  error: 'Failed',
  canceled: 'Canceled',
};

export default function FileItem({ item, onRemove, onRetry }: Props) {
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

  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-4 transition-colors',
        item.phase === 'done' && 'border-emerald-500/40 bg-emerald-500/5',
        item.phase === 'error' && 'border-destructive/40 bg-destructive/5'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 rounded-lg bg-muted p-2">
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
              <Badge
                variant={
                  item.phase === 'done'
                    ? 'default'
                    : item.phase === 'error'
                      ? 'destructive'
                      : 'secondary'
                }
                className="text-[10px]"
              >
                {PHASE_LABEL[item.phase]}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onRemove(item.key)}
                aria-label="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {busy && (
            <div className="mt-3 space-y-1">
              <Progress value={percent} className="h-1.5" />
              <p className="text-[11px] text-muted-foreground">
                {item.phase === 'uploading'
                  ? `Uploading ${item.uploadPercent}%`
                  : item.phase === 'creating'
                    ? 'Creating job…'
                    : `Compressing on the server… ${item.processPercent}%`}
              </p>
            </div>
          )}

          {item.phase === 'done' && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="text-sm">
                <span className="text-muted-foreground line-through">
                  {formatBytes(item.size)}
                </span>
                <span className="mx-1.5">→</span>
                <span className="font-semibold text-emerald-600">
                  {formatBytes(item.outputSize)}
                </span>
                {item.savedPercent !== null && item.savedPercent > 0 && (
                  <Badge className="ml-2 bg-emerald-600 text-[10px] hover:bg-emerald-600">
                    −{item.savedPercent}%
                  </Badge>
                )}
              </div>
              {item.downloadUrl && (
                <Button asChild size="sm" className="ml-auto h-8">
                  <a href={item.downloadUrl} download>
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Download
                  </a>
                </Button>
              )}
            </div>
          )}

          {item.phase === 'error' && (
            <div className="mt-3 flex items-center gap-2">
              <p className="flex-1 text-xs text-destructive">
                {item.error || 'Something went wrong.'}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => onRetry(item.key)}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
