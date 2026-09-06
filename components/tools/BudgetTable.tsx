import {
  buildBudget,
  DEFAULT_AUDIO_KBPS,
  formatDuration,
  formatSize,
} from '@/lib/seo/bitrate-budget';
import { cn } from '@/lib/utils';
import { getTranslations } from 'next-intl/server';

const VERDICT_STYLES: Record<string, string> = {
  good: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  ok: 'bg-amber-500/10 text-amber-700 dark:text-amber-500',
  rough: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  impossible: 'bg-red-500/10 text-red-700 dark:text-red-400',
};

/**
 * "What N MB actually buys you."
 *
 * The one block on these pages that nobody else has, because working it out
 * requires deciding what you believe about bitrate rather than copying a number
 * off a help page.
 *
 * Two columns, two epistemic statuses, and the copy says which is which:
 * the bitrate is arithmetic, the resolution is a recommendation.
 */
export default async function BudgetTable({
  targetMb,
  durations,
  locale,
}: {
  targetMb: number;
  durations?: number[];
  locale: string;
}) {
  const t = await getTranslations({ locale, namespace: 'Tools.budget' });
  const rows = buildBudget(targetMb, durations);

  return (
    <div>
      <div className="bg-card ring-muted overflow-x-auto rounded-2xl border shadow-xs ring-4 dark:ring-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th scope="col" className="px-5 py-3 font-semibold whitespace-nowrap">
                {t('colDuration')}
              </th>
              <th scope="col" className="px-5 py-3 font-semibold whitespace-nowrap">
                {t('colBitrate')}
              </th>
              <th scope="col" className="px-5 py-3 font-semibold whitespace-nowrap">
                {t('colResolution')}
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                {t('colVerdict')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.durationSeconds} className="border-t">
                <td className="px-5 py-3 font-medium whitespace-nowrap">
                  {formatDuration(row.durationSeconds)}
                </td>
                <td className="px-5 py-3 tabular-nums whitespace-nowrap">
                  {row.videoKbps > 0
                    ? `${row.videoKbps.toLocaleString()} kbps`
                    : '—'}
                </td>
                <td className="px-5 py-3 whitespace-nowrap">
                  {row.bestResolution?.label ??
                    row.watchableResolution?.label ??
                    '—'}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={cn(
                      'inline-block rounded-full px-2.5 py-0.5 text-xs font-medium',
                      VERDICT_STYLES[row.verdict]
                    )}
                  >
                    {t(`verdict.${row.verdict}`)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-muted-foreground mt-3 max-w-prose text-xs leading-relaxed">
        {t('method', {
          audio: DEFAULT_AUDIO_KBPS,
          target: formatSize(targetMb),
        })}
      </p>
    </div>
  );
}
