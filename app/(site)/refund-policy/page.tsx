import { Separator } from "@/components/ui/separator";
import { siteConfig } from "@/config/site";
import { constructMetadata } from "@/lib/metadata";
import { HomeIcon } from "lucide-react";
import { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-static";
export const revalidate = false;

const LAST_UPDATED = "6 September 2026";
const SUPPORT_EMAIL = siteConfig.socialLinks?.email || "support@vidsmaller.com";

export async function generateMetadata(): Promise<Metadata> {
  return constructMetadata({
    title: "Refund Policy",
    description: `When ${siteConfig.name} refunds a subscription or a credit pack, how failed jobs are credited back, and how to ask.`,
    path: `/refund-policy`,
    locale: "en",
    availableLocales: ["en"],
  });
}

export default function RefundPolicyPage() {
  return (
    <div className="bg-secondary/20 py-8 sm:py-12">
      <div className="container mx-auto max-w-4xl px-4">
        <div className="bg-background rounded-xl border p-6 shadow-xs sm:p-8 dark:border-zinc-800">
          <h1 className="mb-2 text-2xl font-bold sm:text-3xl">Refund Policy</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Last updated: {LAST_UPDATED}
          </p>

          <div className="space-y-6">
            <section className="rounded-lg border bg-secondary/30 p-4">
              <h2 className="mb-3 text-xl font-semibold">The short version</h2>
              <ul className="list-disc space-y-1 pl-6">
                <li>
                  <strong>Failed job?</strong> Credits come back automatically —
                  you don't need to ask.
                </li>
                <li>
                  <strong>First payment on a plan, within 14 days, barely
                  used?</strong> Full refund, no interrogation.
                </li>
                <li>
                  <strong>Unused credit pack, within 14 days?</strong> Full
                  refund.
                </li>
                <li>
                  <strong>Forgot to cancel and got renewed?</strong> Tell us
                  within 7 days and we'll refund it if you haven't used the new
                  period.
                </li>
                <li>
                  Try it free first — signed-out visitors get free jobs daily and
                  a free account gets 30 credits a month, so nobody has to pay to
                  find out whether the output looks right.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">
                Automatic refunds (no request needed)
              </h2>
              <p className="mb-3">
                Two things are handled by the system itself:
              </p>
              <ul className="mb-3 list-disc space-y-1 pl-6">
                <li>
                  <strong>Failed jobs.</strong> Credits are charged when a job
                  starts. If the encoder reports a failure, the exact amount is
                  returned to your balance automatically, once, and appears in{" "}
                  <span className="font-mono text-sm">
                    /dashboard/credit-history
                  </span>
                  .
                </li>
                <li>
                  <strong>Jobs we never ran.</strong> If a job never reaches the
                  encoder — an upload that couldn't be staged, a provider outage
                  before processing — it is treated the same way.
                </li>
              </ul>
              <p className="mb-3">
                If a job clearly failed but the credits didn't come back within a
                few minutes, that's a bug. Email us with the job and we'll fix
                both the balance and the bug.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">
                Subscriptions (Pro, monthly or yearly)
              </h2>
              <div className="mb-6">
                <h3 className="mb-3 text-lg font-medium">
                  1. First payment — 14-day money back
                </h3>
                <p className="mb-3">
                  If the service isn't what you expected, ask within 14 days of
                  your first payment on a plan and we'll refund it in full,
                  provided you have used no more than 20% of that period's
                  credits (for example, up to 120 of Pro's 600). We don't ask you
                  to justify the decision, though telling us what went wrong
                  genuinely helps.
                </p>
                <p className="mb-3">
                  Used more than that? We can usually still refund the unused
                  portion pro rata — ask.
                </p>
              </div>
              <div className="mb-6">
                <h3 className="mb-3 text-lg font-medium">
                  2. Renewals you didn't mean to keep
                </h3>
                <p className="mb-3">
                  Subscriptions renew automatically. If you meant to cancel and a
                  renewal caught you out, contact us within 7 days of the charge:
                  if you haven't spent credits from the new period, we refund it
                  and cancel the plan. This is a "forgot to cancel" allowance,
                  not a monthly one — repeated use of it may be declined.
                </p>
              </div>
              <div className="mb-6">
                <h3 className="mb-3 text-lg font-medium">
                  3. Cancelling normally
                </h3>
                <p className="mb-3">
                  You can cancel from your dashboard at any time. Cancellation
                  stops the next renewal; your plan and its credits stay active
                  until the end of the period you already paid for. We don't
                  refund the remainder of a period you have been using, except
                  under the cases above or where the law requires it.
                </p>
                <p className="mb-3">
                  <strong>Yearly plans.</strong> Credits are released month by
                  month over the year. If you cancel a yearly plan after the
                  14-day window, we'll refund the whole months not yet released,
                  minus any discount that only applied because you committed for
                  a year.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">
                One-time credit packs
              </h2>
              <ul className="mb-3 list-disc space-y-1 pl-6">
                <li>
                  <strong>Unused, within 14 days</strong> — full refund, and the
                  credits are removed from your balance.
                </li>
                <li>
                  <strong>Partly used, within 14 days</strong> — we refund the
                  unused credits at the price you paid per credit.
                </li>
                <li>
                  <strong>After 14 days</strong> — credits from packs never
                  expire, so they stay in your account and are spent after your
                  monthly plan credits. We generally don't refund them at that
                  point.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">
                Always refundable, whatever the timing
              </h2>
              <ul className="mb-3 list-disc space-y-1 pl-6">
                <li>
                  <strong>Duplicate or wrong charges</strong> — billed twice,
                  billed after cancelling, billed the wrong amount.
                </li>
                <li>
                  <strong>Unauthorised charges</strong> — someone used your card
                  without permission (we'll verify, then refund).
                </li>
                <li>
                  <strong>Extended outage</strong> — if the compressor is
                  unusable for more than 24 consecutive hours because of a
                  problem on our side, ask and we'll credit or refund the
                  affected period.
                </li>
                <li>
                  <strong>Service withdrawn</strong> — if we retire a paid
                  feature you're paying for, or shut down, we refund the unused
                  portion of your prepayment.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">
                What we usually don't refund
              </h2>
              <ul className="mb-3 list-disc space-y-1 pl-6">
                <li>
                  <strong>Credits already spent on successful jobs.</strong> The
                  encoding time was bought and burned. If the output was
                  genuinely broken — corrupt file, wrong duration, audio missing
                  — that's a defect, not a preference: send the job and we'll
                  re-run it or return the credits.
                </li>
                <li>
                  <strong>"The file didn't shrink enough."</strong> How much a
                  video compresses depends on the source. Already-compressed
                  footage may only drop 20–40%. The free tier exists so you can
                  test your own material before paying.
                </li>
                <li>
                  <strong>Uploading the wrong file, or picking settings you
                  later regret.</strong> Sorry — the machine time was still
                  spent.
                </li>
                <li>
                  <strong>Problems outside the service</strong> — your network
                  dropping mid-upload after the job completed, a platform still
                  rejecting a file that met the size you asked for, and so on.
                </li>
                <li>
                  <strong>Accounts closed for breaking the{" "}
                  <Link
                    href="/terms-of-service"
                    className="text-primary hover:underline"
                  >
                    Terms of Service
                  </Link>
                  .</strong>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">
                Your statutory rights
              </h2>
              <p className="mb-3">
                If you're a consumer in the EU, UK or another place with
                mandatory refund rules, those rules win wherever they give you
                more than this policy — including the 14-day right of withdrawal
                for digital services. Note that by starting a compression job you
                ask us to begin performance immediately, which can reduce the
                withdrawal right for the part already delivered.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">How to ask</h2>
              <p className="mb-3">
                Email{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-blue-500 hover:underline"
                >
                  {SUPPORT_EMAIL}
                </a>{" "}
                from the address on your account with:
              </p>
              <ul className="mb-3 list-disc space-y-1 pl-6">
                <li>the date and amount of the charge (or the Stripe receipt)</li>
                <li>what you'd like refunded, and briefly why</li>
                <li>
                  for job-related problems: the job or file name, and a
                  screenshot or error message if you have one
                </li>
              </ul>
              <p className="mb-3">What happens next:</p>
              <ul className="mb-3 list-disc space-y-1 pl-6">
                <li>
                  <strong>Reply</strong> within 2 business days — usually much
                  sooner.
                </li>
                <li>
                  <strong>Decision</strong> within 5 business days. Clear-cut
                  cases (duplicate charge, unused pack, unwanted renewal) are
                  normally approved on the spot.
                </li>
                <li>
                  <strong>Money back</strong> issued through Stripe to your
                  original payment method within 3 business days of approval;
                  your bank then typically takes 5–10 days to show it.
                </li>
              </ul>
              <p className="mb-3">
                Refunds are always made in the original currency and to the
                original payment method. We can offer account credit instead if
                you'd rather, but only if you ask for it.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">
                Chargebacks
              </h2>
              <p className="mb-3">
                Please email us before disputing a charge with your bank. A
                chargeback costs us a fee on top of the amount, takes months to
                resolve, and automatically suspends the account while it runs —
                whereas a refund request is usually settled the same day. If you
                genuinely can't reach us, dispute away; but give us a chance
                first.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">
                Changes to this policy
              </h2>
              <p className="mb-3">
                We may update this policy; the date at the top changes with it.
                The version in force when you paid is the one that applies to
                that payment.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">Contact</h2>
              <ul className="mb-3 list-disc space-y-1 pl-6">
                <li>
                  <strong>Email</strong>:{" "}
                  <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="text-blue-500 hover:underline"
                  >
                    {SUPPORT_EMAIL}
                  </a>
                </li>
                {siteConfig.socialLinks?.discord && (
                  <li>
                    <strong>Discord</strong>:{" "}
                    <a
                      href={siteConfig.socialLinks.discord}
                      className="text-primary hover:underline"
                    >
                      Join the server
                    </a>
                  </li>
                )}
              </ul>
              <p className="mb-3">
                Related:{" "}
                <Link
                  href="/terms-of-service"
                  className="text-primary hover:underline"
                >
                  Terms of Service
                </Link>
                {" · "}
                <Link
                  href="/privacy-policy"
                  className="text-primary hover:underline"
                >
                  Privacy Policy
                </Link>
              </p>
            </section>
          </div>

          <Separator />

          <div className="mt-8">
            <Link
              href="/"
              className="text-primary hover:underline flex items-center gap-2"
              title="Return to Home"
            >
              <HomeIcon className="size-4" /> Return to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
