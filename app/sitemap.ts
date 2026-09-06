import { listPublishedPostsAction } from '@/actions/posts/posts'
import { TOOL_SLUGS } from '@/config/platforms'
import { siteConfig } from '@/config/site'
import { DEFAULT_LOCALE, LOCALE_TO_HREFLANG, LOCALES } from '@/i18n/routing'
import { blogCms } from '@/lib/cms'
import { db } from '@/lib/db'
import { posts as postsSchema } from '@/lib/db/schema'
import { MetadataRoute } from 'next'
import { eq, max } from 'drizzle-orm'

const siteUrl = siteConfig.url

const STATIC_PAGE_MTIME = new Date(new Date().getFullYear(), 0, 1)

type ChangeFrequency = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never' | undefined

/** `''` -> `https://vidsmaller.com`, `'/blog'` -> `https://vidsmaller.com/ja/blog`. */
function localeUrl(locale: string, path: string): string {
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`
  return `${siteUrl}${prefix}${path}`
}

/**
 * hreflang alternates for a locale-prefixed path.
 *
 * Next serialises these as `<xhtml:link rel="alternate" hreflang="...">` inside
 * each `<url>`. Without them Google has to infer the relationship between
 * /blog, /zh/blog and /ja/blog from the page markup alone, and treats the three
 * as competing duplicates more often than not.
 */
function alternates(path: string) {
  const languages = Object.fromEntries(
    LOCALES.map((locale) => [LOCALE_TO_HREFLANG[locale] ?? locale, localeUrl(locale, path)])
  )
  return {
    languages: {
      ...languages,
      'x-default': localeUrl(DEFAULT_LOCALE, path),
    },
  }
}

/**
 * The sitemap is generated at build time. A missing or unreachable database
 * must not be able to fail the whole deployment, so every DB read here is
 * best-effort and falls back to a static timestamp.
 */
async function latestPostMtime(
  postType: 'blog' | 'glossary',
  fallback: Date
): Promise<Date> {
  try {
    const [result] = await db
      .select({ latest: max(postsSchema.updatedAt) })
      .from(postsSchema)
      .where(eq(postsSchema.postType, postType));
    return result?.latest ? new Date(result.latest) : fallback;
  } catch (error) {
    console.warn(
      `[sitemap] could not read latest ${postType} mtime, using fallback:`,
      (error as Error).message
    );
    return fallback;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Locale-prefixed static pages.
  //
  // changeFrequency is a hint, not a promise, and claiming 'daily' on a page
  // that changes twice a year teaches Google to ignore the field. These are the
  // real cadences.
  const staticPages: { path: string; priority: number; changeFrequency: ChangeFrequency }[] = [
    { path: '', priority: 1.0, changeFrequency: 'weekly' },
    { path: '/pricing', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/about', priority: 0.5, changeFrequency: 'yearly' },
  ]

  // The platform pages (/compress-video-for-discord etc). High priority: these
  // are money pages with commercial intent, and their limits move — monthly is
  // an honest cadence, not a bid for extra crawl budget.
  for (const slug of TOOL_SLUGS) {
    staticPages.push({ path: `/${slug}`, priority: 0.9, changeFrequency: 'monthly' })
  }

  const pages: MetadataRoute.Sitemap = LOCALES.flatMap(locale =>
    staticPages.map(page => ({
      url: localeUrl(locale, page.path),
      lastModified: STATIC_PAGE_MTIME,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
      alternates: alternates(page.path),
    }))
  )

  // Legal pages are not locale-prefixed (app/(site)) but must be indexable:
  // the Google OAuth consent screen links to them.
  const legalPages: MetadataRoute.Sitemap = [
    '/privacy-policy',
    '/terms-of-service',
    '/refund-policy',
  ].map((page) => ({
    url: `${siteUrl}${page}`,
    lastModified: STATIC_PAGE_MTIME,
    changeFrequency: 'yearly' as ChangeFrequency,
    priority: 0.3,
  }));

  const glossaryContentMtime = await latestPostMtime('glossary', STATIC_PAGE_MTIME);
  const blogContentMtime = await latestPostMtime('blog', STATIC_PAGE_MTIME);

  const allBlogSitemapEntries: MetadataRoute.Sitemap = [];

  // Add blog list page
  for (const locale of LOCALES) {
    allBlogSitemapEntries.push({
      url: localeUrl(locale, '/blog'),
      lastModified: blogContentMtime,
      changeFrequency: 'weekly' as ChangeFrequency,
      priority: 0.8,
      alternates: alternates('/blog'),
    });
  }

  // NOTE: individual posts deliberately carry no alternates. A localised post
  // is free to use a localised slug, so the cross-locale URL cannot be derived
  // by prefixing — it needs a real translation-group id on the post record.
  // Wire that up when the first post ships in more than one language.

  for (const locale of LOCALES) {
    const { posts: localPosts } = await blogCms.getLocalList(locale);
    localPosts
      .filter((post) => post.slug && post.status !== "draft")
      .forEach((post) => {
        const slugPart = post.slug.replace(/^\//, "").replace(/^blogs\//, "");
        if (slugPart) {
          allBlogSitemapEntries.push({
            url: `${siteUrl}${locale === DEFAULT_LOCALE ? '' : `/${locale}`}/blog/${slugPart}`,
            lastModified: post.metadata?.updatedAt || post.publishedAt || new Date(),
            changeFrequency: 'daily' as ChangeFrequency,
            priority: 0.7,
          });
        }
      });
  }

  for (const locale of LOCALES) {
    const serverResult = await listPublishedPostsAction({
      locale: locale,
      pageSize: 1000,
      visibility: "public",
      postType: "blog",
    });
    if (serverResult.success && serverResult.data?.posts) {
      serverResult.data.posts.forEach((post) => {
        const slugPart = post.slug?.replace(/^\//, "").replace(/^blogs\//, "");
        if (slugPart) {
          allBlogSitemapEntries.push({
            url: `${siteUrl}${locale === DEFAULT_LOCALE ? '' : `/${locale}`}/blog/${slugPart}`,
            lastModified: post.publishedAt || new Date(),
            changeFrequency: 'daily' as ChangeFrequency,
            priority: 0.7,
          });
        }
      });
    }
  }

  const uniqueBlogPostEntries = Array.from(
    new Map(allBlogSitemapEntries.map((entry) => [entry.url, entry])).values()
  );

  // Glossary entries (server-side only, no local file system access)
  const allGlossarySitemapEntries: MetadataRoute.Sitemap = [];

  // Add glossary list page
  for (const locale of LOCALES) {
    allGlossarySitemapEntries.push({
      url: localeUrl(locale, '/glossary'),
      lastModified: glossaryContentMtime,
      changeFrequency: 'weekly' as ChangeFrequency,
      priority: 0.8,
      alternates: alternates('/glossary'),
    });
  }

  // Add glossary entries
  for (const locale of LOCALES) {
    const serverResult = await listPublishedPostsAction({
      locale: locale,
      pageSize: 1000,
      visibility: "public",
      postType: "glossary",
    });
    if (serverResult.success && serverResult.data?.posts) {
      serverResult.data.posts.forEach((post) => {
        const slugPart = post.slug?.replace(/^\//, "").replace(/^glossary\//, "");
        if (slugPart) {
          allGlossarySitemapEntries.push({
            url: `${siteUrl}${locale === DEFAULT_LOCALE ? '' : `/${locale}`}/glossary/${slugPart}`,
            lastModified: post.publishedAt || new Date(),
            changeFrequency: 'daily' as ChangeFrequency,
            priority: 0.7,
          });
        }
      });
    }
  }

  const uniqueGlossaryEntries = Array.from(
    new Map(allGlossarySitemapEntries.map((entry) => [entry.url, entry])).values()
  );

  return [
    ...pages,
    ...legalPages,
    ...uniqueBlogPostEntries,
    ...uniqueGlossaryEntries
  ]
}