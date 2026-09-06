#!/usr/bin/env node
/**
 * `lib/seo/benchmark.ts` must still say what the lab output says.
 *
 * The charts built on that module are the whole "we measured this instead of
 * asserting it" claim. A number that drifts away from `fc-benchmark-results.jsonl`
 * — by a careless edit, a rounded value, a copy-paste from the wrong row —
 * turns the claim into the opposite of itself, silently and permanently.
 *
 *   node scripts/check-benchmark-sync.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JSONL = path.join(ROOT, 'scripts/fc-benchmark-results.jsonl');
const TS = path.join(ROOT, 'lib/seo/benchmark.ts');

const raw = fs
  .readFileSync(JSONL, 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const src = fs.readFileSync(TS, 'utf8');

// Parse the object literals out of the TS rather than importing it: this script
// must run without a TypeScript toolchain, in a pre-commit hook or CI step.
const block = src.match(
  /export const BENCHMARK_RUNS: BenchmarkRun\[\] = \[([\s\S]*?)\n\];/
);
if (!block) {
  console.error('  ✗ could not find BENCHMARK_RUNS in lib/seo/benchmark.ts');
  process.exit(1);
}

const entries = block[1]
  .split(/\}\s*,/)
  .map((s) => s.trim())
  .filter((s) => s.includes('jobId'));

const field = (text, key) => {
  const m = text.match(new RegExp(`${key}:\\s*'?([^,'\\n]+)'?`));
  return m ? m[1].trim() : undefined;
};

// TS field -> jsonl field
const MAP = {
  jobId: 'jobId',
  codec: 'codec',
  width: 'width',
  height: 'height',
  sourceSeconds: 'durationSec',
  sourceBytes: 'sizeBytes',
  outputBytes: 'outBytes',
  uploadSec: 'uploadSec',
  importSec: 'importSec',
  compressSec: 'compressSec',
  exportSec: 'exportSec',
};

let problems = 0;

if (entries.length !== raw.length) {
  console.error(
    `  ✗ ${entries.length} runs in benchmark.ts, ${raw.length} in the jsonl`
  );
  problems++;
}

entries.forEach((entry, i) => {
  const row = raw[i];
  if (!row) return;
  for (const [tsKey, jsonKey] of Object.entries(MAP)) {
    const got = field(entry, tsKey);
    const want = String(row[jsonKey]);
    if (got !== want) {
      console.error(`  ✗ run ${i} (${row.label})  ${tsKey}: "${got}" != "${want}"`);
      problems++;
    }
  }
  // Every run in this set used the same provider mode; a chart that assumed a
  // CRF sweep would be reading data that does not exist.
  if (row.percentage !== 50) {
    console.error(`  ✗ run ${i} is not percentage-50 — check the mode field`);
    problems++;
  }
});

if (problems) {
  console.error(`\n  ${problems} mismatch(es) against ${path.basename(JSONL)}.\n`);
  process.exit(1);
}

console.log(
  `  ✓ ${entries.length} benchmark runs match ${path.basename(JSONL)} field for field.\n`
);
