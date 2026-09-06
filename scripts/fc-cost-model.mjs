#!/usr/bin/env node
/**
 * FreeConvert 成本模型 v2 —— 按「每 task 向上取整」的真实计费规则。
 *
 * v1 错在哪：以为计费 = compress 任务的原始墙钟时间。
 * 实际（2026-09-06 用账号面板反推验证）：
 *
 *   job_minutes = Σ over tasks: max(1, ceil(task_seconds / 60))
 *
 * 校验：3 个 benchmark 任务，模型算 12 分钟，面板实际扣 11 分钟（±10%）。
 * 原始 compress 时间只有 2.06 分钟 —— v1 低估 5 倍。
 *
 * 两个后果：
 *   1. 每个 job 至少 3 分钟（import + compress + export 各保底 1 分钟）
 *   2. import 计的是"用户上传耗时"，取决于用户带宽，不是服务器速度
 */

/* ---------- compress 速度（这部分 v1 测得是对的）---------- */
const OVERHEAD = 6.1;
const K = 0.1191; // 秒/源秒，1080p libx264 medium
const RES = { '720p': 1 / 2.25, '1080p': 1, '1440p': 1.78, '4K': 3.85 };
const X265 = 3.77;

/** 计费取整：每个 task 最低 1 分钟 */
const bill = (seconds) => Math.max(1, Math.ceil(seconds / 60));

const compressSeconds = (srcMin, res, x265) =>
  OVERHEAD + K * RES[res] * (x265 ? X265 : 1) * srcMin * 60;

/**
 * 一个任务的总计费分钟。
 * @param uploadMBps 用户上行速度；走 R2 中转时是服务器间拉取速度
 * @param skipExport 是否省掉 export/url 这个 task
 */
function jobMinutes({ srcMin, sizeMB, res, x265 = false, uploadMBps = 4.5, skipExport = false }) {
  const importMin = bill(sizeMB / uploadMBps);
  const compressMin = bill(compressSeconds(srcMin, res, x265));
  const exportMin = skipExport ? 0 : 1;
  return { importMin, compressMin, exportMin, total: importMin + compressMin + exportMin };
}

const FC = { basic: { usd: 12.99, min: 1500 }, pro: { usd: 29.99, min: 4000 } };
const f = (n, d = 1) => Number(n).toFixed(d);

/* ================= 1. 单任务成本：v1 vs v2 ================= */
console.log('='.repeat(78));
console.log('单任务计费分钟：旧模型 vs 真实规则');
console.log('='.repeat(78));
const CASES = [
  { n: '匿名 200MB / 1080p 3.3min', srcMin: 3.3, sizeMB: 200, res: '1080p' },
  { n: '免费典型 300MB / 7min', srcMin: 7, sizeMB: 300, res: '1080p' },
  { n: '免费满载 1GB / 23min', srcMin: 23, sizeMB: 1024, res: '1080p' },
  { n: 'Pro 典型 600MB / 10min', srcMin: 10, sizeMB: 600, res: '1080p' },
  { n: 'Pro 4K 900MB / 5min', srcMin: 5, sizeMB: 900, res: '4K' },
  { n: '小片段 20MB / 30s', srcMin: 0.5, sizeMB: 20, res: '1080p' },
];
console.log('场景                          旧模型   import  compress  export   真实   倍差');
for (const c of CASES) {
  const old = (OVERHEAD + K * RES[c.res] * c.srcMin * 60) / 60;
  const j = jobMinutes(c);
  console.log(
    `${c.n.padEnd(29)} ${f(old, 2).padStart(6)} ${String(j.importMin).padStart(8)} ` +
      `${String(j.compressMin).padStart(9)} ${String(j.exportMin).padStart(7)} ` +
      `${String(j.total).padStart(6)} ${(f(j.total / old, 1) + 'x').padStart(6)}`
  );
}

/* ================= 2. 免费流量能撑多少 ================= */
console.log('\n' + '='.repeat(78));
console.log('免费流量每天能跑几次（免费池 = 套餐的 50%）');
console.log('='.repeat(78));
console.log('套餐          日总额度   免费池   匿名200MB   典型300MB   满载1GB');
for (const [name, p] of Object.entries(FC)) {
  const perDay = p.min / 30;
  const free = perDay * 0.5;
  const a = jobMinutes(CASES[0]).total;
  const b = jobMinutes(CASES[1]).total;
  const c = jobMinutes(CASES[2]).total;
  console.log(
    `${name.padEnd(12)} ${f(perDay, 0).padStart(8)} ${f(free, 0).padStart(8)} ` +
      `${String(Math.floor(free / a)).padStart(11)} ${String(Math.floor(free / b)).padStart(11)} ` +
      `${String(Math.floor(free / c)).padStart(9)}`
  );
}

/* ================= 3. 付费用户单位经济 ================= */
console.log('\n' + '='.repeat(78));
console.log('VidSmaller Pro $9 / 600 credits —— 100% 烧完的成本');
console.log('MIN_CREDITS_PER_JOB = 3（已上线）· R2 中转已上线');
console.log('='.repeat(78));
const COST = FC.basic.usd / FC.basic.min; // 当前实际付的是 Basic
const MIN_CREDITS = 3;
const SCEN = [
  { n: '1080p x264，10 分钟一个', srcMin: 10, sizeMB: 600, res: '1080p' },
  { n: '1080p x264，3 分钟一个', srcMin: 3, sizeMB: 180, res: '1080p' },
  { n: '1080p x264，1 分钟一个', srcMin: 1, sizeMB: 60, res: '1080p' },
  { n: '4K x264，10 分钟一个', srcMin: 10, sizeMB: 1800, res: '4K' },
  { n: '1080p x265，10 分钟一个', srcMin: 10, sizeMB: 600, res: '1080p', x265: true },
];
console.log('用量形态                      任务数  FC分钟   成本   毛利   修复前毛利');
for (const s of SCEN) {
  const perJobCredits = Math.max(MIN_CREDITS, Math.ceil(s.srcMin * (s.x265 ? 2 : 1)));
  const jobs = Math.floor(600 / perJobCredits);
  const per = jobMinutes({ ...s, uploadMBps: 32 }).total;
  const fcMin = jobs * per;
  const cost = fcMin * COST;

  // 修复前：MIN=1、浏览器直传
  const jobsOld = Math.floor(600 / Math.max(1, Math.ceil(s.srcMin * (s.x265 ? 2 : 1))));
  const costOld = jobsOld * jobMinutes(s).total * COST;

  console.log(
    `${s.n.padEnd(29)} ${String(jobs).padStart(5)} ${String(fcMin).padStart(7)} ` +
      `${('$' + f(cost, 2)).padStart(7)} ${(f(((9 - cost) / 9) * 100, 0) + '%').padStart(6)} ` +
      `${(f(((9 - costOld) / 9) * 100, 0) + '%').padStart(10)}`
  );
}

/* ================= 4. 两个优化能省多少 ================= */
console.log('\n' + '='.repeat(78));
console.log('可做的两个优化');
console.log('='.repeat(78));
const base = { srcMin: 10, sizeMB: 600, res: '1080p' };
const v = [
  ['现状：浏览器直传 + export task', jobMinutes({ ...base })],
  ['① 去掉 export task（用 compress 结果 URL）', jobMinutes({ ...base, skipExport: true })],
  ['② 走 R2 中转（实测 32MB/s，已上线）', jobMinutes({ ...base, uploadMBps: 32 })],
  ['①+② 同时做（① 未做，会丢文件名）', jobMinutes({ ...base, uploadMBps: 32, skipExport: true })],
];
console.log('方案                                          import compress export  合计   降幅');
const b0 = v[0][1].total;
for (const [n, j] of v) {
  console.log(
    `${n.padEnd(45)} ${String(j.importMin).padStart(5)} ${String(j.compressMin).padStart(8)} ` +
      `${String(j.exportMin).padStart(7)} ${String(j.total).padStart(5)} ` +
      `${(f((1 - j.total / b0) * 100, 0) + '%').padStart(6)}`
  );
}
console.log('\n注：慢网用户影响巨大 —— 同一个 600MB 文件：');
for (const mbps of [1, 2, 4.5, 10, 32]) {
  const j = jobMinutes({ ...base, uploadMBps: mbps });
  console.log(`  上行 ${String(mbps).padStart(4)} MB/s -> import ${j.importMin} 分钟, 全任务 ${j.total} 分钟`);
}
