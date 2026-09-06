import type { Platform } from '@/config/platforms';
import { getTranslations } from 'next-intl/server';

function fmt(mb: number): string {
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  return `${mb} MB`;
}

/**
 * The platform's own tiers, with the footnote that makes the number usable.
 *
 * The notes are the point. A table of headline limits is a commodity — every
 * competing page has one. The reason someone lands here is that their upload
 * failed at a size the headline said was fine.
 */
export default async function LimitsTable({
  platform,
  locale,
}: {
  platform: Platform;
  locale: string;
}) {
  const t = await getTranslations({ locale, namespace: 'Tools.limits' });

  return (
    <div>
      <div className="bg-card ring-muted overflow-hidden rounded-2xl border shadow-xs ring-4 dark:ring-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th scope="col" className="px-5 py-3 font-semibold">
                {t('colTier')}
              </th>
              <th scope="col" className="px-5 py-3 font-semibold whitespace-nowrap">
                {t('colLimit')}
              </th>
            </tr>
          </thead>
          <tbody>
            {platform.tiers.map((tier) => (
              <tr key={tier.name} className="border-t align-top">
                <td className="px-5 py-4 font-medium">{tier.name}</td>
                <td className="px-5 py-4">
                  <span className="font-semibold whitespace-nowrap">
                    {fmt(tier.limitMb)}
                  </span>
                  {tier.note && (
                    <p className="text-muted-foreground mt-1.5 max-w-prose text-sm leading-relaxed font-normal">
                      {tier.note}
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dated + sourced on purpose. The main competitor in this category shows
          no dates anywhere, which is convenient for them and useless for the
          reader when a platform quietly changes its cap. */}
      <p className="text-muted-foreground mt-3 text-xs">
        {t('verified', { date: platform.verifiedAt })}{' '}
        {platform.sources.map((s, i) => (
          <span key={s.url}>
            {i > 0 && ' · '}
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="underline underline-offset-2"
            >
              {s.label}
            </a>
          </span>
        ))}
      </p>
    </div>
  );
}
