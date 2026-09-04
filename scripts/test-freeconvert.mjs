#!/usr/bin/env node
/**
 * End-to-end smoke test for the FreeConvert integration.
 *
 *   FREECONVERT_API_KEY=xxx node scripts/test-freeconvert.mjs ./sample.mp4
 *
 * It performs exactly what the app does:
 *   1. create a job with import/upload -> compress -> export/url
 *   2. upload the file to the returned form URL
 *   3. poll until the job finishes
 *   4. print the download URL and the size delta
 *
 * It also tells you whether the upload host sends CORS headers, which is what
 * decides if the browser can upload directly (no bucket needed) or has to fall
 * back to the R2 staging path.
 */

import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const API = process.env.FREECONVERT_API_BASE_URL || 'https://api.freeconvert.com/v1';
const KEY = process.env.FREECONVERT_API_KEY;

if (!KEY) {
  console.error('✗ FREECONVERT_API_KEY is not set (put it in .env.local)');
  process.exit(1);
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/test-freeconvert.mjs <path-to-video>');
  process.exit(1);
}

const headers = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  Authorization: `Bearer ${KEY}`,
};

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${init.method || 'GET'} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
  }
  return body;
}

const fmt = (n) => {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  return `${(n / 1024 ** i).toFixed(1)} ${u[i]}`;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const info = await stat(filePath);
  const filename = basename(filePath);
  const ext = filename.split('.').pop().toLowerCase();

  console.log(`▶ Source: ${filename} (${fmt(info.size)})\n`);

  console.log('1/4  Creating job…');
  const job = await api('/process/jobs', {
    method: 'POST',
    body: JSON.stringify({
      tag: 'vidsmaller:smoketest',
      tasks: {
        vs_import: { operation: 'import/upload' },
        vs_compress: {
          operation: 'compress',
          input: 'vs_import',
          input_format: ext,
          output_format: 'mp4',
          options: {
            compress_video: 'by_percentage',
            video_codec_compress: 'libx264',
            video_compress_quality_percentage: 50,
            video_compress_speed: 'medium',
          },
        },
        vs_export: {
          operation: 'export/url',
          input: 'vs_compress',
          filename: `${filename.replace(/\.[^.]+$/, '')}-compressed.mp4`,
        },
      },
    }),
  });
  console.log(`     job id: ${job.id}`);

  const importTask = job.tasks.find((t) => t.name === 'vs_import');
  const form = importTask?.result?.form;
  if (!form?.url) throw new Error('No upload form returned');
  console.log(`     upload host: ${new URL(form.url).host}`);

  console.log('\n2/4  Checking CORS on the upload host…');
  try {
    const pre = await fetch(form.url, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://vidsmaller.com',
        'Access-Control-Request-Method': 'POST',
      },
    });
    const allow = pre.headers.get('access-control-allow-origin');
    if (allow) {
      console.log(`     ✓ Access-Control-Allow-Origin: ${allow}`);
      console.log('       -> browsers can upload directly, no bucket needed.');
    } else {
      console.log('     ! no Access-Control-Allow-Origin header on OPTIONS');
      console.log('       -> configure R2_* env vars so the staging fallback works.');
    }
  } catch (err) {
    console.log(`     ! preflight failed: ${err.message}`);
  }

  console.log('\n3/4  Uploading…');
  const fd = new FormData();
  for (const [k, v] of Object.entries(form.parameters || {})) fd.append(k, v);
  fd.append('file', new Blob([await readFile(filePath)]), filename);

  const up = await fetch(form.url, { method: 'POST', body: fd });
  if (!up.ok) throw new Error(`Upload failed: ${up.status} ${await up.text()}`);
  console.log('     ✓ uploaded');

  console.log('\n4/4  Waiting for the job…');
  const started = Date.now();
  for (let i = 0; i < 300; i++) {
    await sleep(2000);
    const current = await api(`/process/jobs/${job.id}`);
    const pct = current.tasks
      .map((t) => `${t.name}:${t.status}${t.percent != null ? `(${t.percent}%)` : ''}`)
      .join('  ');
    process.stdout.write(`\r     ${pct}                    `);

    if (current.status === 'completed') {
      const out = current.tasks.find((t) => t.name === 'vs_export');
      const size = out?.result?.size;
      console.log(`\n\n✓ Done in ${Math.round((Date.now() - started) / 1000)}s`);
      console.log(`  ${fmt(info.size)} -> ${fmt(size)}  (−${size ? Math.round((1 - size / info.size) * 100) : '?'}%)`);
      console.log(`  ${out?.result?.url}`);
      return;
    }
    if (current.status === 'failed') {
      console.log('\n');
      console.error('✗ Job failed:', current.result?.msg || 'unknown');
      for (const t of current.tasks) {
        if (t.status === 'failed') {
          console.error(`  ${t.name}: [${t.result?.errorCode}] ${t.result?.msg}`);
        }
      }
      process.exit(1);
    }
  }
  throw new Error('Timed out waiting for the job');
}

main().catch((err) => {
  console.error('\n✗', err.message);
  process.exit(1);
});
