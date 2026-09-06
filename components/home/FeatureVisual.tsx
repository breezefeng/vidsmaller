import { cn } from '@/lib/utils';
import { Check, Cloud, FileVideo, Gauge, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Lightweight, dependency-free illustrations for the feature sections.
 * Beats shipping a grey placeholder box, and stays sharp on every screen.
 */
export default function FeatureVisual({ index }: { index: number }) {
  if (index === 1) return <QualityVisual />;
  if (index === 2) return <CloudVisual />;
  return <TargetSizeVisual />;
}

function Frame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // Height follows the content instead of a fixed aspect ratio: on narrow
        // screens a 16/10 box is far too short and silently clips the visual.
        'flex min-h-56 w-full items-center overflow-hidden rounded-lg bg-gradient-to-br from-muted/60 to-muted/20 p-4 sm:min-h-72 sm:p-7',
        className
      )}
    >
      <div className="w-full">{children}</div>
    </div>
  );
}

function TargetSizeVisual() {
  const t = useTranslations('Landing.Features.visuals.targetSize');

  // Brand names and sizes are the same in every locale, so they stay in code.
  const presets = [
    { label: 'Email', size: '25 MB' },
    { label: 'WhatsApp', size: '16 MB' },
    { label: 'Discord', size: '10 MB' },
  ];

  return (
    <Frame>
      <div className="flex flex-col gap-5">
        <div className="flex items-end gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 truncate text-xs text-muted-foreground">
              {t('original')}
            </div>
            <div className="h-9 w-full rounded-md bg-foreground/15" />
            <div className="mt-1.5 text-sm font-semibold">248 MB</div>
          </div>
          <div className="shrink-0 pb-8 text-muted-foreground">→</div>
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 truncate text-xs text-muted-foreground">
              {t('target', { size: '24 MB' })}
            </div>
            <div className="h-9 w-[22%] rounded-md bg-primary" />
            <div className="mt-1.5 text-sm font-semibold text-emerald-600">
              23.6 MB
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {presets.map((p) => (
            <span
              key={p.label}
              className="whitespace-nowrap rounded-full border bg-background/70 px-2.5 py-1 text-[11px] sm:px-3 sm:text-xs"
            >
              {p.label} · {p.size}
            </span>
          ))}
        </div>
      </div>
    </Frame>
  );
}

function QualityVisual() {
  const t = useTranslations('Landing.Features.visuals.quality');

  return (
    <Frame>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Gauge className="h-4 w-4 shrink-0 text-primary" />
          {t('title')}
        </div>

        <div className="relative h-2 w-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500">
          <div className="absolute -top-1 left-[34%] h-4 w-4 rounded-full border-2 border-background bg-foreground shadow" />
        </div>
        <div className="flex justify-between gap-2 text-[10px] text-muted-foreground sm:text-[11px]">
          <span className="whitespace-nowrap">
            {t('scaleLow', { value: '18' })}
          </span>
          <span className="whitespace-nowrap">28</span>
          <span className="whitespace-nowrap">
            {t('scaleHigh', { value: '51' })}
          </span>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 sm:gap-3">
          {[
            { codec: 'H.264', bar: 'w-full', note: t('h264Note') },
            { codec: 'H.265', bar: 'w-[70%]', note: t('h265Note') },
          ].map((row) => (
            <div
              key={row.codec}
              className="rounded-lg border bg-background/60 p-2.5 sm:p-3"
            >
              <div className="text-xs font-medium">{row.codec}</div>
              <div className="mt-2 h-2 w-full rounded-full bg-muted">
                <div className={cn('h-2 rounded-full bg-primary', row.bar)} />
              </div>
              <div className="mt-1.5 text-[10px] leading-snug text-muted-foreground sm:text-[11px]">
                {row.note}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

function CloudVisual() {
  const t = useTranslations('Landing.Features.visuals.cloud');

  // Sample filenames are deliberately locale-independent.
  const rows = [
    { name: 'keynote-recording.mov', pct: 100, done: true },
    { name: 'drone-b-roll.mp4', pct: 64, done: false },
    { name: 'interview-final.mkv', pct: 0, done: false },
  ];

  return (
    <Frame>
      <div className="flex flex-col gap-2.5 sm:gap-3">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium">
          <Cloud className="h-4 w-4 shrink-0 text-primary" />
          {t('title')}
        </div>

        {rows.map((row) => (
          <div
            key={row.name}
            className="flex items-center gap-2.5 rounded-lg border bg-background/60 p-2.5 sm:gap-3 sm:p-3"
          >
            <div className="rounded-md bg-muted p-1.5">
              {row.done ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : row.pct > 0 ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : (
                <FileVideo className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs">{row.name}</div>
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted">
                <div
                  className={cn(
                    'h-1.5 rounded-full',
                    row.done ? 'bg-emerald-500' : 'bg-primary'
                  )}
                  style={{ width: `${row.pct}%` }}
                />
              </div>
            </div>
            <div className="shrink-0 text-[10px] tabular-nums text-muted-foreground sm:text-[11px]">
              {row.done ? '−78%' : row.pct > 0 ? `${row.pct}%` : t('queued')}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}
