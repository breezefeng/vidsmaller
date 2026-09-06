/**
 * Upload ceilings, per platform.
 *
 * These pages exist because the numbers are right. That only stays true if the
 * numbers are maintainable, so every platform carries:
 *
 *   verifiedAt  — when a human last checked
 *   sources     — where they checked
 *   caveat      — the thing that is actually true but that every other
 *                 "compress video for X" page gets wrong
 *
 * The caveat field is the whole differentiator. Anyone can write "Gmail's limit
 * is 25 MB". It is also misleading: Gmail measures the base64-encoded
 * attachment, so a 25 MB file is ~33 MB on the wire and bounces. Competitor
 * pages send people away with a file that fails to send.
 *
 * When a limit changes, change it HERE — the pages, the tables, the JSON-LD and
 * the compressor presets all read from this one object.
 */

export type Tier = {
  /** Displayed verbatim, e.g. "Free" / "Nitro Basic" */
  name: string;
  limitMb: number;
  note?: string;
};

export type PlatformKey =
  | 'discord'
  | 'email'
  | 'whatsapp'
  | 'telegram'
  | 'slack'
  | 'instagram'
  | 'tiktok'
  | 'twitter';

export interface Platform {
  key: PlatformKey;
  /** URL slug: /compress-video-for-<slug> */
  slug: string;
  /** Brand name as written in prose. Not translated. */
  name: string;
  tiers: Tier[];
  /**
   * What we actually preset the compressor to. Deliberately below the headline
   * limit — a target-size encode lands within a couple of percent, and landing
   * two percent OVER a hard ceiling means the upload fails.
   */
  recommendedTargetMb: number;
  /** Durations for the bitrate-budget table, in seconds. */
  durations?: number[];
  verifiedAt: string;
  sources: { label: string; url: string }[];
}

export const PLATFORMS: Platform[] = [
  {
    key: 'discord',
    slug: 'discord',
    name: 'Discord',
    tiers: [
      {
        name: 'Free',
        limitMb: 20,
        note: 'Raised from 10 MB in August 2026. Some Discord help pages still say 10 MB, and older mobile clients can still enforce the old cap — target 10 MB if the upload absolutely has to work.',
      },
      { name: 'Nitro Basic', limitMb: 50 },
      { name: 'Nitro', limitMb: 500 },
    ],
    recommendedTargetMb: 19,
    verifiedAt: '2026-09-06',
    sources: [
      {
        label: 'Discord — File Attachments FAQ',
        url: 'https://support.discord.com/hc/en-us/articles/25444343291031-File-Attachments-FAQ',
      },
      {
        label: 'Discord — Account caps',
        url: 'https://support.discord.com/hc/en-us/articles/33694251638295-Discord-Account-Caps-Server-Caps-and-More',
      },
    ],
  },
  {
    key: 'email',
    slug: 'email',
    name: 'email',
    tiers: [
      {
        name: 'Gmail',
        limitMb: 25,
        note: 'Gmail measures the base64-encoded attachment, which is about 1.37x the raw file. A 25 MB video is roughly 34 MB on the wire and bounces. The real ceiling for a raw file is about 18 MB.',
      },
      { name: 'Outlook.com', limitMb: 20 },
      {
        name: 'Exchange / work mail',
        limitMb: 10,
        note: 'Microsoft ships a 10 MB default for Exchange accounts. Your administrator may have raised it; you cannot assume they did.',
      },
    ],
    recommendedTargetMb: 18,
    verifiedAt: '2026-09-06',
    sources: [
      {
        label: 'Google — Send attachments with your Gmail message',
        url: 'https://support.google.com/mail/answer/6584',
      },
      {
        label: 'Microsoft — Reduce attachment size',
        url: 'https://support.microsoft.com/en-us/outlook/reduce-attachment-size-to-send-large-files-with-outlook',
      },
    ],
  },
  {
    key: 'whatsapp',
    slug: 'whatsapp',
    name: 'WhatsApp',
    tiers: [
      {
        name: 'Video in chat (mobile)',
        limitMb: 16,
        note: 'WhatsApp’s own help pages are inconsistent here — some quote 16 MB, others describe a connection-dependent 64–100 MB ceiling with forced downscaling. 16 MB is the figure every client accepts, so it is the one to target.',
      },
      { name: 'Video in chat (Web/Desktop)', limitMb: 64 },
      {
        name: 'Sent as a document',
        limitMb: 2048,
        note: 'Bypasses re-compression entirely and preserves your quality, but loses the inline preview and autoplay.',
      },
    ],
    recommendedTargetMb: 15,
    durations: [15, 30, 60, 120, 300, 600],
    verifiedAt: '2026-09-06',
    sources: [
      {
        label: 'WhatsApp — How to send media, contacts, or location',
        url: 'https://faq.whatsapp.com/453914586839706/',
      },
    ],
  },
  {
    key: 'telegram',
    slug: 'telegram',
    name: 'Telegram',
    tiers: [
      { name: 'Free', limitMb: 2048 },
      { name: 'Premium', limitMb: 4096 },
      {
        name: 'Bot API',
        limitMb: 50,
        note: 'Bots can only upload 50 MB and download 20 MB through the standard API — far below what a human account can send. This trips up almost everyone automating Telegram.',
      },
    ],
    recommendedTargetMb: 1900,
    durations: [300, 600, 1800, 3600, 7200],
    verifiedAt: '2026-09-06',
    sources: [
      { label: 'Telegram — Premium FAQ', url: 'https://telegram.org/faq_premium' },
      {
        label: 'Telegram — 700 Million Users and Telegram Premium',
        url: 'https://telegram.org/blog/700-million-and-premium',
      },
    ],
  },
  {
    key: 'slack',
    slug: 'slack',
    name: 'Slack',
    tiers: [
      {
        name: 'Every plan',
        limitMb: 1024,
        note: 'Unusually, the per-file cap does not change with your plan. What changes is retention: on the Free plan you lose visibility of files older than 90 days.',
      },
      {
        name: 'Recorded clips',
        limitMb: 1024,
        note: 'Slack’s built-in audio and video clips are capped at 5 minutes regardless of file size.',
      },
    ],
    recommendedTargetMb: 200,
    durations: [60, 300, 600, 1800, 3600],
    verifiedAt: '2026-09-06',
    sources: [
      {
        label: 'Slack — Add files to Slack',
        url: 'https://slack.com/help/articles/201330736-Add-files-to-Slack',
      },
      {
        label: 'Slack — Usage limits for free workspaces',
        url: 'https://slack.com/help/articles/115002422943-Usage-limits-for-free-workspaces',
      },
    ],
  },
  {
    key: 'instagram',
    slug: 'instagram',
    name: 'Instagram',
    tiers: [
      {
        name: 'Reels',
        limitMb: 4096,
        note: 'The 4 GB cap is almost never what stops you. Instagram re-encodes everything you upload, so a bloated file just gets crushed harder by their encoder — you get a better result by handing them a clean 1080x1920 H.264 file at 8–12 Mbps than by uploading your 3 GB master.',
      },
      { name: 'Feed video', limitMb: 4096 },
      { name: 'Stories', limitMb: 4096, note: 'Split into 15-second segments.' },
    ],
    recommendedTargetMb: 100,
    durations: [15, 30, 60, 90, 180],
    verifiedAt: '2026-09-06',
    sources: [
      {
        label: 'Instagram — Reel size & aspect ratios',
        url: 'https://help.instagram.com/1038071743007909',
      },
    ],
  },
  {
    key: 'tiktok',
    slug: 'tiktok',
    name: 'TikTok',
    tiers: [
      {
        name: 'Android app',
        limitMb: 72,
        note: 'By far the tightest limit of the three, and the one nobody documents. If your upload fails on an Android phone but works on a friend’s iPhone, this is why.',
      },
      { name: 'iOS app', limitMb: 288 },
      {
        name: 'Web (TikTok Studio)',
        limitMb: 10240,
        note: 'Accepts very large files, but uploads over ~500 MB slow processing down and fail more often.',
      },
    ],
    recommendedTargetMb: 70,
    durations: [15, 30, 60, 180, 600],
    verifiedAt: '2026-09-06',
    sources: [
      {
        label: 'TikTok Studio — upload',
        url: 'https://www.tiktok.com/tiktokstudio/upload',
      },
    ],
  },
  {
    key: 'twitter',
    slug: 'twitter',
    name: 'X (Twitter)',
    tiers: [
      {
        name: 'Standard',
        limitMb: 512,
        note: 'Capped at 2 minutes 20 seconds of runtime, which bites long before the file size does.',
      },
      { name: 'Premium (web / iOS)', limitMb: 16384, note: 'Up to 4 hours.' },
      { name: 'Premium (Android)', limitMb: 16384, note: 'Up to 10 minutes.' },
    ],
    recommendedTargetMb: 480,
    durations: [30, 60, 140],
    verifiedAt: '2026-09-06',
    sources: [
      {
        label: 'X — Media best practices',
        url: 'https://docs.x.com/x-api/media/quickstart/best-practices',
      },
    ],
  },
];

export const PLATFORM_BY_SLUG = Object.fromEntries(
  PLATFORMS.map((p) => [p.slug, p])
) as Record<string, Platform>;

/** `/compress-video-for-discord` */
export const toolSlug = (p: Platform) => `compress-video-for-${p.slug}`;

export const TOOL_SLUGS = PLATFORMS.map(toolSlug);

export function platformFromToolSlug(slug: string): Platform | null {
  const m = /^compress-video-for-(.+)$/.exec(slug);
  return m ? (PLATFORM_BY_SLUG[m[1]] ?? null) : null;
}
