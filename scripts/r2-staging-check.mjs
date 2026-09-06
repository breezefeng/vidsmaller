#!/usr/bin/env node
/**
 * 盯住 R2 暂存区，验证生命周期规则真的在干活。
 *
 *   node scripts/r2-staging-check.mjs [--clean]
 *
 * 正常情况下 compress-input/ 只应该有正在处理的任务的文件。堆积说明：
 *   - 有任务卡在中途（用户关页面、上传中断），syncJob 的清理没走到
 *   - 或者 Cloudflare 的 expire-compress-input 规则失效了
 *
 * 只需要 Object Read & Write 权限，用现成的 R2_ACCESS_KEY_ID 即可。
 */
import { readFileSync, existsSync } from 'node:fs';

for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue;
  for (const l of readFileSync(f, 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = await import(
  '@aws-sdk/client-s3'
);

const clean = process.argv.includes('--clean');
const Bucket = process.env.R2_BUCKET_NAME;
if (!Bucket) {
  console.error('R2_BUCKET_NAME 未配置');
  process.exit(1);
}

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/** Cloudflare 上配的规则：compress-input/ 前缀，上传 1 天后删除 */
const LIFECYCLE_DAYS = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

let token;
const objects = [];
do {
  const page = await client.send(
    new ListObjectsV2Command({
      Bucket,
      Prefix: 'compress-input/',
      ContinuationToken: token,
    })
  );
  objects.push(...(page.Contents ?? []));
  token = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (token);

const now = Date.now();
const mb = (b) => (b / 1048576).toFixed(1);
const totalMB = objects.reduce((a, o) => a + o.Size, 0) / 1048576;

// 超过生命周期期限还在的，说明规则没生效
const overdue = objects.filter(
  (o) => now - new Date(o.LastModified).getTime() > LIFECYCLE_DAYS * DAY_MS
);
// 超过 1 小时还在的，多半是没跑完的孤儿任务（正常任务几分钟就结束并清理）
const stale = objects.filter(
  (o) => now - new Date(o.LastModified).getTime() > 60 * 60 * 1000
);

console.log(`\ncompress-input/  共 ${objects.length} 个对象  ${totalMB.toFixed(1)} MB\n`);

if (objects.length) {
  console.log('最旧的 10 个:');
  for (const o of [...objects].sort((a, b) => a.LastModified - b.LastModified).slice(0, 10)) {
    const ageH = (now - new Date(o.LastModified).getTime()) / 3600000;
    console.log(
      `  ${o.Key.padEnd(60)} ${mb(o.Size).padStart(8)} MB  ${ageH.toFixed(1)}h`
    );
  }
  console.log();
}

const ok = (pass, msg) => console.log(`  ${pass ? '🟢' : '🔴'} ${msg}`);
console.log('检查:');
ok(
  overdue.length === 0,
  overdue.length === 0
    ? `没有超过 ${LIFECYCLE_DAYS} 天的对象 —— 生命周期规则正常`
    : `${overdue.length} 个对象超过 ${LIFECYCLE_DAYS} 天仍在 —— 检查 Cloudflare 的 expire-compress-input 规则`
);
ok(
  stale.length < 10,
  stale.length < 10
    ? `${stale.length} 个孤儿文件（>1h）`
    : `${stale.length} 个孤儿文件（>1h）—— syncJob 的清理逻辑可能有漏网路径`
);
ok(totalMB < 5000, `占用 ${totalMB.toFixed(0)} MB（R2 免费额度 10 GB）`);

if (clean && stale.length) {
  console.log(`\n清理 ${stale.length} 个 >1h 的对象...`);
  for (const o of stale) await client.send(new DeleteObjectCommand({ Bucket, Key: o.Key }));
  console.log('完成');
} else if (stale.length) {
  console.log('\n加 --clean 可立即删除 >1h 的孤儿文件');
}
