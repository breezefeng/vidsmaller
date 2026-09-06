import { Separator } from "@/components/ui/separator";
import { siteConfig } from "@/config/site";
import { constructMetadata } from "@/lib/metadata";
import { HomeIcon } from "lucide-react";
import { Metadata } from "next";
import Link from "next/link";
import CookieManagementSection from "./CookieManagementSection";

export const dynamic = "force-static";
export const revalidate = false;

const LAST_UPDATED = "6 September 2026";
const SUPPORT_EMAIL = siteConfig.socialLinks?.email || "support@vidsmaller.com";

export async function generateMetadata(): Promise<Metadata> {
  return constructMetadata({
    title: "Privacy Policy",
    description: `What ${siteConfig.name} does with your videos, your account data and your payments — and how long any of it is kept.`,
    path: `/privacy-policy`,
    locale: "en",
    availableLocales: ["en"],
  });
}

const SUBPROCESSORS: { name: string; purpose: string; location: string }[] = [
  {
    name: "FreeConvert",
    purpose:
      "Runs the actual video encoding, and hosts the compressed result until its download link expires",
    location: "United States",
  },
  {
    name: "Cloudflare (R2)",
    purpose:
      "Storage bucket your browser uploads to before encoding, plus the CDN that serves it to the encoder; also hosts account avatars and blog images",
    location: "Global edge network",
  },
  {
    name: "Vercel",
    purpose: "Application hosting, request routing and aggregate page analytics",
    location: "United States (us-east-1)",
  },
  {
    name: "Supabase (PostgreSQL)",
    purpose:
      "Database holding accounts, compression job records, credit ledger and orders",
    location: "United States (AWS us-east-1)",
  },
  {
    name: "Stripe",
    purpose:
      "Payment processing, subscription billing and the customer billing portal",
    location: "Global (Stripe entities)",
  },
  {
    name: "Resend",
    purpose:
      "Sign-in links, one-time codes, transactional email and newsletter delivery",
    location: "United States (AWS SES us-east-1)",
  },
  {
    name: "Upstash (Redis)",
    purpose:
      "Short-lived counters that enforce the free daily limit and block abuse",
    location: "United States (us-east-1)",
  },
  {
    name: "Google",
    purpose:
      "Google sign-in and Google One Tap, if you choose to sign in with a Google account",
    location: "Global (Google LLC)",
  },
];

const RETENTION: { item: string; kept: string }[] = [
  {
    item: "The video you upload (staged copy in our bucket)",
    kept: "Deleted as soon as the job reaches a final state. A bucket lifecycle rule hard-deletes anything left behind within 24 hours — for example if you close the tab mid-upload.",
  },
  {
    item: "The compressed result",
    kept: "2 hours for jobs started without an account; up to 7 days for signed-in accounts. After that the download link stops working and the file is removed by the encoding provider.",
  },
  {
    item: "Job record (file name, sizes, duration, format, settings, credits, status)",
    kept: "For as long as your account exists, so your history, billing and support requests make sense. Deleted with the account. Anonymous job rows are pruned once they expire.",
  },
  {
    item: "Hashed visitor key for signed-out jobs",
    kept: "Stored on the job row and removed with it. It is a one-way hash — we cannot turn it back into your IP address.",
  },
  {
    item: "Rate-limit counters (Redis)",
    kept: "Rolling 24-hour window, then they expire automatically.",
  },
  {
    item: "Account profile (email, name, avatar, sign-in provider)",
    kept: "Until you delete your account. Deletion removes your sessions, jobs, credit history and profile within 30 days.",
  },
  {
    item: "Orders, invoices and payment records",
    kept: "Retained as long as tax and accounting law requires (typically 7 years), even after account deletion. Card numbers are never among them.",
  },
  {
    item: "Server logs",
    kept: "Kept briefly by our hosting provider for debugging and abuse investigation, then rotated out.",
  },
];

export default function PrivacyPolicyPage() {
  const COOKIE_CONSENT_ENABLED =
    process.env.NEXT_PUBLIC_COOKIE_CONSENT_ENABLED === "true";

  return (
    <div className="bg-secondary/20 py-8 sm:py-12">
      <div className="container mx-auto max-w-4xl px-4">
        <div className="bg-background rounded-xl border p-6 shadow-xs sm:p-8 dark:border-zinc-800">
          <h1 className="mb-2 text-2xl font-bold sm:text-3xl">Privacy Policy</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Last updated: {LAST_UPDATED}
          </p>

          <div className="space-y-6">
            <section className="rounded-lg border bg-secondary/30 p-4">
              <h2 className="mb-3 text-xl font-semibold">The short version</h2>
              <ul className="list-disc space-y-1 pl-6">
                <li>
                  Your video is uploaded straight from your browser to our
                  storage bucket, encoded, and then deleted. We do not watch it,
                  train on it, or sell it.
                </li>
                <li>
                  Staged uploads are deleted the moment a job finishes; results
                  expire after 2 hours (signed out) or up to 7 days (signed in).
                </li>
                <li>
                  We never see your card number — Stripe handles payments end to
                  end.
                </li>
                <li>
                  Signed-out visitors are counted with a one-way hash of IP +
                  browser, not a stored IP address.
                </li>
                <li>
                  No advertising networks, no data brokers, no selling of
                  personal information.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">Who we are</h2>
              <p className="mb-3">
                {siteConfig.name} ("we", "us") operates{" "}
                <Link href="/" className="text-primary hover:underline">
                  {siteConfig.url.replace(/^https?:\/\//, "")}
                </Link>
                , a browser-based video compression service. We are the data
                controller for the information described here. This policy
                covers the website, the compressor, and the accounts and
                payments attached to them.
              </p>
              <p className="mb-3">
                Questions, requests or complaints:{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-blue-500 hover:underline"
                >
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">
                Your videos, specifically
              </h2>
              <p className="mb-3">
                This is the part most people actually care about, so it comes
                first.
              </p>
              <ul className="mb-3 list-disc space-y-1 pl-6">
                <li>
                  <strong>Where the file goes.</strong> Your browser uploads it
                  directly to our Cloudflare R2 bucket using a one-time signed
                  URL. It does not pass through the web server that renders this
                  page. The object key is a random UUID, so the address cannot be
                  guessed.
                </li>
                <li>
                  <strong>Who processes it.</strong> Our encoding provider
                  (FreeConvert) fetches the file from that bucket over HTTPS,
                  runs the FFmpeg job with the settings you chose, and returns a
                  compressed file. Your download is proxied through our server.
                </li>
                <li>
                  <strong>What we do not do with it.</strong> No human at{" "}
                  {siteConfig.name} opens your video. It is not used to train
                  machine-learning models, is not shared with advertisers or data
                  brokers, and is not analysed for anything beyond running the
                  compression you asked for.
                </li>
                <li>
                  <strong>What is left afterwards.</strong> The staged upload is
                  deleted when the job settles; the result expires on the timer
                  in the retention table below. What remains is the job record —
                  file name, sizes, duration, chosen settings, credits charged —
                  which is what powers your history and support requests.
                </li>
                <li>
                  <strong>Don't upload what you can't share with a
                  processor.</strong> Compression is inherently a "send the file
                  to a server" operation. If footage is confidential to the point
                  that a third-party encoder is unacceptable, use a local tool
                  instead. We would rather say that than pretend otherwise.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">
                Information we collect
              </h2>

              <div className="mb-6">
                <h3 className="mb-3 text-lg font-medium">
                  1. Information you give us
                </h3>
                <ul className="mb-3 list-disc space-y-1 pl-6">
                  <li>
                    <strong>Account data</strong> — email address, display name
                    and avatar, either typed in or supplied by the sign-in
                    provider you chose. We support Google sign-in (including
                    Google One Tap), magic links and one-time email codes. We do
                    not use passwords, so there is no password to store or leak.
                  </li>
                  <li>
                    <strong>Files and job settings</strong> — the video you
                    upload and the compression options you select.
                  </li>
                  <li>
                    <strong>Payment details</strong> — entered on Stripe's
                    checkout, never on our servers. We receive and store the
                    resulting order records: plan, amount, currency, status and
                    Stripe identifiers. We never receive your full card number.
                  </li>
                  <li>
                    <strong>Messages</strong> — anything you send us by email,
                    plus the newsletter subscription and preferences if you opt
                    in.
                  </li>
                </ul>
              </div>

              <div className="mb-6">
                <h3 className="mb-3 text-lg font-medium">
                  2. Information collected automatically
                </h3>
                <ul className="mb-3 list-disc space-y-1 pl-6">
                  <li>
                    <strong>Technical request data</strong> — IP address,
                    user-agent, timestamps and requested URL, as in any server
                    log. Used for security, debugging and abuse prevention.
                  </li>
                  <li>
                    <strong>A hashed visitor key</strong> — for signed-out
                    compressions we store{" "}
                    <code className="rounded bg-secondary px-1 py-0.5 text-sm">
                      sha256(IP + user-agent + server secret)
                    </code>
                    , truncated. It lets us enforce the free daily limit and
                    return your job to you without keeping your IP address on the
                    record.
                  </li>
                  <li>
                    <strong>Rate-limit counters</strong> — short-lived counters
                    in Redis keyed by IP, on a rolling 24-hour window.
                  </li>
                  <li>
                    <strong>Aggregate page analytics</strong> — Vercel Analytics,
                    which is cookieless and reports visit counts and page
                    performance in aggregate. It does not build a profile of you
                    across sites.
                  </li>
                </ul>
                <p className="mb-3">
                  We currently run <strong>no advertising network</strong> and no
                  cross-site ad tracking on this site. If that ever changes, this
                  page and the cookie controls will be updated before it does.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">
                Why we use it (and the legal basis)
              </h2>
              <ul className="mb-3 list-disc space-y-1 pl-6">
                <li>
                  <strong>To run the service</strong> — accept your upload,
                  encode it, deliver the result, track credits, keep your history
                  (performance of a contract).
                </li>
                <li>
                  <strong>To take payment</strong> — process subscriptions and
                  credit purchases, issue receipts, meet accounting obligations
                  (contract and legal obligation).
                </li>
                <li>
                  <strong>To keep the service up</strong> — rate limiting, fraud
                  and abuse prevention, debugging, capacity planning (legitimate
                  interests).
                </li>
                <li>
                  <strong>To talk to you</strong> — sign-in codes, job or billing
                  notifications, and support replies (contract); product
                  newsletters only if you opted in (consent — unsubscribe in one
                  click from any of them).
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">
                How long we keep things
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="border bg-secondary/40 px-3 py-2 text-left font-semibold dark:border-zinc-800">
                        Data
                      </th>
                      <th className="border bg-secondary/40 px-3 py-2 text-left font-semibold dark:border-zinc-800">
                        Retention
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {RETENTION.map((row) => (
                      <tr key={row.item}>
                        <td className="border px-3 py-2 align-top font-medium dark:border-zinc-800">
                          {row.item}
                        </td>
                        <td className="border px-3 py-2 align-top dark:border-zinc-800">
                          {row.kept}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">
                Who else touches your data
              </h2>
              <p className="mb-3">
                We do not sell personal information and we do not share it for
                advertising. We do use the following processors to run the
                service — each of them only gets what its job requires:
              </p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="border bg-secondary/40 px-3 py-2 text-left font-semibold dark:border-zinc-800">
                        Processor
                      </th>
                      <th className="border bg-secondary/40 px-3 py-2 text-left font-semibold dark:border-zinc-800">
                        What it does
                      </th>
                      <th className="border bg-secondary/40 px-3 py-2 text-left font-semibold dark:border-zinc-800">
                        Where
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {SUBPROCESSORS.map((p) => (
                      <tr key={p.name}>
                        <td className="border px-3 py-2 align-top font-medium dark:border-zinc-800">
                          {p.name}
                        </td>
                        <td className="border px-3 py-2 align-top dark:border-zinc-800">
                          {p.purpose}
                        </td>
                        <td className="border px-3 py-2 align-top dark:border-zinc-800">
                          {p.location}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mb-3 mt-3">
                We may also disclose information where the law genuinely requires
                it, or to protect our rights, users and infrastructure from
                abuse. If {siteConfig.name} is ever sold or merged, account data
                would transfer with it and you would be told before anything
                changed.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">
                International transfers
              </h2>
              <p className="mb-3">
                Our servers and processors are primarily in the United States,
                with Cloudflare serving from the edge location nearest you. If
                you are in the EEA, UK or Switzerland, your data is therefore
                transferred outside your country. Those transfers rely on the
                processors' Standard Contractual Clauses and equivalent
                safeguards, which they publish in their own data processing
                agreements.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">Security</h2>
              <ul className="mb-3 list-disc space-y-1 pl-6">
                <li>Everything moves over TLS — uploads, API calls, downloads.</li>
                <li>
                  Uploads use short-lived signed URLs, and object keys are random
                  UUIDs (122 bits of entropy) rather than file names.
                </li>
                <li>
                  Downloads are proxied by our server against your job record, so
                  one user's link cannot be reused by another.
                </li>
                <li>
                  Provider webhooks are HMAC-verified before we act on them.
                </li>
                <li>
                  No card data ever reaches us, and no passwords exist to be
                  stolen.
                </li>
              </ul>
              <p className="mb-3">
                No system is perfect. If you find a security problem, email{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-blue-500 hover:underline"
                >
                  {SUPPORT_EMAIL}
                </a>{" "}
                and we will get back to you quickly.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">Your rights</h2>
              <p className="mb-3">
                Depending on where you live (GDPR, UK GDPR, CCPA/CPRA and
                similar laws), you can ask us to:
              </p>
              <ul className="mb-3 list-disc space-y-1 pl-6">
                <li>
                  <strong>Access</strong> a copy of the personal data we hold
                  about you
                </li>
                <li>
                  <strong>Correct</strong> anything inaccurate — name, email and
                  avatar are editable yourself in{" "}
                  <span className="font-mono text-sm">/dashboard/settings</span>
                </li>
                <li>
                  <strong>Delete</strong> your account and the data attached to
                  it
                </li>
                <li>
                  <strong>Export</strong> your data in a portable format
                </li>
                <li>
                  <strong>Object to or restrict</strong> processing based on our
                  legitimate interests
                </li>
                <li>
                  <strong>Withdraw consent</strong> for marketing email at any
                  time
                </li>
              </ul>
              <p className="mb-3">
                Email{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-blue-500 hover:underline"
                >
                  {SUPPORT_EMAIL}
                </a>{" "}
                from the address on your account and we will respond within 30
                days. We do not charge for this, and we will not degrade your
                service for asking. We do not sell or "share" personal
                information as those terms are defined under California law.
              </p>
            </section>

            <CookieManagementSection />

            <section>
              <h2 className="mb-3 text-xl font-semibold">Cookies</h2>
              <p className="mb-3">
                We keep this list short on purpose. The cookies and local storage
                items this site actually sets are:
              </p>
              <ul className="mb-3 list-disc space-y-1 pl-6">
                <li>
                  <strong>Session cookie</strong> — keeps you signed in. Strictly
                  necessary; without it there is no account.
                </li>
                <li>
                  <strong>
                    <code className="rounded bg-secondary px-1 py-0.5 text-sm">
                      NEXT_LOCALE
                    </code>
                  </strong>{" "}
                  — remembers whether you chose English, 中文 or 日本語.
                </li>
                <li>
                  <strong>Theme preference</strong> — light or dark mode, stored
                  in your browser's local storage.
                </li>
                {COOKIE_CONSENT_ENABLED && (
                  <li>
                    <strong>
                      <code className="rounded bg-secondary px-1 py-0.5 text-sm">
                        cookieConsent
                      </code>
                    </strong>{" "}
                    — records your answer to the cookie banner for a year.
                  </li>
                )}
                <li>
                  <strong>Google sign-in</strong> — if you use Google or Google
                  One Tap, Google sets its own cookies on its own domains under
                  its privacy policy.
                </li>
              </ul>
              <p className="mb-3">
                Our page analytics are cookieless. You can block or delete
                cookies in your browser settings; blocking the session cookie
                means you cannot stay signed in, but anonymous compression will
                still work.
                {COOKIE_CONSENT_ENABLED &&
                  " You can also change your choice at any time in the Cookie Preferences section above."}
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">Children</h2>
              <p className="mb-3">
                {siteConfig.name} is not intended for children under 13 (or the
                minimum age in your country), and we do not knowingly collect
                their data. If you believe a child has created an account, email
                us and we will delete it.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">
                Changes to this policy
              </h2>
              <p className="mb-3">
                When we change something material — a new processor, a new
                retention window, anything that affects your files — we update
                the date at the top of this page and, for significant changes,
                email account holders. Continuing to use the service after a
                change means you accept the updated policy.
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
                Related: <Link href="/terms-of-service" className="text-primary hover:underline">Terms of Service</Link>
                {" · "}
                <Link href="/refund-policy" className="text-primary hover:underline">Refund Policy</Link>
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
