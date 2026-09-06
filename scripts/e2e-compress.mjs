#!/usr/bin/env node
/**
 * 端到端跑一次真实压缩，走浏览器同款流程（staging-first），
 * 然后拉出 provider 的 task 明细，算出真实计费分钟。
 *
 *   node scripts/e2e-compress.mjs <file.mp4> [--base http://localhost:3000]
 */
import { readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { execFileSync } from 'node:child_process';

for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/e2e-compress.mjs <file.mp4>'); process.exit(1); }
const bi = process.argv.indexOf('--base');
const BASE = bi === -1 ? 'http://localhost:3000' : process.argv[bi + 1];

const name = basename(file);
const buf = readFileSync(file);
const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_entries','format=duration,size','-of','json',file]).toString());
const durationSeconds = Number(probe.format.duration);
const fileSize = buf.length;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const f = (n, d = 1) => Number(n).toFixed(d);

async function api(path, init) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status} ${JSON.stringify(body)}`);
  return body.data ?? body;
}

const settings = {
  mode: 'preset', preset: 'balanced', codec: 'libx264',
  speed: 'medium', outputFormat: 'mp4', oldDeviceCompatible: false,
};

console.log(`\n源文件 ${name}  ${f(fileSize/1048576)} MB  ${f(durationSeconds/60,2)} min\n`);

/* 1. 申请 R2 暂存地址 */
let t = Date.now();
const staging = await api('/api/compress/staging-url', {
  method: 'POST',
  body: JSON.stringify({ filename: name, fileSize, contentType: 'video/mp4' }),
});
console.log(`1) staging-url        ${f((Date.now()-t)/1000)}s  key=${staging.key}`);

/* 2. 上传到 R2（这段不计 FreeConvert 的费） */
t = Date.now();
const put = await fetch(staging.url, { method: 'PUT', body: buf, headers: { 'Content-Type': staging.contentType } });
if (!put.ok) throw new Error(`R2 PUT HTTP ${put.status}`);
const r2Sec = (Date.now()-t)/1000;
console.log(`2) 上传到 R2          ${f(r2Sec)}s  (${f(fileSize/1048576/r2Sec)} MB/s)  <- 不计 FC 费用`);

/* 3. 建任务（provider 从 R2 拉取） */
t = Date.now();
const created = await api('/api/compress/jobs', {
  method: 'POST',
  body: JSON.stringify({ filename: name, fileSize, durationSeconds, settings, stagingKey: staging.key }),
});
const jobId = created.job.id;
console.log(`3) 建任务             ${f((Date.now()-t)/1000)}s  job=${jobId}  credits=${created.creditsCharged}  upload=${created.upload ? '有' : '无(走R2)'}`);

/* 4. 轮询 */
t = Date.now();
let job, last = '';
for (let i = 0; i < 600; i++) {
  ({ job } = await api(`/api/compress/jobs/${jobId}`));
  const line = `${job.status} ${job.progress}%`;
  if (line !== last) { process.stdout.write(`\r4) 处理中             ${line}          `); last = line; }
  if (['completed','failed','expired'].includes(job.status)) break;
  await sleep(2000);
}
process.stdout.write('\n');
console.log(`   最终状态: ${job.status}  ${f((Date.now()-t)/1000)}s`);
if (job.errorMessage) console.log(`   错误: ${job.errorMessage}`);
if (job.status === 'completed') {
  console.log(`   输出 ${f(job.outputSize/1048576)} MB  省了 ${job.savedPercent}%`);
}

/* 5. 从 provider 拉 task 明细，算真实计费 */
const jr = await fetch(`https://api.freeconvert.com/v1/process/jobs?limit=5`, {
  headers: { Authorization: `Bearer ${process.env.FREECONVERT_API_KEY}` },
});
const list = await jr.json();
const fcId = list.docs?.[0]?.id;
const dr = await fetch(`https://api.freeconvert.com/v1/process/jobs/${fcId}`, {
  headers: { Authorization: `Bearer ${process.env.FREECONVERT_API_KEY}` },
});
const fc = await dr.json();

console.log('\n=== FreeConvert 真实计费 ===');
let total = 0;
for (const task of fc.tasks ?? []) {
  const s = task.startedAt && task.endedAt ? (new Date(task.endedAt) - new Date(task.startedAt)) / 1000 : null;
  const billed = s === null ? 0 : Math.max(1, Math.ceil(s / 60));
  total += billed;
  console.log(`  ${(task.name||'?').padEnd(12)} ${(task.operation||'').padEnd(14)} ${f(s ?? 0).padStart(7)}s -> ${billed} 分钟`);
}
console.log(`  ${''.padEnd(12)} ${''.padEnd(14)} ${'合计'.padStart(7)}    ${total} 分钟`);
console.log(`\n  收 ${created.creditsCharged} credits，烧 ${total} FC 分钟`);
