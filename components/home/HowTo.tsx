import FeatureBadge from '@/components/shared/FeatureBadge';
import { useTranslations } from 'next-intl';

type Step = {
  name: string;
  text: string;
};

/**
 * "How to compress a video online" — the 3-step block.
 *
 * This exists for search intent as much as for users: "how to compress a
 * video" is one of the highest-volume queries in the category, and the
 * matching HowTo JSON-LD is emitted from components/seo/JsonLd.tsx off the
 * same translation keys, so the copy and the structured data can never drift.
 */
export default function HowTo() {
  const t = useTranslations('Landing.HowTo');
  const steps: Step[] = t.raw('steps');

  return (
    <section id="how-to" className="w-full py-20">
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

        <ol className="grid gap-6 md:grid-cols-3">
          {steps.map((step, i) => (
            <li
              key={step.name}
              className="bg-card ring-muted relative flex flex-col rounded-2xl border p-6 shadow-xs ring-4 dark:ring-0"
            >
              <span
                aria-hidden
                className="bg-primary/10 text-primary mb-4 flex h-10 w-10 items-center justify-center rounded-full text-lg font-semibold"
              >
                {i + 1}
              </span>
              <h3 className="mb-2 text-lg font-semibold">{step.name}</h3>
              <p className="text-muted-foreground text-base leading-relaxed">
                {step.text}
              </p>
            </li>
          ))}
        </ol>

        <p className="text-muted-foreground mx-auto mt-8 max-w-3xl text-center text-sm">
          {t('note')}
        </p>
      </div>
    </section>
  );
}
