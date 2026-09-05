import { listPublishedPostsAction } from '@/actions/posts/posts'
import { siteConfig } from '@/config/site'
import { DEFAULT_LOCALE, LOCALES } from '@/i18n/routing'
import { blogCms } from '@/lib/cms'
import { db } from '@/lib/db'
import { posts as postsSchema } from '@/lib/db/schema'
import { MetadataRoute } from 'next'
import { eq, max } from 'drizzle-orm'

const siteUrl = siteConfig.url

const STATIC_PAGE_MTIME = new Date(new Date().getFullYear(), 0, 1)

type ChangeFrequency = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never' | undefined

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
  // Static pages
  const staticPages = [
    '',
  ]

  const pages = LOCALES.flatMap(locale => {
    return staticPages.map(page => ({
      url: `${siteUrl}${locale === DEFAULT_LOCALE ? '' : `/${locale}`}${page}`,
      lastModified: STATIC_PAGE_MTIME,
      changeFrequency: 'daily' as ChangeFrequency,
      priority: page === '' ? 1.0 : 0.8,
    }))
  })

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
      url: `${siteUrl}${locale === DEFAULT_LOCALE ? '' : `/${locale}`}/blog`,
      lastModified: blogContentMtime,
      changeFrequency: 'daily' as ChangeFrequency,
      priority: 0.8,
    });
  }

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
      url: `${siteUrl}${locale === DEFAULT_LOCALE ? '' : `/${locale}`}/glossary`,
      lastModified: glossaryContentMtime,
      changeFrequency: 'daily' as ChangeFrequency,
      priority: 0.8,
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