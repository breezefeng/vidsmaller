#!/usr/bin/env node
/**
 * 冷启动预算模型：Basic ($12.99) 到底能撑多久？
 * 校准来源见 docs/freeconvert-benchmark.md
 *   compress_min ≈ (6.1 + 0.1191 * src_sec) / 60      (1080p, libx264)
 */
const OVERHEAD = 6.1;
const K = 0.1191; // s per source-second, 1080p x264
const RES = { '720p': 1 / 2.25, '1080p': 1, '4K': 3.85 };

const fcMin = (srcMin, res = '1080p', x265 = false) =>
  (OVERHEAD + K * RES[res] * (x265 ? 3.77 : 1) * srcMin * 60) / 60;

const PLANS = [
  { name: 'Basic', usd: 12.99, min: 1500, gb: 1.5 },
  { name: 'Pro  ', usd: 29.99, min: 4000, gb: 5 },
];

// 一个文件多大 -> 多少分钟视频（按常见码率）
const bitrateMbps = { '720p': 3, '1080p': 6, '4K': 35 };
const sizeToMin = (gb, res) => (gb * 1024 * 8) / bitrateMbps[res] / 60;

console.log('=== 1.5 GB 上限到底卡不卡人 ===');
for (const res of ['720p', '1080p', '4K']) {
  console.log(
    `  ${res.padEnd(6)} @${String(bitrateMbps[res]).padStart(2)} Mbps : ` +
      `1.5GB = ${sizeToMin(1.5, res).toFixed(0)} 分钟视频  |  ` +
      `5GB = ${sizeToMin(5, res).toFixed(0)} 分钟`
  );
}

console.log('\n=== 免费流量烧池速度（真正的风险）===');
const FREE_JOBS = [
  { label: '匿名档满载 200MB (1080p ≈3.3min)', srcMin: sizeToMin(0.2, '1080p'), res: '1080p' },
  { label: '免费档典型 300MB (1080p ≈7min)  ', srcMin: sizeToMin(0.3, '1080p'), res: '1080p' },
  { label: '免费档满载 1GB   (1080p ≈23min) ', srcMin: sizeToMin(1, '1080p'), res: '1080p' },
];
for (const p of PLANS) {
  const perDay = p.min / 30;
  console.log(`\n  ${p.name} — ${p.min} 分钟/月 = ${perDay.toFixed(0)} 分钟/天`);
  for (const j of FREE_JOBS) {
    const cost = fcMin(j.srcMin, j.res);
    console.log(
      `    ${j.label}  →  ${cost.toFixed(2)} FC分钟/次  →  **${Math.floor(perDay / cost)} 次/天**`
    );
  }
}

console.log('\n=== 付费用户能撑几个（25% 额度消耗，混合负载）===');
const blendPerUser = (credits) => {
  const src = credits * 0.25;
  return (
    fcMin(src * 0.6, '1080p') + fcMin(src * 0.25, '4K') + fcMin(src * 0.15, '1080p', true)
  );
};
for (const p of PLANS) {
  const pro = blendPerUser(600);
  const max = blendPerUser(2000);
  console.log(
    `  ${p.name}  Pro($9)用户 ${Math.floor(p.min / pro)} 人 (MRR $${
      Math.floor(p.min / pro) * 9
    })   |   Max($29)用户 ${Math.floor(p.min / max)} 人`
  );
}

console.log('\n=== 回本点 ===');
for (const p of PLANS) {
  console.log(
    `  ${p.name} $${p.usd}/mo  →  ${Math.ceil(p.usd / 9)} 个 Pro 用户就回本 ` +
      `(或 ${Math.ceil(p.usd / 29)} 个 Max 用户)`
  );
}
