'use client';

import FileItem from '@/components/compress/FileItem';
import SettingsPanel from '@/components/compress/SettingsPanel';
import { useCompressor } from '@/components/compress/useCompressor';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { Link as I18nLink } from '@/i18n/routing';
import { formatBytes } from '@/lib/compress/client';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  ChevronDown,
  Coins,
  Settings2,
  Sparkles,
  Trash2,
  UploadCloud,
  Zap,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';

export default function Compressor() {
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
    startAll,
    retryItem,
    stats,
  } = useCompressor();

  const [settingsOpen, setSettingsOpen] = useState(false);

  const onDrop = useCallback(
    (accepted: File[]) => {
      void addFiles(accepted);
    },
    [addFiles]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    accept: { 'video/*': [] },
    multiple: (context?.limits.maxBatchFiles ?? 1) > 1,
  });

  const maxSize = context?.limits.maxFileSize ?? 200 * 1024 * 1024;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div
        {...getRootProps()}
        className={cn(
          'relative rounded-2xl border-2 border-dashed bg-card/60 p-8 backdrop-blur transition-all sm:p-12',
          isDragActive
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'border-border hover:border-primary/50'
        )}
      >
        <input {...getInputProps()} />

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

          <p className="text-xs text-muted-foreground">{t('dropzone.privacy')}</p>
        </div>
      </div>

      {/* status bar */}
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

      {/* settings */}
      <Collapsible
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        className="mt-4 rounded-xl border bg-card"
      >
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between p-4 text-left">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Settings2 className="h-4 w-4" />
              {t('settings.title')}
              <Badge variant="secondary" className="ml-1 text-[10px]">
                {settings.mode === 'preset'
                  ? t(`settings.presets.${settings.preset}.title`)
                  : t(`settings.modes.${settings.mode}`)}
              </Badge>
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                settingsOpen && 'rotate-180'
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Separator />
          <div className="p-4">
            <SettingsPanel
              settings={settings}
              onChange={setSettings}
              context={context}
              disabled={stats.busy}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* queue */}
      {items.length > 0 && (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <FileItem
              key={item.key}
              item={item}
              onRemove={removeItem}
              onRetry={retryItem}
            />
          ))}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              size="lg"
              className="h-11 flex-1 rounded-xl sm:flex-none sm:px-10"
              disabled={!stats.hasPending || stats.busy}
              onClick={startAll}
            >
              <Zap className="mr-2 h-4 w-4" />
              {stats.busy ? t('queue.working') : t('queue.compressNow')}
            </Button>

            <Button
              variant="ghost"
              size="lg"
              className="h-11"
              onClick={clearAll}
              disabled={stats.busy}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('queue.clear')}
            </Button>

            {stats.done > 0 && stats.savedBytes > 0 && (
              <div className="ml-auto text-sm text-muted-foreground">
                {t.rich('queue.saved', {
                  amount: `${formatBytes(stats.savedBytes)} (−${stats.savedPercent}%)`,
                  hl: (chunks) => (
                    <span className="font-semibold text-emerald-600">
                      {chunks}
                    </span>
                  ),
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
