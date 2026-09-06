import Compressor from "@/components/compress/Compressor";
import {
  BreadcrumbJsonLd,
  FaqJsonLd,
  HowToJsonLd,
  SoftwareApplicationJsonLd,
} from "@/components/seo/JsonLd";
import { BG1 } from "@/components/shared/BGs";
import FeatureBadge from "@/components/shared/FeatureBadge";
import BudgetTable from "@/components/tools/BudgetTable";
import LimitsTable from "@/components/tools/LimitsTable";
import { PLATFORMS, platformFromToolSlug, toolSlug } from "@/config/platforms";
import { LOCALES, Link as I18nLink, type Locale } from "@/i18n/routing";
import { DEFAULT_SETTINGS } from "@/lib/freeconvert/presets";
import { formatSize } from "@/lib/seo/bitrate-budget";
import { tidyCjk } from "@/lib/seo/cjk";
import { constructMetadata } from "@/lib/metadata";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

/**
 * One page per upload ceiling: /compress-video-for-discord and friends.
 *
 * A dynamic segment rather than eight hand-written folders, because the eight
 * pages differ only in data — and data that lives in config/platforms.ts can be
 * corrected in one place when a platform moves its cap, which they do. Discord
 * went from 10 MB to 20 MB in August 2026 and every static page on the internet
 * that hardcoded 10 is now wrong.
 *
 * `dynamicParams = false` keeps this from becoming a catch-all: anything not in
 * generateStaticParams 404s rather than rendering an empty tool page.
 */

export const dynamicParams = false;

export async function generateStaticParams() {
  return LOCALES.flatMap((locale) =>
    PLATFORMS.map((p) => ({ locale, tool: toolSlug(p) }))
  );
}

type Props = {
  params: Promise<{ locale: string; tool: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, tool } = await params;
  const platform = platformFromToolSlug(tool);
  if (!platform) return {};

  const t = await getTranslations({ locale, namespace: "Tools" });
  const p = await getTranslations({
    locale,
    namespace: `Tools.platforms.${platform.key}`,
  });

  return constructMetadata({
    exactTitle: tidyCjk(
      t("meta.title", {
        platform: p("name"),
        limit: platform.tiers[0].limitMb,
      })
    ),
    description: p("metaDescription"),
    locale: locale as Locale,
    path: `/${tool}`,
  });
}

export default async function ToolPage({ params }: Props) {
  const { locale, tool } = await params;
  const platform = platformFromToolSlug(tool);
  if (!platform) notFound();

  const l = locale as Locale;
  const t = await getTranslations({ locale, namespace: "Tools" });
  const p = await getTranslations({
    locale,
    namespace: `Tools.platforms.${platform.key}`,
  });

  // Two names, because "Compress Video for email" and "Email file size limits"
  // both have to read like English wrote them. `name` heads a sentence, `prose`
  // sits inside one. For every platform but email and X they are identical, and
  // both are localised: email is 邮件 in zh, メール in ja.
  const vars = {
    platform: p("name"),
    prose: p("proseName"),
    limit: platform.tiers[0].limitMb,
    // Formatted, not raw: Telegram's target is 1900 MB and no heading should
    // ever say "What 1900 MB actually buys you".
    target: formatSize(platform.recommendedTargetMb),
  };

  // Steps are keyed s1/s2/s3 rather than an array: they interpolate {platform}
  // and {target}, and t.raw() returns messages uninterpolated.
  const steps = (["s1", "s2", "s3"] as const).map((k) => ({
    name: tidyCjk(t(`steps.${k}.name`, vars)),
    text: tidyCjk(t(`steps.${k}.text`, vars)),
  }));
  const faqs = p.raw("faq") as { question: string; answer: string }[];

  // Every tool page links to every other one. This is the single highest-value
  // internal-linking move available: eight pages that each pass authority to
  // the other seven, and to the homepage.
  const siblings = PLATFORMS.filter((x) => x.key !== platform.key);

  return (
    <>
      <BreadcrumbJsonLd
        locale={l}
        items={[{ name: tidyCjk(t("breadcrumb", vars)), path: `/${tool}` }]}
      />
      <SoftwareApplicationJsonLd locale={l} />
      <HowToJsonLd
        locale={l}
        override={{
          name: tidyCjk(t("howToTitle", vars)),
          description: tidyCjk(t("howToDescription", vars)),
          steps,
          path: `/${tool}`,
        }}
      />
      <FaqJsonLd locale={l} items={faqs} path={`/${tool}`} />

      <div className="w-full">
        <BG1 />

        {/* ---------------------------------------------------- hero + tool */}
        <section className="container mx-auto px-4">
          <div className="flex flex-col items-center gap-8 py-12 lg:py-16">
            <div className="flex max-w-3xl flex-col gap-4 text-center">
              <h1 className="z-10 font-sans text-3xl font-bold md:text-5xl lg:text-6xl">
                <span className="title-gradient">{tidyCjk(t("h1", vars))}</span>
              </h1>
              <p className="text-xl font-medium tracking-tight md:text-2xl">
                {tidyCjk(t("subtitle", vars))}
              </p>
              <p className="text-muted-foreground text-base leading-relaxed md:text-lg">
                {p("intro")}
              </p>
            </div>

            {/* Arrives pre-set to the safe target for this platform.
                H.264 rather than H.265 on purpose: these files are all being
                handed to someone else's device, and H.265 is exactly where
                "it won't play for me" comes from. */}
            <Compressor
              initialSettings={{
                ...DEFAULT_SETTINGS,
                mode: "target_size",
                targetSizeMb: platform.recommendedTargetMb,
                codec: "libx264",
                outputFormat: "mp4",
              }}
            />
          </div>
        </section>

        {/* ------------------------------------------------------- limits */}
        <section id="limits" className="py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <h2 className="mb-4 font-sans text-2xl font-semibold md:text-4xl">
              <span className="title-gradient">{tidyCjk(t("limitsTitle", vars))}</span>
            </h2>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              {p("limitsIntro")}
            </p>
            <LimitsTable platform={platform} locale={locale} />
          </div>
        </section>

        {/* ------------------------------------------------------- budget */}
        <section id="budget" className="py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <h2 className="mb-4 font-sans text-2xl font-semibold md:text-4xl">
              <span className="title-gradient">{tidyCjk(t("budgetTitle", vars))}</span>
            </h2>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              {tidyCjk(t("budgetIntro", vars))}
            </p>
            <BudgetTable
              targetMb={platform.recommendedTargetMb}
              durations={platform.durations}
              locale={locale}
            />
          </div>
        </section>

        {/* -------------------------------------------------------- steps */}
        <section id="how-to" className="py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <h2 className="mb-8 font-sans text-2xl font-semibold md:text-4xl">
              <span className="title-gradient">{tidyCjk(t("howToTitle", vars))}</span>
            </h2>
            <ol className="grid gap-6 md:grid-cols-3">
              {steps.map((step, i) => (
                <li
                  key={step.name}
                  data-step={i + 1}
                  className="bg-card ring-muted rounded-2xl border p-6 shadow-xs ring-4 dark:ring-0"
                >
                  <span
                    aria-hidden
                    className="bg-primary/10 text-primary mb-4 flex h-9 w-9 items-center justify-center rounded-full font-semibold"
                  >
                    {i + 1}
                  </span>
                  <h3 className="mb-2 font-semibold">{step.name}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {step.text}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------------------------------------------------- FAQ */}
        <section id="faq" className="py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <h2 className="mb-8 font-sans text-2xl font-semibold md:text-4xl">
              <span className="title-gradient">{tidyCjk(t("faqTitle", vars))}</span>
            </h2>
            <div className="flex flex-col gap-6">
              {faqs.map((item) => (
                <div key={item.question}>
                  <h3 className="mb-1.5 font-semibold">{item.question}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {item.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------- siblings */}
        <section className="pb-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <FeatureBadge label={t("more.label")} text={t("more.text")} />
            <ul className="mt-6 flex flex-wrap gap-3">
              {siblings.map((s) => (
                <li key={s.key}>
                  <I18nLink
                    href={`/${toolSlug(s)}`}
                    className="bg-card hover:border-primary/40 inline-block rounded-xl border px-4 py-2 text-sm transition-colors"
                  >
                    {tidyCjk(t("more.link", { platform: t(`platforms.${s.key}.name`) }))}
                  </I18nLink>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </>
  );
}
