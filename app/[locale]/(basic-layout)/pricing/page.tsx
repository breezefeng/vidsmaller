import { PricingByGroup } from "@/components/pricing";
import { BreadcrumbJsonLd, FaqJsonLd } from "@/components/seo/JsonLd";
import { BG1 } from "@/components/shared/BGs";
import { Locale } from "@/i18n/routing";
import { constructMetadata } from "@/lib/metadata";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Pricing" });

  return constructMetadata({
    exactTitle: t("metaTitle"),
    description: t("metaDescription"),
    locale: locale as Locale,
    path: "/pricing",
  });
}

/**
 * Pricing lived only as a `#pricing` anchor on the homepage, which meant it
 * could not rank, could not be linked to from anywhere else, and could not
 * accumulate its own authority. Comparison and review posts link to a
 * competitor's /pricing constantly; there was nothing here to link to.
 *
 * The prose below the cards is not filler. "How much does it cost" is a
 * commercial-intent query, and the pages that win it answer the question in
 * text rather than making the reader reverse-engineer a pricing table.
 */
export default async function PricingPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Pricing" });

  const body = t.raw("body") as { title: string; text: string }[];
  const faq = t.raw("faq") as { question: string; answer: string }[];

  return (
    <>
      <BreadcrumbJsonLd
        locale={locale as Locale}
        items={[{ name: t("heading"), path: "/pricing" }]}
      />
      {/* Safe to emit now: the questions below are rendered on this page. */}
      <FaqJsonLd locale={locale as Locale} items={faq} path="/pricing" />

      <div className="w-full">
        <BG1 />

        <section className="mx-auto max-w-7xl px-4 pt-16 pb-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="z-10 mb-6 font-sans text-3xl font-bold md:text-5xl">
              <span className="title-gradient">{t("heading")}</span>
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed">
              {t("intro")}
            </p>
          </div>
        </section>

        <PricingByGroup />

        <section className="py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-8">
              {body.map((block) => (
                <div key={block.title}>
                  <h2 className="mb-2 text-xl font-semibold">{block.title}</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    {block.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="pb-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <h2 className="mb-8 font-sans text-2xl font-semibold md:text-4xl">
              <span className="title-gradient">{t("faqTitle")}</span>
            </h2>
            <div className="flex flex-col gap-6">
              {faq.map((item) => (
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
      </div>
    </>
  );
}
