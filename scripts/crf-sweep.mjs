#!/usr/bin/env node
/**
 * CRF sweep: how output size and perceived quality actually move with CRF.
 *
 * This is the measurement `lib/seo/benchmark.ts` says it does not have, and
 * without it four of the planned articles have nothing behind them.
 *
 * WHY THIS RUNS LOCALLY AND NOT THROUGH THE PROVIDER
 *
 * The CRF curve is a property of libx264, not of whoever is hosting it. Our
 * service and this script hand the same encoder the same numbers. Running it
 * through the provider would cost 3 operations and ~3 billed minutes per data
 * point — 54 of each for a 6x3 grid, which is six days on the free tier — and
 * would buy no extra truth. Locally it costs nothing, so we can afford a dense
 * sweep and a real quality metric instead of three lonely points.
 *
 * What that trade gives up, and how to get it back: the provider may not use
 * exactly our preset, may add a tune, may run two passes. So this is a faithful
 * proxy for our output, not a recording of it. `--verify` runs a handful of
 * real provider jobs at chosen CRFs and reports the delta, which turns "proxy"
 * into a number. Any chart built on this data has to say which one it is.
 *
 * SOURCE MATERIAL IS THE WHOLE EXPERIMENT
 *
 * Do not point this at `testsrc2` or any other synthetic pattern. Synthetic
 * noise compresses nothing like real footage and would produce a confidently
 * wrong curve. Use real clips, and use more than one kind — camera, screen
 * recording and animation sit in completely different places on this curve,
 * which is itself one of the findings worth publishing.
 *
 *   node scripts/crf-sweep.mjs --source clip.mp4 --label camera
 *   node scripts/crf-sweep.mjs --source clip.mp4 --label camera --crf 18,23,28
 *   node scripts/crf-sweep.mjs --list
 *   node scripts/crf-sweep.mjs --verify clip.mp4 --crf 23   # one real provider job
 *
 * Results append to scripts/crf-sweep-results.jsonl. Re-running skips
 * combinations already measured, so an interrupted sweep resumes.
 */

import { execFileSync, execSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS = path.join(ROOT, 'scripts/crf-sweep-results.jsonl');

const DEFAULT_CRFS = [18, 20, 23, 26, 28, 32];

/* ------------------------------------------------------------------ args */

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i === -1 ? d : argv[i + 1];
};

/* --------------------------------------------------------------- helpers */

const sh = (cmd, args) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function need(bin) {
  try {
    execSync(`command -v ${bin}`, { stdio: 'ignore' });
  } catch {
    console.error(`  ✗ ${bin} not found on PATH`);
    process.exit(1);
  }
}

function probe(file) {
  const out = sh('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,codec_name,nb_frames',
    '-show_entries', 'format=duration,size',
    '-of', 'json',
    file,
  ]);
  const j = JSON.parse(out);
  const s = j.streams[0];
  const [num, den] = (s.r_frame_rate || '30/1').split('/').map(Number);
  return {
    width: s.width,
    height: s.height,
    fps: +(num / (den || 1)).toFixed(3),
    codec: s.codec_name,
    durationSec: +Number(j.format.duration).toFixed(3),
    sizeBytes: Number(j.format.size),
  };
}

/** Identify a source by content, so renaming a file does not orphan its rows. */
function sourceHash(file) {
  const buf = fs.readFileSync(file);
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
}

function readRows() {
  if (!fs.existsSync(RESULTS)) return [];
  return fs
    .readFileSync(RESULTS, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

/* ------------------------------------------------------------- measuring */

/**
 * Encode video-only. Audio is deliberately excluded so the size numbers are
 * pure video bitrate — the rest of the codebase already treats audio as a flat
 * 128 kbps (see lib/seo/bitrate-budget.ts) and mixing it in here would make the
 * two sets of numbers quietly incompatible.
 */
function encode(src, dst, { crf, codec, preset }) {
  const t0 = Date.now();
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', src,
      '-c:v', codec,
      '-preset', preset,
      '-crf', String(crf),
      '-pix_fmt', 'yuv420p',
      '-an',
      dst,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  return {
    encodeSec: +((Date.now() - t0) / 1000).toFixed(2),
    bytes: fs.statSync(dst).size,
  };
}

/** VMAF against the source. The reference must be the original, not a re-encode. */
function vmaf(distorted, reference) {
  const log = path.join(os.tmpdir(), `vmaf-${crypto.randomUUID()}.json`);
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner', '-loglevel', 'error',
      '-i', distorted,
      '-i', reference,
      '-lavfi', `libvmaf=log_fmt=json:log_path=${log}`,
      '-f', 'null', '-',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const j = JSON.parse(fs.readFileSync(log, 'utf8'));
  fs.unlinkSync(log);
  const p = j.pooled_metrics;
  return {
    vmafMean: +p.vmaf.mean.toFixed(2),
    vmafMin: +p.vmaf.min.toFixed(2),
    vmafHarmonic: p.vmaf.harmonic_mean != null ? +p.vmaf.harmonic_mean.toFixed(2) : null,
  };
}

function ssim(distorted, reference) {
  // ffmpeg prints filter summaries to stderr, not stdout — reading only stdout
  // silently yields null, which is worse than not measuring at all because it
  // looks like a measured absence.
  const r = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-i', distorted,
      '-i', reference,
      '-lavfi', 'ssim',
      '-f', 'null', '-',
    ],
    { encoding: 'utf8' }
  );
  const m = /All:([0-9.]+)/.exec(`${r.stderr || ''}${r.stdout || ''}`);
  if (!m) throw new Error('could not parse SSIM from ffmpeg output');
  return +Number(m[1]).toFixed(5);
}

/* ------------------------------------------------------------------ main */

function sweep() {
  const source = opt('source');
  const label = opt('label');
  if (!source || !label) {
    console.error('  --source and --label are both required');
    process.exit(1);
  }
  if (!fs.existsSync(source)) {
    console.error(`  ✗ no such file: ${source}`);
    process.exit(1);
  }

  const codec = opt('codec', 'libx264');
  const preset = opt('preset', 'medium');
  const crfs = String(opt('crf', DEFAULT_CRFS.join(',')))
    .split(',')
    .map((n) => parseInt(n.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 51);

  const meta = probe(source);
  const hash = sourceHash(source);

  console.log(`\n  source  ${path.basename(source)}  [${label}]`);
  console.log(
    `          ${meta.width}x${meta.height} ${meta.fps}fps ${meta.codec} · ` +
      `${meta.durationSec}s · ${(meta.sizeBytes / 1048576).toFixed(1)} MB · sha ${hash}`
  );
  console.log(`  encode  ${codec} preset=${preset} crf=${crfs.join(',')}\n`);

  const done = new Set(
    readRows()
      .filter((r) => r.sourceHash === hash && r.codec === codec && r.preset === preset)
      .map((r) => r.crf)
  );

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crf-'));

  for (const crf of crfs) {
    if (done.has(crf)) {
      console.log(`  crf ${String(crf).padStart(2)}  · already measured, skipping`);
      continue;
    }
    const dst = path.join(tmp, `crf${crf}.mp4`);
    process.stdout.write(`  crf ${String(crf).padStart(2)}  encoding… `);
    const { encodeSec, bytes } = encode(source, dst, { crf, codec, preset });

    process.stdout.write('vmaf… ');
    const q = vmaf(dst, source);
    process.stdout.write('ssim… ');
    const s = ssim(dst, source);

    const row = {
      ts: new Date().toISOString(),
      tool: 'local-ffmpeg',
      source: path.basename(source),
      sourceHash: hash,
      label,
      width: meta.width,
      height: meta.height,
      fps: meta.fps,
      durationSec: meta.durationSec,
      sourceBytes: meta.sizeBytes,
      codec,
      preset,
      crf,
      videoBytes: bytes,
      videoKbps: +((bytes * 8) / meta.durationSec / 1000).toFixed(1),
      encodeSec,
      ...q,
      ssim: s,
    };
    fs.appendFileSync(RESULTS, JSON.stringify(row) + '\n');
    fs.unlinkSync(dst);

    console.log(
      `${(bytes / 1048576).toFixed(2)} MB · ${row.videoKbps} kbps · ` +
        `VMAF ${q.vmafMean} (min ${q.vmafMin}) · SSIM ${s} · ${encodeSec}s`
    );
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n  → ${path.relative(ROOT, RESULTS)}\n`);
}

function list() {
  const rows = readRows();
  if (!rows.length) return console.log('\n  no measurements yet\n');
  const bySource = new Map();
  for (const r of rows) {
    const k = `${r.label} (${r.source})`;
    if (!bySource.has(k)) bySource.set(k, []);
    bySource.get(k).push(r);
  }
  console.log(`\n  ${rows.length} measurements\n`);
  for (const [k, rs] of bySource) {
    console.log(`  ${k}  ${rs[0].width}x${rs[0].height} ${rs[0].durationSec}s`);
    console.log(
      `    ${'crf'.padEnd(5)}${'MB'.padEnd(9)}${'kbps'.padEnd(9)}${'VMAF'.padEnd(8)}SSIM`
    );
    for (const r of rs.sort((a, b) => a.crf - b.crf)) {
      console.log(
        `    ${String(r.crf).padEnd(5)}` +
          `${(r.videoBytes / 1048576).toFixed(2).padEnd(9)}` +
          `${String(r.videoKbps).padEnd(9)}` +
          `${String(r.vmafMean).padEnd(8)}${r.ssim}`
      );
    }
    console.log('');
  }
}

need('ffmpeg');
need('ffprobe');

if (flag('list')) list();
else sweep();
