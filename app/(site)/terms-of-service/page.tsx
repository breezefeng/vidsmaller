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
    title: "Terms of Service",
    description: `The rules for using ${siteConfig.name}: accounts, credits, limits, acceptable use and who owns what.`,
    path: `/terms-of-service`,
    locale: "en",
    availableLocales: ["en"],
  });
}

const PLAN_LIMITS: {
  plan: string;
  file: string;
  batch: string;
  credits: string;
  retention: string;
}[] = [
  {
    plan: "Signed out",
    file: "200 MB",
    batch: "1 file",
    credits: "2 free jobs per day, per IP",
    retention: "2 hours",
  },
  {
    plan: "Free account",
    file: "1 GB",
    batch: "3 files",
    credits: "30 credits / month",
    retention: "up to 7 days",
  },
  {
    plan: "Pro",
    file: "1.4 GB (see note)",
    batch: "10 files",
    credits: "600 credits / month",
    retention: "up to 7 days",
  },
];

export default function TermsOfServicePage() {
  return (
    <div className="bg-secondary/20 py-8 sm:py-12">
      <div className="container mx-auto max-w-4xl px-4">
        <div className="bg-background rounded-xl border p-6 shadow-xs sm:p-8 dark:border-zinc-800">
          <h1 className="mb-2 text-2xl font-bold sm:text-3xl">
            Terms of Service
          </h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Last updated: {LAST_UPDATED}
          </p>

          <div className="space-y-6">
            <section className="rounded-lg border bg-secondary/30 p-4">
              <h2 className="mb-3 text-xl font-semibold">The short version</h2>
              <ul className="list-disc space-y-1 pl-6">
                <li>Compress videos you have the right to compress.</li>
                <li>
                  Your video stays yours. We only get the licence needed to
                  encode it and hand it back.
                </li>
                <li>
                  Credits are charged when a job starts and refunded
                  automatically if it fails.
                </li>
                <li>
                  Cancel any time; the plan runs to the end of the period you
                  already paid for.
                </li>
                <li>
                  We run on third-party infrastructure and can't promise perfect
                  uptime — so keep your original files.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">1. Who this is with</h2>
              <p className="mb-3">
                These Terms are an agreement between you and {siteConfig.name}{" "}
                ("we", "us"), covering{" "}
                {siteConfig.url.replace(/^https?:\/\//, "")} and every part of
                the service reachable from it. By uploading a file, creating an
                account or paying us, you accept them. If you are using{" "}
                {siteConfig.name} for an employer or client, you confirm you can
                agree on their behalf.
              </p>
              <p className="mb-3">
                You must be at least 13 years old (or the minimum digital
                consent age where you live) to use the service.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">
                2. What the service is
              </h2>
              <p className="mb-3">
                {siteConfig.name} is a cloud video compressor. You upload a
                video, choose a compression mode — preset, target size, constant
                quality (CRF), resolution or maximum bitrate — and we return a
                re-encoded file. The encoding itself runs on a third-party
                processing provider; the rest (accounts, credits, quotas,
                delivery) is ours.
              </p>
              <p className="mb-3">
                Compression is lossy by nature. We give you the controls and show
                the resulting size, but the output is an approximation of the
                input, and we can't guarantee a specific size, quality score or
                encoding time for a file we haven't seen. Always keep your
                original.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">3. Accounts</h2>
              <ul className="mb-3 list-disc space-y-1 pl-6">
                <li>
                  You can compress a couple of files a day without an account.
                  Beyond that you sign in with Google, a magic link or an email
                  code — there is no password to manage.
                </li>
                <li>
                  Keep your mailbox secure: anyone with access to it can sign in
                  as you. Tell us immediately if you think your account is being
                  used by someone else.
                </li>
                <li>
                  One person or organisation per account. Don't create multiple
                  accounts to get around free limits.
                </li>
                <li>
                  You can delete your account at any time. We may suspend or
                  close an account that breaks section 5, and we will tell you
                  why unless the law prevents it.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">
                4. Plans, limits and credits
              </h2>

              <div className="mb-4 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="border bg-secondary/40 px-3 py-2 text-left font-semibold dark:border-zinc-800">
                        Plan
                      </th>
                      <th className="border bg-secondary/40 px-3 py-2 text-left font-semibold dark:border-zinc-800">
                        Max per file
                      </th>
                      <th className="border bg-secondary/40 px-3 py-2 text-left font-semibold dark:border-zinc-800">
                        Batch
                      </th>
                      <th className="border bg-secondary/40 px-3 py-2 text-left font-semibold dark:border-zinc-800">
                        Allowance
                      </th>
                      <th className="border bg-secondary/40 px-3 py-2 text-left font-semibold dark:border-zinc-800">
                        Result kept
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {PLAN_LIMITS.map((row) => (
                      <tr key={row.plan}>
                        <td className="border px-3 py-2 align-top font-medium dark:border-zinc-800">
                          {row.plan}
                        </td>
                        <td className="border px-3 py-2 align-top dark:border-zinc-800">
                          {row.file}
                        </td>
                        <td className="border px-3 py-2 align-top dark:border-zinc-800">
                          {row.batch}
                        </td>
                        <td className="border px-3 py-2 align-top dark:border-zinc-800">
                          {row.credits}
                        </td>
                        <td className="border px-3 py-2 align-top dark:border-zinc-800">
                          {row.retention}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mb-3">
                <strong>Note on the Pro file size.</strong> Our product limit for
                Pro is 5 GB, but the encoding plan we currently pay for accepts
                less than that. The app always enforces the smaller of the two,
                and displays the number it will actually accept, so you are never
                charged for a job the provider is certain to reject. The limit
                rises automatically when we upgrade.
              </p>

              <div className="mb-6">
                <h3 className="mb-3 text-lg font-medium">How credits work</h3>
                <ul className="mb-3 list-disc space-y-1 pl-6">
                  <li>
                    <strong>1 credit = 1 minute of source video</strong> encoded
                    with H.264. H.265/HEVC costs 2 credits per minute because it
                    takes roughly four times the machine time.
                  </li>
                  <li>
                    <strong>Minimum 3 credits per job.</strong> Our provider
                    bills a full minute for each of the three pipeline stages
                    (import, compress, export), so a five-second clip costs the
                    same floor as a three-minute one.
                  </li>
                  <li>
                    <strong>Charged up front, refunded on failure.</strong>{" "}
                    Credits are deducted when the job is created and returned
                    automatically — exactly once — if the provider reports a
                    failure.
                  </li>
                  <li>
                    <strong>Monthly plan credits reset each period</strong> and do
                    not roll over. Credits from one-time packs do not expire and
                    are spent after your plan credits.
                  </li>
                  <li>
                    Credits have no cash value, cannot be transferred between
                    accounts and cannot be exchanged for money except as set out
                    in the{" "}
                    <Link
                      href="/refund-policy"
                      className="text-primary hover:underline"
                    >
                      Refund Policy
                    </Link>
                    .
                  </li>
                </ul>
              </div>

              <div className="mb-6">
                <h3 className="mb-3 text-lg font-medium">Fair use</h3>
                <p className="mb-3">
                  Plans are priced for normal human use. Automated bulk
                  pipelines, reselling capacity, or usage far beyond what a
                  person could produce may be throttled or asked to move to a
                  custom arrangement — we'll email you before doing anything. We
                  also reserve a share of daily capacity for paying customers so
                  a spike in free traffic can't stall a paid job.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">5. Acceptable use</h2>
              <p className="mb-3">
                Don't upload or process content that:
              </p>
              <ul className="mb-3 list-disc space-y-1 pl-6">
                <li>
                  you don't own or have permission to encode (copyright, image
                  rights, confidentiality)
                </li>
                <li>
                  sexualises minors, or was recorded without the consent of the
                  people in it where consent is required
                </li>
                <li>
                  is illegal where you are or where we operate, incites violence,
                  or is intended for harassment
                </li>
                <li>contains malware, or is crafted to attack our processors</li>
              </ul>
              <p className="mb-3">And don't:</p>
              <ul className="mb-3 list-disc space-y-1 pl-6">
                <li>
                  circumvent quotas, rate limits or file-size checks, or spin up
                  accounts to farm free credits
                </li>
                <li>
                  scrape, reverse engineer or automate the site outside of
                  ordinary browser use
                </li>
                <li>
                  resell {siteConfig.name} as your own compression API or
                  white-label service without a written agreement
                </li>
                <li>
                  attempt to access other users' jobs, files or account data
                </li>
              </ul>
              <p className="mb-3">
                We can remove content and suspend accounts that break these
                rules. Because we don't watch your videos, enforcement is mostly
                complaint- and signal-driven: if you believe content processed
                here infringes your rights, email{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-blue-500 hover:underline"
                >
                  {SUPPORT_EMAIL}
                </a>{" "}
                with the details and we will act. Note that files are deleted
                automatically within hours, so complaints are usually about
                accounts rather than stored content.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">
                6. Who owns what
              </h2>
              <div className="mb-6">
                <h3 className="mb-3 text-lg font-medium">Your files</h3>
                <p className="mb-3">
                  You keep every right you had in your video, and in the
                  compressed output. You grant us only the licence we need to
                  provide the service: to store, transfer and re-encode the file
                  — including passing it to our encoding provider — for as long
                  as the job and its retention window last. That licence ends
                  when the file is deleted. We do not use your footage to train
                  models, advertise, or anything else.
                </p>
              </div>
              <div className="mb-6">
                <h3 className="mb-3 text-lg font-medium">Our side</h3>
                <p className="mb-3">
                  The site, interface, presets, copy and code are ours or our
                  licensors'. Using the service doesn't transfer any of that to
                  you. Don't copy the site wholesale or use our name and logo in
                  a way that suggests we endorse you.
                </p>
              </div>
              <div className="mb-6">
                <h3 className="mb-3 text-lg font-medium">Feedback</h3>
                <p className="mb-3">
                  If you send us a bug report, a badly-compressing sample file or
                  a feature idea, we may use it to improve the product without
                  owing you anything. We won't publish your file.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">
                7. Payment and cancellation
              </h2>
              <ul className="mb-3 list-disc space-y-1 pl-6">
                <li>
                  Prices are in US dollars and shown on the pricing section
                  before you pay. Payments are processed by Stripe; your card
                  details never reach our servers.
                </li>
                <li>
                  Subscriptions renew automatically at the end of each period
                  until cancelled. Cancel from your dashboard at any time —
                  access and credits continue until the end of the period you
                  already paid for.
                </li>
                <li>
                  Taxes may be added where required. You are responsible for any
                  taxes not collected at checkout.
                </li>
                <li>
                  We may change prices with at least 30 days' notice to existing
                  subscribers; the change applies from your next renewal, and you
                  can cancel before then.
                </li>
                <li>
                  Refunds are governed by the{" "}
                  <Link
                    href="/refund-policy"
                    className="text-primary hover:underline"
                  >
                    Refund Policy
                  </Link>
                  , which forms part of these Terms.
                </li>
                <li>
                  If a payment fails, we may pause paid features until it
                  succeeds.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">
                8. Availability, changes and your data
              </h2>
              <p className="mb-3">
                {siteConfig.name} depends on third parties — a hosting platform,
                a storage provider, a database and an encoding provider. We work
                to keep it up, but we do not offer an SLA on the plans sold
                here, and outages, maintenance and provider incidents happen.
              </p>
              <p className="mb-3">
                <strong>
                  We are not a backup service and files are deleted on a short
                  timer.
                </strong>{" "}
                Download your result before its retention window ends and keep
                your originals. We are not liable for files you no longer have a
                copy of.
              </p>
              <p className="mb-3">
                We may add, change or retire features. If we discontinue a paid
                feature you rely on, or shut the service down, we will give
                reasonable notice and refund the unused portion of any
                prepayment.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">
                9. Warranties and liability
              </h2>
              <p className="mb-3">
                The service is provided "as is" and "as available". To the extent
                the law allows, we disclaim implied warranties of
                merchantability, fitness for a particular purpose and
                non-infringement, and we do not warrant that compression will be
                uninterrupted, error-free or produce a particular result.
              </p>
              <p className="mb-3">
                To the maximum extent permitted by law, {siteConfig.name} is not
                liable for indirect, incidental, special or consequential
                damages, lost profits, lost data or lost footage. Our total
                liability for any claim relating to the service is limited to the
                greater of (a) what you paid us in the 12 months before the claim
                or (b) USD 50.
              </p>
              <p className="mb-3">
                Nothing here limits liability that cannot lawfully be limited —
                including, for consumers in the EU, UK and similar
                jurisdictions, your statutory rights.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">10. Indemnity</h2>
              <p className="mb-3">
                If a third party brings a claim against us because of content you
                processed — for example a copyright or privacy claim — you agree
                to cover the reasonable costs of defending it, provided we tell
                you about the claim promptly and let you take part in the
                defence.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">
                11. Governing law and disputes
              </h2>
              <p className="mb-3">
                These Terms are governed by the laws of the Hong Kong SAR,
                without regard to conflict-of-law rules, and the courts of Hong
                Kong have non-exclusive jurisdiction. If you are a consumer, this
                does not deprive you of the protection of mandatory laws in your
                country of residence, and you may bring proceedings there.
              </p>
              <p className="mb-3">
                Before filing anything, please email us. Nearly every dispute we
                have seen was a billing question that took one reply to fix.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">12. The small print</h2>
              <ul className="mb-3 list-disc space-y-1 pl-6">
                <li>
                  <strong>Whole agreement.</strong> These Terms, the{" "}
                  <Link
                    href="/privacy-policy"
                    className="text-primary hover:underline"
                  >
                    Privacy Policy
                  </Link>{" "}
                  and the{" "}
                  <Link
                    href="/refund-policy"
                    className="text-primary hover:underline"
                  >
                    Refund Policy
                  </Link>{" "}
                  are the entire agreement between us about the service.
                </li>
                <li>
                  <strong>Changes.</strong> We may update these Terms; the date
                  at the top changes, and material changes are emailed to account
                  holders. Continuing to use the service means you accept them.
                </li>
                <li>
                  <strong>Severability.</strong> If a clause is unenforceable, the
                  rest stays in force.
                </li>
                <li>
                  <strong>No waiver.</strong> Not enforcing a term once doesn't
                  waive it later.
                </li>
                <li>
                  <strong>Assignment.</strong> You may not transfer your account
                  without our consent; we may transfer these Terms as part of a
                  merger or sale, on notice.
                </li>
              </ul>
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
              <p className="mb-3">Thanks for using {siteConfig.name}.</p>
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
