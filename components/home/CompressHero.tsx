import Compressor from '@/components/compress/Compressor';
import { Shield, Timer, Wand2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function CompressHero() {
  const t = useTranslations('Landing.Hero');

  const trust = [
    { icon: Wand2, key: 'noWatermark' as const },
    { icon: Timer, key: 'fast' as const },
    { icon: Shield, key: 'private' as const },
  ];

  return (
    <section className="w-full">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center gap-8 py-12 lg:py-16">
          <div className="flex max-w-3xl flex-col gap-4 text-center">
            <h1 className="z-10 font-sans text-3xl font-bold md:text-5xl lg:text-6xl">
              <span className="title-gradient">{t('title')}</span>
            </h1>
            <p className="text-base leading-relaxed tracking-tight text-muted-foreground md:text-lg">
              {t('description')}
            </p>
          </div>

          <Compressor />

          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {trust.map(({ icon: Icon, key }) => (
              <li key={key} className="flex items-center gap-1.5">
                <Icon className="h-4 w-4 text-primary" />
                {t(`trust.${key}`)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
