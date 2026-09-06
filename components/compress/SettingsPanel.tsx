'use client';

import { Badge } from '@/components/ui/badge';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { CompressorContext } from '@/lib/compress/client';
import {
  QUICK_PRESETS,
  RESOLUTION_PRESETS,
  type CompressSettings,
} from '@/lib/freeconvert/presets';
import { cn } from '@/lib/utils';
import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';

const MODES = [
  'preset',
  'target_size',
  'quality',
  'resolution',
  'bitrate',
] as const;

const SPEEDS = ['veryfast', 'faster', 'fast', 'medium', 'slow'] as const;

interface Props {
  settings: CompressSettings;
  onChange: (next: CompressSettings) => void;
  context: CompressorContext | null;
  disabled?: boolean;
}

export default function SettingsPanel({
  settings,
  onChange,
  context,
  disabled,
}: Props) {
  const t = useTranslations('Compressor.settings');

  const set = <K extends keyof CompressSettings>(
    key: K,
    value: CompressSettings[K]
  ) => onChange({ ...settings, [key]: value });

  const advancedCodecs = context?.limits.allowAdvancedCodecs ?? false;

  return (
    <div className={cn('space-y-6', disabled && 'pointer-events-none opacity-60')}>
      <Tabs
        value={settings.mode}
        onValueChange={(v) => set('mode', v as CompressSettings['mode'])}
      >
        {/*
          Five equal columns cannot fit translated labels on a phone (CJK in
          particular), so the bar wraps below `sm` and each row stretches to
          fill. `h-auto` is needed to escape the fixed `h-9` on TabsList.
        */}
        <TabsList className="flex h-auto w-full flex-wrap gap-1">
          {MODES.map((mode) => (
            <TabsTrigger
              key={mode}
              value={mode}
              className="h-8 flex-1 basis-24 px-1.5 text-xs sm:basis-0"
            >
              {t(`modes.${mode}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {settings.mode === 'preset' && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            Object.keys(QUICK_PRESETS) as Array<keyof typeof QUICK_PRESETS>
          ).map((key) => {
            const active = settings.preset === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => set('preset', key)}
                className={cn(
                  'rounded-xl border-2 p-3 text-left transition-all',
                  active
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:border-primary/40'
                )}
              >
                <div className="text-sm font-semibold">
                  {t(`presets.${key}.title`)}
                </div>
                <div className="mt-1 text-[11px] leading-tight text-muted-foreground">
                  {t(`presets.${key}.hint`)}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {settings.mode === 'target_size' && (
        <div className="space-y-2">
          <Label htmlFor="target-size">{t('targetSize.label')}</Label>
          <input
            id="target-size"
            type="number"
            min={1}
            max={10240}
            value={settings.targetSizeMb ?? 25}
            onChange={(e) =>
              set('targetSizeMb', Math.max(1, Number(e.target.value) || 1))
            }
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {t('targetSize.hint')}
          </p>
        </div>
      )}

      {settings.mode === 'quality' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>{t('quality.label')}</Label>
            <Badge variant="secondary">{settings.crf ?? 28}</Badge>
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
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
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
    </div>
  );
}
