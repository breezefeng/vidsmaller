'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type { CompressorContext } from '@/lib/compress/client';
import { formatBytes } from '@/lib/compress/client';
import {
  estimatePresetBytes,
  PLATFORM_TARGETS,
  type EstimateInput,
} from '@/lib/compress/estimate';
import {
  QUICK_PRESETS,
  RESOLUTION_PRESETS,
  type CompressSettings,
} from '@/lib/freeconvert/presets';
import { cn } from '@/lib/utils';
import { ChevronDown, Lock, SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const PRESET_KEYS = Object.keys(QUICK_PRESETS) as Array<
  keyof typeof QUICK_PRESETS
>;

/** Modes that live behind "Advanced" rather than in the main chip row. */
const FINE_MODES = ['quality', 'resolution', 'bitrate'] as const;
type FineMode = (typeof FINE_MODES)[number];

const SPEEDS = ['veryfast', 'faster', 'fast', 'medium', 'slow'] as const;

const MB = 1024 * 1024;

interface Props {
  settings: CompressSettings;
  onChange: (next: CompressSettings) => void;
  context: CompressorContext | null;
  /** the file the estimates are about; null before anything is queued */
  source: EstimateInput | null;
  disabled?: boolean;
}

export default function SettingsPanel({
  settings,
  onChange,
  context,
  source,
  disabled,
}: Props) {
  const t = useTranslations('Compressor.settings');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const advancedCodecs = context?.limits.allowAdvancedCodecs ?? false;
  const sizeBytes = source?.sizeBytes ?? 0;

  const set = <K extends keyof CompressSettings>(
    key: K,
    value: CompressSettings[K]
  ) => onChange({ ...settings, [key]: value });

  /**
   * Switching mode has to seed that mode's own value. Without this, picking
   * "Exact size" and pressing compress sent `mode: target_size` with no
   * `targetSizeMb`, which the request schema rejects with a 400 — the UI
   * showed a default in the input but never wrote it into state.
   */
  const setMode = (mode: CompressSettings['mode']) => {
    const next: CompressSettings = { ...settings, mode };

    if (mode === 'target_size' && next.targetSizeMb === undefined) {
      // Half the source, rounded to something a human would type.
      const half = sizeBytes ? Math.max(1, Math.round(sizeBytes / 2 / MB)) : 25;
      next.targetSizeMb = half;
    }
    if (mode === 'quality' && next.crf === undefined) next.crf = 28;
    if (mode === 'resolution' && next.resolution === undefined) {
      next.resolution = '1280:720';
    }
    if (mode === 'bitrate' && next.bitrateKbps === undefined) {
      next.bitrateKbps = 2000;
    }
    onChange(next);
  };

  const maxTargetMb = Math.max(
    2,
    Math.ceil((sizeBytes || 500 * MB) / MB)
  );
  const targetMb = settings.targetSizeMb ?? Math.round(maxTargetMb / 2);
  const fineMode: FineMode | 'off' = (FINE_MODES as readonly string[]).includes(
    settings.mode
  )
    ? (settings.mode as FineMode)
    : 'off';

  return (
    <div className={cn('space-y-4', disabled && 'pointer-events-none opacity-60')}>
      {/* ---------------- primary: how small? ---------------- */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label className="text-sm font-medium">{t('howSmall')}</Label>
          {fineMode !== 'off' && (
            <Badge variant="secondary" className="text-[10px]">
              {t(`modes.${fineMode}`)}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {PRESET_KEYS.map((key) => {
            const active = settings.mode === 'preset' && settings.preset === key;
            const bytes = estimatePresetBytes(key, sizeBytes);
            return (
              <button
                key={key}
                type="button"
                onClick={() => onChange({ ...settings, mode: 'preset', preset: key })}
                className={cn(
                  'rounded-xl border-2 px-3 py-2.5 text-left transition-all',
                  active
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:border-primary/40'
                )}
              >
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  {t(`presets.${key}.title`)}
                  {key === 'balanced' && (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-primary"
                      aria-hidden
                    />
                  )}
                </div>
                <div
                  className={cn(
                    'mt-0.5 text-[11px] leading-tight tabular-nums',
                    active ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {bytes
                    ? `≈ ${formatBytes(bytes)}`
                    : t(`presets.${key}.ratio`)}
                </div>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setMode('target_size')}
            className={cn(
              // 5 chips in a 2-column phone grid leaves a hole on the last
              // row; letting this one span both keeps the block square.
              'col-span-2 rounded-xl border-2 px-3 py-2.5 text-left transition-all sm:col-span-1',
              settings.mode === 'target_size'
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border hover:border-primary/40'
            )}
          >
            <div className="text-sm font-semibold">{t('exact.title')}</div>
            <div
              className={cn(
                'mt-0.5 text-[11px] leading-tight tabular-nums',
                settings.mode === 'target_size'
                  ? 'text-primary'
                  : 'text-muted-foreground'
              )}
            >
              {settings.mode === 'target_size'
                ? `${targetMb} MB`
                : t('exact.hint')}
            </div>
          </button>
        </div>
      </div>

      {/* ---------------- exact size controls ---------------- */}
      {settings.mode === 'target_size' && (
        <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
          <div className="flex flex-wrap gap-1.5">
            {PLATFORM_TARGETS.map((p) => {
              // A target bigger than the source is a no-op; offering it would
              // promise a compression that cannot happen.
              const pointless = sizeBytes > 0 && p.mb * MB >= sizeBytes;
              return (
                <Button
                  key={p.key}
                  type="button"
                  size="sm"
                  variant={targetMb === p.mb ? 'default' : 'outline'}
                  disabled={pointless}
                  className="h-7 rounded-full px-3 text-xs"
                  onClick={() => set('targetSizeMb', p.mb)}
                >
                  {t(`platforms.${p.key}`)} · {p.mb} MB
                </Button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <Slider
              min={1}
              max={maxTargetMb}
              step={maxTargetMb > 200 ? 5 : 1}
              value={[Math.min(targetMb, maxTargetMb)]}
              onValueChange={([v]) => set('targetSizeMb', v)}
              className="flex-1"
              aria-label={t('targetSize.label')}
            />
            <div className="flex shrink-0 items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={10240}
                value={targetMb}
                onChange={(e) =>
                  set('targetSizeMb', Math.max(1, Number(e.target.value) || 1))
                }
                className="h-9 w-20 rounded-md border bg-background px-2 text-right text-sm tabular-nums"
                aria-label={t('targetSize.label')}
              />
              <span className="text-sm text-muted-foreground">MB</span>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- advanced ---------------- */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {t('advanced')}
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                advancedOpen && 'rotate-180'
              )}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-4 pt-2">
          {/* fine-grained target override */}
          <div className="space-y-2">
            <Label>{t('fine.label')}</Label>
            <Select
              value={fineMode}
              onValueChange={(v) => {
                if (v === 'off') {
                  // Only fall back to the preset row when a fine mode was
                  // actually active — otherwise this would silently drag the
                  // user out of "Exact size".
                  if (fineMode !== 'off') setMode('preset');
                  return;
                }
                setMode(v as FineMode);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">{t('fine.off')}</SelectItem>
                {FINE_MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(`modes.${m}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('fine.hint')}</p>
          </div>

          {settings.mode === 'quality' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t('quality.label')}</Label>
                <Badge variant="secondary" className="tabular-nums">
                  {settings.crf ?? 28}
                </Badge>
              </div>
              <Slider
                min={18}
                max={51}
                step={1}
                value={[settings.crf ?? 28]}
                onValueChange={([v]) => set('crf', v)}
              />
              <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                <span>{t('quality.best', { value: '18' })}</span>
                <span>{t('quality.smallest', { value: '51' })}</span>
              </div>
            </div>
          )}

          {settings.mode === 'resolution' && (
            <div className="space-y-2">
              <Label>{t('resolution.label')}</Label>
              <Select
                value={settings.resolution ?? '1280:720'}
                onValueChange={(v) =>
                  set('resolution', v as CompressSettings['resolution'])
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('resolution.placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {RESOLUTION_PRESETS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r.replace(':', ' × ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {settings.mode === 'bitrate' && (
            <div className="space-y-2">
              <Label htmlFor="bitrate">{t('bitrate.label')}</Label>
              <input
                id="bitrate"
                type="number"
                min={100}
                max={512000}
                step={100}
                value={settings.bitrateKbps ?? 2000}
                onChange={(e) =>
                  set('bitrateKbps', Math.max(100, Number(e.target.value) || 100))
                }
                className="h-10 w-full rounded-md border bg-background px-3 text-sm tabular-nums"
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>{t('codec.label')}</Label>
              <Select
                value={settings.codec}
                onValueChange={(v) => set('codec', v as CompressSettings['codec'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="libx264">{t('codec.h264')}</SelectItem>
                  <SelectItem value="libx265" disabled={!advancedCodecs}>
                    <span className="flex items-center gap-1.5">
                      {t('codec.h265')}
                      {!advancedCodecs && <Lock className="h-3 w-3 shrink-0" />}
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('outputFormat.label')}</Label>
              <Select
                value={settings.outputFormat}
                onValueChange={(v) =>
                  set('outputFormat', v as CompressSettings['outputFormat'])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mp4">MP4</SelectItem>
                  <SelectItem value="mkv">MKV</SelectItem>
                  <SelectItem value="webm">WebM</SelectItem>
                  <SelectItem value="mov">MOV</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('speed.label')}</Label>
              <Select
                value={settings.speed}
                onValueChange={(v) => set('speed', v as CompressSettings['speed'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPEEDS.map((speed) => (
                    <SelectItem key={speed} value={speed}>
                      {t(`speed.${speed}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">{t('oldDevice.label')}</div>
              <div className="text-xs text-muted-foreground">
                {t('oldDevice.hint')}
              </div>
            </div>
            <Switch
              checked={settings.oldDeviceCompatible}
              onCheckedChange={(v) => set('oldDeviceCompatible', v)}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
