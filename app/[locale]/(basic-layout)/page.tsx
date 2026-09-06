import HomeComponent from "@/components/home";
import {
  FaqJsonLd,
  HowToJsonLd,
  OrganizationJsonLd,
  SoftwareApplicationJsonLd,
  WebSiteJsonLd,
} from "@/components/seo/JsonLd";
import { Locale } from "@/i18n/routing";
import { constructMetadata } from "@/lib/metadata";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Home" });

  // Keyword first, brand last. The composed default in constructMetadata leads
  // with "VidSmaller", which spends the most valuable characters in the SERP on
  // a term nobody searches for.
  return constructMetadata({
    exactTitle: `${t("metaTitle")} | ${t("title")}`,
    description: t("metaDescription"),
    locale: locale as Locale,
    path: "/",
  });
}

export default async function Home({ params }: Props) {
  const { locale } = await params;
  const l = locale as Locale;

  return (
    <>
      <OrganizationJsonLd locale={l} />
      <WebSiteJsonLd locale={l} />
      <SoftwareApplicationJsonLd locale={l} />
      <HowToJsonLd locale={l} />
      <FaqJsonLd locale={l} />
      <HomeComponent />
    </>
  );
}
