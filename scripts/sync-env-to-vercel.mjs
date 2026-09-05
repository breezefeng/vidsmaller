#!/usr/bin/env node

/**
 * Push local environment variables to Vercel.
 *
 * Usage:
 *   node scripts/sync-env-to-vercel.mjs [--check] [--dry-run] [--env=production]
 *
 *   --check     Compare key sets only, report drift, exit 1 if they differ.
 *   --dry-run   Show what would be pushed without touching Vercel.
 *   --env=NAME  Target environment (default: production).
 *
 * Why this only ever pushes:
 * Vercel stores these variables as `type: sensitive`, which is write-only.
 * `vercel env pull` and the REST API with `?decrypt=true` both return empty
 * strings, so production values can never be read back. The local files are
 * the source of truth; Vercel is a projection of them.
 *
 * Source of truth:
 *   .env.local                  base (shared with local dev)
 *   .env.production.snapshot    overlay, only the values that differ
 *
 * Prerequisites: Vercel CLI installed and linked (`vercel link`).
 */

import { execFileSync, spawnSync } from "child_process";
import { existsSync } from "fs";
import {
  BASE_FILE,
  LOCAL_ONLY,
  OVERLAY_FILE,
  findUnsafeValues,
  loadProductionEnv,
} from "./lib/env-source.mjs";

const c = {
  reset: "\x1b[0m", red: "\x1b[31m", green: "\x1b[32m",
  yellow: "\x1b[33m", cyan: "\x1b[36m", dim: "\x1b[2m",
};
const log = {
  error: (m) => console.log(`${c.red}❌ ${m}${c.reset}`),
  ok: (m) => console.log(`${c.green}✅ ${m}${c.reset}`),
  info: (m) => console.log(`${c.cyan}${m}${c.reset}`),
  warn: (m) => console.log(`${c.yellow}⚠️  ${m}${c.reset}`),
  dim: (m) => console.log(`${c.dim}${m}${c.reset}`),
};

const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const DRY = args.includes("--dry-run");
const TARGET = (args.find((a) => a.startsWith("--env=")) || "--env=production").split("=")[1];

function vercelKeys(target) {
  try {
    const raw = execFileSync("vercel", ["env", "ls", target], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return new Set(
      raw.split("\n")
        .map((l) => (l.match(/^\s+([A-Z][A-Z0-9_]*)\s{2,}/) || [])[1])
        .filter(Boolean)
    );
  } catch (e) {
    log.error(`Could not read Vercel env list: ${e.message}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------

let merged;
try {
  merged = loadProductionEnv();
} catch (e) {
  log.error(e.message);
  process.exit(1);
}

const bad = findUnsafeValues(merged);

log.info(`\nTarget: ${TARGET}`);
log.info(`Source: ${BASE_FILE}${existsSync(OVERLAY_FILE) ? ` + ${OVERLAY_FILE}` : ""}`);
log.dim(`Skipped as local-only: ${[...LOCAL_ONLY].join(", ")}`);

// --- drift check -----------------------------------------------------------
const remote = vercelKeys(TARGET);
const localKeys = new Set(merged.keys());
const missingRemote = [...localKeys].filter((k) => !remote.has(k)).sort();
const extraRemote = [...remote].filter((k) => !localKeys.has(k)).sort();

console.log(`\n${c.cyan}Key comparison${c.reset}  (local ${localKeys.size} vs Vercel ${remote.size})`);
if (!missingRemote.length && !extraRemote.length) {
  log.ok("Key sets match.");
} else {
  for (const k of missingRemote) console.log(`  ${c.yellow}local only${c.reset}   ${k}`);
  for (const k of extraRemote) console.log(`  ${c.red}Vercel only${c.reset}  ${k}  ${c.dim}(no local value — would be lost on migration)${c.reset}`);
}
log.dim("\nValues cannot be compared: Vercel returns nothing for sensitive vars.");

if (bad.length) {
  console.log("");
  for (const [k, why] of bad) log.warn(`${k} ${why}`);
}

if (CHECK) {
  const drift = missingRemote.length || extraRemote.length;
  if (bad.length) log.warn(`\n${bad.length} value(s) not fit to push.`);
  process.exit(drift ? 1 : 0);
}

// A dry run touches nothing, so let it preview even with bad values.
if (bad.length && !DRY) {
  log.error("\nRefusing to push. Fix the values above first.");
  process.exit(1);
}

// --- push ------------------------------------------------------------------
console.log("");
if (DRY) log.info(`Dry run — would push ${merged.size} variables:\n`);

let pushed = 0, failed = 0;
for (const [k, v] of [...merged].sort()) {
  if (DRY) {
    console.log(`  ${c.dim}would push${c.reset} ${k} ${c.dim}(${v.length} chars)${c.reset}`);
    continue;
  }
  // Value goes over stdin, never argv, so it stays out of the process list.
  const r = spawnSync("vercel", ["env", "add", k, TARGET, "--force", "--sensitive"], {
    input: v, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  });
  if (r.status === 0) { console.log(`  ${c.green}+${c.reset} ${k}`); pushed++; }
  else { console.log(`  ${c.red}!${c.reset} ${k} — ${(r.stderr || "").trim().split("\n").pop()}`); failed++; }
}

if (!DRY) {
  console.log("");
  if (failed) log.error(`${pushed} pushed, ${failed} failed.`);
  else log.ok(`${pushed} variables pushed to ${TARGET}.`);
  log.dim("Env changes only apply to new builds — redeploy to pick them up.");
  process.exit(failed ? 1 : 0);
}
