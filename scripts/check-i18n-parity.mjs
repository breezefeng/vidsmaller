#!/usr/bin/env node
/**
 * Every locale must have the same key structure.
 *
 * A missing key is not a cosmetic bug in this codebase — next-intl throws, so
 * `ja/Tools.json` missing one entry is a 500 on eight pages in Japanese while
 * English looks perfect. That is exactly the failure that survives review.
 *
 * This replaced a set of one-shot generator scripts that wrote all three
 * locales at once. Those guaranteed parity but would silently overwrite any
 * hand-edited translation the next time someone ran them. Checking is strictly
 * better than regenerating: it catches drift without owning the content.
 *
 *   node scripts/check-i18n-parity.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MESSAGES = path.join(ROOT, 'i18n/messages');

const REFERENCE = 'en';

/** Flatten to dotted paths. Arrays become `key.0`, `key.1`, … */
function keys(value, prefix = '') {
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => keys(v, `${prefix}.${i}`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) =>
      keys(v, prefix ? `${prefix}.${k}` : k)
    );
  }
  return [prefix];
}

function filesIn(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? filesIn(path.join(dir, e.name)).map((f) => path.join(e.name, f))
        : e.name.endsWith('.json')
          ? [e.name]
          : []
    );
}

const locales = fs
  .readdirSync(MESSAGES, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

const others = locales.filter((l) => l !== REFERENCE);
const refFiles = filesIn(path.join(MESSAGES, REFERENCE)).sort();

let problems = 0;

for (const locale of others) {
  const localeFiles = new Set(filesIn(path.join(MESSAGES, locale)));

  for (const file of refFiles) {
    if (!localeFiles.has(file)) {
      console.error(`  ✗ ${locale}/${file} is missing entirely`);
      problems++;
      continue;
    }

    const ref = JSON.parse(
      fs.readFileSync(path.join(MESSAGES, REFERENCE, file), 'utf8')
    );
    const cur = JSON.parse(
      fs.readFileSync(path.join(MESSAGES, locale, file), 'utf8')
    );

    const refKeys = new Set(keys(ref));
    const curKeys = new Set(keys(cur));

    const missing = [...refKeys].filter((k) => !curKeys.has(k));
    const extra = [...curKeys].filter((k) => !refKeys.has(k));

    for (const k of missing) {
      console.error(`  ✗ ${locale}/${file}  missing: ${k}`);
      problems++;
    }
    for (const k of extra) {
      console.error(`  ! ${locale}/${file}  extra:   ${k}`);
      problems++;
    }
  }

  // Files the reference does not have are worth flagging too — usually a
  // rename that only landed in one locale.
  for (const file of localeFiles) {
    if (!refFiles.includes(file)) {
      console.error(`  ! ${locale}/${file} has no ${REFERENCE} counterpart`);
      problems++;
    }
  }
}

if (problems) {
  console.error(`\n  ${problems} problem(s). Locales are out of sync.\n`);
  process.exit(1);
}

console.log(
  `  ✓ ${locales.length} locales, ${refFiles.length} files, key structure identical.\n`
);
