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

const PRESET_COPY: Record<
  keyof typeof QUICK_PRESETS,
  { title: string; hint: string }
> = {
  light: { title: 'Light', hint: '~70% of original · near-lossless' },
  balanced: { title: 'Balanced', hint: '~50% of original · recommended' },
  strong: { title: 'Strong', hint: '~30% of original · great for sharing' },
  extreme: { title: 'Extreme', hint: '~15% of original · smallest file' },
};

const MODES = [
  { value: 'preset', label: 'Preset' },
  { value: 'target_size', label: 'Target size' },
  { value: 'quality', label: 'Quality' },
  { value: 'resolution', label: 'Resolution' },
  { value: 'bitrate', label: 'Bitrate' },
] as const;

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
        <TabsList className="grid w-full grid-cols-5">
          {MODES.map((m) => (
            <TabsTrigger key={m.value} value={m.value} className="text-xs">
              {m.label}
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
                  {PRESET_COPY[key].title}
                </div>
                <div className="mt-1 text-[11px] leading-tight text-muted-foreground">
                  {PRESET_COPY[key].hint}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {settings.mode === 'target_size' && (
        <div className="space-y-2">
          <Label htmlFor="target-size">Target file size (MB)</Label>
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
            Handy for Discord (10 MB), email (25 MB) or WhatsApp (16 MB) limits.
          </p>
        </div>
      )}

      {settings.mode === 'quality' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Constant quality (CRF)</Label>
            <Badge variant="secondary">{settings.crf ?? 28}</Badge>
          </div>
          <Slider
            min={18}
            max={51}
            step={1}
            value={[settings.crf ?? 28]}
            onValueChange={([v]) => set('crf', v)}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>18 · best quality</span>
            <span>51 · smallest</span>
          </div>
        </div>
      )}

      {settings.mode === 'resolution' && (
        <div className="space-y-2">
          <Label>Output resolution</Label>
          <Select
            value={settings.resolution ?? '1280:720'}
            onValueChange={(v) =>
              set('resolution', v as CompressSettings['resolution'])
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Pick a resolution" />
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
          <Label htmlFor="bitrate">Max bitrate (kbps)</Label>
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
          <Label>Codec</Label>
          <Select
            value={settings.codec}
            onValueChange={(v) => set('codec', v as CompressSettings['codec'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="libx264">H.264 · most compatible</SelectItem>
              <SelectItem value="libx265" disabled={!advancedCodecs}>
                <span className="flex items-center gap-1.5">
                  H.265 · ~30% smaller
                  {!advancedCodecs && <Lock className="h-3 w-3" />}
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Output format</Label>
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
          <Label>Encoder speed</Label>
          <Select
            value={settings.speed}
            onValueChange={(v) => set('speed', v as CompressSettings['speed'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="veryfast">Very fast</SelectItem>
              <SelectItem value="faster">Faster</SelectItem>
              <SelectItem value="fast">Fast</SelectItem>
              <SelectItem value="medium">Medium · balanced</SelectItem>
              <SelectItem value="slow">Slow · best ratio</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <div className="text-sm font-medium">Old-device compatibility</div>
          <div className="text-xs text-muted-foreground">
            Baseline profile + yuv420p. Slightly larger, plays everywhere.
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
