import CrfCurveChart from '@/components/charts/CrfCurveChart';
import FeatureBadge from '@/components/shared/FeatureBadge';
import { useTranslations } from 'next-intl';

type Group = {
  title: string;
  body: string;
};

/**
 * "Formats, codecs and compression modes" — the reference block.
 *
 * Deliberately plain prose rather than icons and cards. This section exists to
 * carry the long-tail vocabulary a video-compression page is expected to
 * contain (container names, codec names, CRF, bitrate, resolution) and to be
 * quotable by AI answer engines, which want a paragraph they can lift, not a
 * grid of three-word feature labels.
 */
export default function Specs() {
  const t = useTranslations('Landing.Specs');
  const groups: Group[] = t.raw('groups');

  return (
    <section id="formats" className="w-full py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 flex flex-col items-center text-center">
          <FeatureBadge label={t('badge.label')} text={t('badge.text')} />
          <h2 className="z-10 mt-6 mb-4 font-sans text-3xl font-semibold md:text-5xl">
            <span className="title-gradient">{t('title')}</span>
          </h2>
          <p className="max-w-3xl text-xl text-gray-600 dark:text-gray-400">
            {t('description')}
          </p>
        </div>

        {/* The prose below says compressibility depends on the source. This is
            the measurement that makes that concrete instead of evasive. */}
        <div className="mb-12">
          <CrfCurveChart />
        </div>

        <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="mb-2 text-lg font-semibold">{group.title}</h3>
              <p className="text-muted-foreground text-base leading-relaxed">
                {group.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
