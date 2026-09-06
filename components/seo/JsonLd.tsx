import { siteConfig } from '@/config/site';
import { DEFAULT_LOCALE, LOCALE_TO_HREFLANG, type Locale } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';

/**
 * Structured data.
 *
 * Deliberately NOT included: `AggregateRating`. Competitors in this category
 * ship a SoftwareApplication with a hardcoded 4.8/5 and no reviews behind it,
 * which is a manual-action risk and is exactly the kind of unbacked claim our
 * positioning is supposed to be the opposite of. Add it when there are real
 * reviews to point at.
 *
 * Everything here is generated from the same translation keys the visible page
 * renders from, so the markup can never describe a page that doesn't exist.
 */

type Json = Record<string, unknown>;

function url(locale: string, path = '') {
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  return `${siteConfig.url}${prefix}${path}`;
}

/** One <script> per graph, rather than one merged @graph, so a malformed
 *  block can't invalidate the rest. */
function Script({ data }: { data: Json }) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

// ---------------------------------------------------------------- org / site

export function organizationId() {
  return `${siteConfig.url}/#organization`;
}

export async function OrganizationJsonLd({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'Home' });

  const sameAs = Object.values(siteConfig.socialLinks ?? {}).filter(
    (v): v is string => typeof v === 'string' && v.startsWith('http')
  );

  return (
    <Script
      data={{
        '@context': 'https://schema.org',
        '@type': 'Organization',
        '@id': organizationId(),
        name: siteConfig.name,
        url: siteConfig.url,
        description: t('description'),
        logo: {
          '@type': 'ImageObject',
          url: `${siteConfig.url}/logo-512.png`,
          width: 512,
          height: 512,
        },
        ...(sameAs.length ? { sameAs } : {}),
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'customer support',
          email: siteConfig.socialLinks?.email,
          availableLanguage: Object.values(LOCALE_TO_HREFLANG),
        },
      }}
    />
  );
}

export async function WebSiteJsonLd({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'Home' });

  return (
    <Script
      data={{
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        '@id': `${siteConfig.url}/#website`,
        name: siteConfig.name,
        url: siteConfig.url,
        description: t('description'),
        inLanguage: LOCALE_TO_HREFLANG[locale] ?? locale,
        publisher: { '@id': organizationId() },
        // No SearchAction: there is no site search. Declaring one that does
        // not exist is a spam signal, not a shortcut to a sitelinks searchbox.
      }}
    />
  );
}

// ---------------------------------------------------------------- the product

export async function SoftwareApplicationJsonLd({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'Landing' });
  const tHome = await getTranslations({ locale, namespace: 'Home' });

  const features: string[] = (t.raw('Features.items') as { title: string }[]).map(
    (i) => i.title
  );

  return (
    <Script
      data={{
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        '@id': `${siteConfig.url}/#software`,
        name: siteConfig.name,
        url: url(locale),
        applicationCategory: 'MultimediaApplication',
        applicationSubCategory: 'Video Compressor',
        operatingSystem: 'Any (web-based)',
        browserRequirements: 'Requires JavaScript. Works in any modern browser.',
        description: tHome('description'),
        inLanguage: LOCALE_TO_HREFLANG[locale] ?? locale,
        featureList: features,
        publisher: { '@id': organizationId() },
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
          description: 'Free tier with no watermark and no account required.',
          url: url(locale, '/pricing'),
        },
      }}
    />
  );
}

// ---------------------------------------------------------------- page-level

export async function FaqJsonLd({
  locale,
  namespace = 'Landing.FAQ',
  items: given,
  path = '',
}: {
  locale: Locale;
  namespace?: string;
  /** Supply the questions directly instead of reading `<namespace>.items`. */
  items?: { question: string; answer: string }[];
  path?: string;
}) {
  let items = given;
  if (!items) {
    const t = await getTranslations({ locale, namespace });
    items = t.raw('items') as { question: string; answer: string }[];
  }

  if (!items?.length) return null;

  return (
    <Script
      data={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        '@id': `${url(locale, path)}#faq`,
        mainEntity: items.map((i) => ({
          '@type': 'Question',
          name: i.question,
          acceptedAnswer: { '@type': 'Answer', text: i.answer },
        })),
      }}
    />
  );
}

export async function HowToJsonLd({
  locale,
  override,
}: {
  locale: Locale;
  /** Tool pages interpolate the platform name, so they build steps themselves. */
  override?: {
    name: string;
    description: string;
    steps: { name: string; text: string }[];
    path: string;
  };
}) {
  let name: string;
  let description: string;
  let steps: { name: string; text: string }[];
  const path = override?.path ?? '';

  if (override) {
    ({ name, description, steps } = override);
  } else {
    const t = await getTranslations({ locale, namespace: 'Landing.HowTo' });
    name = t('title');
    description = t('description');
    steps = t.raw('steps') as { name: string; text: string }[];
  }

  if (!steps?.length) return null;

  return (
    <Script
      data={{
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        '@id': `${url(locale, path)}#howto`,
        name,
        description,
        totalTime: 'PT1M',
        tool: [{ '@type': 'HowToTool', name: siteConfig.name }],
        step: steps.map((s, i) => ({
          '@type': 'HowToStep',
          position: i + 1,
          name: s.name,
          text: s.text,
          url: `${url(locale, path)}#how-to`,
        })),
      }}
    />
  );
}

export function BreadcrumbJsonLd({
  locale,
  items,
}: {
  locale: Locale;
  /** Ordered, excluding Home — that is prepended automatically. */
  items: { name: string; path: string }[];
}) {
  return (
    <Script
      data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [{ name: 'Home', path: '' }, ...items].map(
          (item, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: item.name,
            item: url(locale, item.path),
          })
        ),
      }}
    />
  );
}

/**
 * A blog post.
 *
 * Deliberately carries `datePublished` and an author. The main competitor in
 * this category publishes no dates anywhere, which lets them retitle a post
 * "2027" every January at zero cost. We are betting the other way: these pages
 * live or die on whether a reader believes the numbers in them, and an
 * undated measurement is not a measurement.
 */
export async function ArticleJsonLd({
  locale,
  title,
  description,
  slug,
  publishedAt,
  modifiedAt,
  image,
}: {
  locale: Locale;
  title: string;
  description: string;
  /** Without the /blog prefix or leading slash. */
  slug: string;
  publishedAt: Date;
  modifiedAt?: Date | null;
  image?: string | null;
}) {
  const path = `/blog/${slug.replace(/^\//, '')}`;
  const canonical = url(locale, path);

  return (
    <Script
      data={{
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        '@id': `${canonical}#article`,
        headline: title.slice(0, 110),
        description,
        inLanguage: LOCALE_TO_HREFLANG[locale] ?? locale,
        datePublished: publishedAt.toISOString(),
        dateModified: (modifiedAt ?? publishedAt).toISOString(),
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
        author: {
          '@type': 'Organization',
          '@id': organizationId(),
          name: siteConfig.name,
        },
        publisher: { '@id': organizationId() },
        ...(image
          ? {
              image: image.startsWith('http')
                ? image
                : `${siteConfig.url}${image.startsWith('/') ? '' : '/'}${image}`,
            }
          : {}),
      }}
    />
  );
}
