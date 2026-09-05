/**
 * Single source of truth for "what are the production environment variables".
 *
 * Kept separate from sync-env-to-vercel.mjs on purpose: this file is policy
 * (which keys exist, which must never ship, what counts as an unsafe value),
 * the script is mechanism (how to talk to a provider). Add a second target and
 * it imports from here rather than restating the rules.
 *
 * Vercel stores production variables as `type: sensitive`, which is write-only:
 * `vercel env pull` and `GET /v9/projects/:id/env?decrypt=true` both return
 * empty strings. Values can never be read back out, so the local files are
 * authoritative and every sync is a one-way push.
 *
 *   .env.local                 base — 26 of 28 production values + dev toggles
 *   .env.production.snapshot   overlay — only the values that differ in prod
 */

import { existsSync, readFileSync } from "fs";

export const BASE_FILE = ".env.local";
export const OVERLAY_FILE = ".env.production.snapshot";

/**
 * Keys that exist locally but must never be published anywhere.
 *
 * VERCEL_OIDC_TOKEN is a short-lived token the platform mints per deployment;
 * a copied one is both useless and a credential leak. The NEXT_PUBLIC_* entries
 * are local-dev toggles whose production behaviour is the code default, so
 * pushing them would pin production to a dev-only setting.
 */
export const LOCAL_ONLY = new Set([
  "VERCEL_OIDC_TOKEN",
  "NEXT_PUBLIC_LOCALE_DETECTION",
  "NEXT_PUBLIC_OPTIMIZED_IMAGES",
  "NEXT_PUBLIC_COOKIE_CONSENT_ENABLED",
  "NEXT_PUBLIC_USER_SOURCE_TRACKING_ENABLED",
  "NEXT_PUBLIC_EMAIL_NORMALIZATION_ENABLED",
]);

/** Parse one dotenv file into a Map. Handles quotes and inline comments. */
export function parseEnvFile(path) {
  const out = new Map();
  if (!existsSync(path)) return out;

  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim().replace(/\r$/, "");
    if (!line || line.startsWith("#")) continue;

    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;

    let value = m[2].trim();
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      const end = value.indexOf(quote, 1);
      if (end !== -1) value = value.slice(1, end);
    } else {
      // Strip inline comments from unquoted values only.
      const hash = value.indexOf(" #");
      if (hash !== -1) value = value.slice(0, hash);
      value = value.trim();
    }
    out.set(m[1], value);
  }
  return out;
}

/**
 * Merge base + overlay and drop local-only keys.
 * Pass an explicit path to sync some other file instead.
 */
export function loadProductionEnv({ baseFile = BASE_FILE, overlayFile = OVERLAY_FILE } = {}) {
  if (!existsSync(baseFile)) {
    throw new Error(`${baseFile} not found — nothing to sync.`);
  }
  const merged = new Map([...parseEnvFile(baseFile), ...parseEnvFile(overlayFile)]);
  for (const key of LOCAL_ONLY) merged.delete(key);
  return merged;
}

/**
 * Reject values that would break production if published.
 * Returns [[key, reason], ...] — empty means safe to push.
 */
export function findUnsafeValues(env) {
  const bad = [];
  for (const [key, value] of env) {
    if (value === "") bad.push([key, "is empty"]);
    else if (/<pw>|<PASSWORD>|CHANGEME|REPLACE_ME|your-.*-here/i.test(value)) {
      bad.push([key, "still contains a placeholder"]);
    } else if (/localhost|127\.0\.0\.1/.test(value)) {
      bad.push([key, `points at localhost (${value.slice(0, 40)})`]);
    }
  }
  return bad;
}
