#!/usr/bin/env node
/**
 * FreeConvert conversion-minute benchmark.
 *
 * Measures the real ratio between VidSmaller "credits" (= source video minutes)
 * and FreeConvert "conversion minutes" (= server-side processing wall clock),
 * so pricing can be sanity-checked before buying a plan.
 *
 * Usage:
 *   node scripts/fc-benchmark.mjs <file.mp4> [--codec libx264|libx265] [--preset balanced]
 *
 * Reads FREECONVERT_API_KEY from .env.local.
 */

import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const API_BASE = 'https://api.freeconvert.com/v1';
const RESULTS = resolve(process.cwd(), 'scripts/fc-benchmark-results.jsonl');

/* ---------------- env ---------------- */
function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
      }
    }
  }
}
loadEnv();

const KEY = process.env.FREECONVERT_API_KEY;
if (!KEY) {
  console.error('FREECONVERT_API_KEY missing');
  process.exit(1);
}

/* ---------------- api ---------------- */
async function api(path, init = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KEY}`,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    const err = new Error(
      `HTTP ${res.status}: ${JSON.stringify(body).slice(0, 400)}`
    );
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function probe(file) {
  const out = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration,size,bit_rate',
    '-show_entries', 'stream=width,height,codec_name,codec_type',
    '-of', 'json',
    file,
  ]).toString();
  const j = JSON.parse(out);
  const v = (j.streams || []).find((s) => s.codec_type === 'video') || {};
  return {
    durationSec: Number(j.format?.duration ?? 0),
    sizeBytes: Number(j.format?.size ?? 0),
    bitrateKbps: Math.round(Number(j.format?.bit_rate ?? 0) / 1000),
    width: v.width,
    height: v.height,
    codec: v.codec_name,
  };
}

const ms = (a, b) => (a && b ? new Date(b) - new Date(a) : null);
const fmt = (n, d = 2) => (n == null ? 'n/a' : Number(n).toFixed(d));

/* ---------------- main ---------------- */
async function run(file, opts) {
  const meta = probe(file);
  const name = basename(file);
  const srcMinutes = meta.durationSec / 60;

  console.log(`\n${'='.repeat(72)}`);
  console.log(`SOURCE  ${name}`);
  console.log(
    `        ${meta.width}x${meta.height} ${meta.codec} | ` +
      `${fmt(meta.durationSec / 60, 2)} min | ` +
      `${fmt(meta.sizeBytes / 1024 / 1024, 1)} MB | ${meta.bitrateKbps} kbps`
  );
  console.log(
    `SETTING codec=${opts.codec} speed=${opts.speed} mode=preset(${opts.percentage}%)`
  );
  console.log('='.repeat(72));

  const jobDef = {
    tag: `bench:${opts.label}`,
    tasks: {
      vs_import: { operation: 'import/upload' },
      vs_compress: {
        operation: 'compress',
        input: 'vs_import',
        input_format: 'mp4',
        output_format: 'mp4',
        options: {
          video_codec_compress: opts.codec,
          video_compress_speed: opts.speed,
          compress_video: 'by_percentage',
          video_compress_quality_percentage: opts.percentage,
        },
      },
      vs_export: {
        operation: 'export/url',
        input: 'vs_compress',
        filename: name.replace(/\.mp4$/, '-c.mp4'),
      },
    },
  };

  const t0 = Date.now();
  const job = await api('/process/jobs', {
    method: 'POST',
    body: JSON.stringify(jobDef),
  });
  console.log(`job ${job.id} created`);

  // wait for the upload form
  let form = null;
  for (let i = 0; i < 40; i++) {
    const j = await api(`/process/jobs/${job.id}`);
    const imp = j.tasks.find((t) => t.name === 'vs_import');
    if (imp?.result?.form) {
      form = imp.result.form;
      break;
    }
    if (imp?.status === 'failed') throw new Error(`import failed: ${JSON.stringify(imp.result)}`);
    await sleep(1000);
  }
  if (!form) throw new Error('no upload form returned');

  // upload
  const upStart = Date.now();
  const fd = new FormData();
  for (const [k, v] of Object.entries(form.parameters || {})) fd.append(k, v);
  fd.append('file', new Blob([readFileSync(file)]), name);
  const upRes = await fetch(form.url, { method: 'POST', body: fd });
  if (!upRes.ok) throw new Error(`upload HTTP ${upRes.status}`);
  const upSec = (Date.now() - upStart) / 1000;
  console.log(
    `uploaded in ${fmt(upSec, 1)}s ` +
      `(${fmt(meta.sizeBytes / 1024 / 1024 / upSec, 1)} MB/s)`
  );

  // poll to completion
  let final = null;
  const deadline = Date.now() + 60 * 60 * 1000;
  let lastPct = -1;
  while (Date.now() < deadline) {
    const j = await api(`/process/jobs/${job.id}`);
    const comp = j.tasks.find((t) => t.name === 'vs_compress');
    if (comp?.percent != null && comp.percent !== lastPct) {
      lastPct = comp.percent;
      process.stdout.write(`\r  compress ${comp.status} ${comp.percent}%   `);
    }
    if (j.status === 'completed' || j.status === 'failed') {
      final = j;
      break;
    }
    await sleep(3000);
  }
  process.stdout.write('\n');
  if (!final) throw new Error('timed out');

  const imp = final.tasks.find((t) => t.name === 'vs_import');
  const comp = final.tasks.find((t) => t.name === 'vs_compress');
  const exp = final.tasks.find((t) => t.name === 'vs_export');

  if (final.status === 'failed') {
    console.log(`JOB FAILED: ${JSON.stringify(final.result || comp?.result)}`);
    const row = {
      ts: new Date().toISOString(),
      file: name,
      ...meta,
      ...opts,
      status: 'failed',
      error: JSON.stringify(final.result || comp?.result),
    };
    appendFileSync(RESULTS, JSON.stringify(row) + '\n');
    return row;
  }

  const compressMs = ms(comp?.startedAt, comp?.endedAt);
  const importMs = ms(imp?.startedAt, imp?.endedAt);
  const exportMs = ms(exp?.startedAt, exp?.endedAt);
  const jobMs = ms(final.startedAt, final.endedAt);

  const compressMin = compressMs / 60000;
  const billableMin = jobMs / 60000; // worst case: whole job billed
  const outBytes = comp?.result?.size ?? exp?.result?.size ?? 0;

  const ratioCompress = compressMin / srcMinutes;
  const ratioJob = billableMin / srcMinutes;

  console.log(`\n  import      ${fmt(importMs / 1000, 1)}s`);
  console.log(`  compress    ${fmt(compressMs / 1000, 1)}s  (${fmt(compressMin, 3)} min)`);
  console.log(`  export      ${fmt(exportMs / 1000, 1)}s`);
  console.log(`  job total   ${fmt(jobMs / 1000, 1)}s  (${fmt(billableMin, 3)} min)`);
  console.log(
    `  output      ${fmt(outBytes / 1024 / 1024, 1)} MB ` +
      `(${fmt((1 - outBytes / meta.sizeBytes) * 100, 1)}% smaller)`
  );
  console.log(`\n  >> VidSmaller credits charged : ${Math.max(1, Math.ceil(srcMinutes * (opts.codec === 'libx265' ? 2 : 1)))}`);
  console.log(`  >> FC minutes (compress only) : ${fmt(compressMin, 2)}`);
  console.log(`  >> FC minutes (whole job)     : ${fmt(billableMin, 2)}`);
  console.log(`  >> RATIO fc/src (compress)    : ${fmt(ratioCompress, 3)}x`);
  console.log(`  >> RATIO fc/src (job)         : ${fmt(ratioJob, 3)}x`);

  const row = {
    ts: new Date().toISOString(),
    file: name,
    jobId: job.id,
    ...meta,
    ...opts,
    status: 'completed',
    srcMinutes,
    uploadSec: upSec,
    importSec: importMs / 1000,
    compressSec: compressMs / 1000,
    exportSec: exportMs / 1000,
    jobSec: jobMs / 1000,
    outBytes,
    ratioCompress,
    ratioJob,
  };
  appendFileSync(RESULTS, JSON.stringify(row) + '\n');
  return row;
}

/* ---------------- cli ---------------- */
const args = process.argv.slice(2);
const file = args[0];
if (!file) {
  console.error('usage: node scripts/fc-benchmark.mjs <file.mp4> [--codec X] [--speed Y] [--pct N] [--label L]');
  process.exit(1);
}
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i === -1 ? def : args[i + 1];
};
const opts = {
  codec: getArg('--codec', 'libx264'),
  speed: getArg('--speed', 'medium'),
  percentage: Number(getArg('--pct', '50')),
  label: getArg('--label', 'default'),
};

run(file, opts).catch((e) => {
  console.error(`\nERROR: ${e.message}`);
  process.exit(1);
});
