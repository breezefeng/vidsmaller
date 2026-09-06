import CompressHero from "@/components/home/CompressHero";
import CTA from "@/components/home/CTA";
import FAQ from "@/components/home/FAQ";
import Features from "@/components/home/Features";
import HowTo from "@/components/home/HowTo";
import Specs from "@/components/home/Specs";
import UseCases from "@/components/home/UseCases";
import { PricingByGroup } from "@/components/pricing";
import { BG1 } from "@/components/shared/BGs";
import { getMessages } from "next-intl/server";

export default async function HomeComponent() {
  const messages = await getMessages();

  return (
    <div className="w-full">
      <BG1 />

      {messages.Landing.Hero && <CompressHero />}

      {messages.Landing.Features && <Features />}

      {messages.Landing.HowTo && <HowTo />}

      {messages.Landing.UseCases && <UseCases />}

      {messages.Landing.Specs && <Specs />}

      {messages.Pricing && <PricingByGroup />}

      {messages.Landing.FAQ && <FAQ />}

      {messages.Landing.CTA && <CTA />}
    </div>
  );
}
