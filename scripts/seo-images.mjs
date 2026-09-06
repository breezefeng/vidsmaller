#!/usr/bin/env node
/**
 * SEO 配图生成器 — gpt-image-2 -> WebP -> R2
 *
 *   node scripts/seo-images.mjs --dry-run          # 只打印计划 + 成本估算，不花钱
 *   node scripts/seo-images.mjs                    # 生成缺失的图
 *   node scripts/seo-images.mjs --only blog        # 只做某个 group 或某个 id
 *   node scripts/seo-images.mjs --force            # 忽略 lockfile 重新生成
 *   node scripts/seo-images.mjs --local            # 只写 public/images/seo/，不传 R2
 *
 * 幂等：prompt + size + quality + styleContract 的哈希进 lock.json，
 * 没变就跳过。改一个字才会重新生成，不会每次跑都烧钱。
 *
 * 为什么不用 sharp：gpt-image-2 直接支持 output_format=webp，省一个原生依赖。
 */

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'content/seo-images/manifest.json');
const LOCKFILE = path.join(ROOT, 'content/seo-images/lock.json');
const LOCAL_DIR = path.join(ROOT, 'public/images/seo');

/**
 * 成本估算表（USD / 张）。来源：OpenAI 定价页的图像输出示例，2026-05。
 * 这只是估算——真实账单还会算上文本输入 token、参考图输入、重试。
 * 数字变了改这里。
 */
const COST = {
  '1024x1024': { low: 0.006, medium: 0.053, high: 0.211 },
  '1536x1024': { low: 0.005, medium: 0.041, high: 0.165 },
  '1024x1536': { low: 0.005, medium: 0.041, high: 0.165 },
};

/** Reference for interpolating sizes the table does not list. */
const COST_REF = { pixels: 1536 * 1024, ...COST['1536x1024'] };

/**
 * Estimated USD for one image.
 *
 * Sizes outside the published table are interpolated by pixel count and
 * flagged, because the first version of this returned 0 for anything it did
 * not recognise — so switching the covers to 16:9 made the whole run look
 * free. A cost estimate that silently reports zero is worse than none.
 */
function costOf(size, quality) {
  const known = COST[size]?.[quality];
  if (known != null) return { usd: known, exact: true };
  const [w, h] = size.split('x').map(Number);
  if (!w || !h) return { usd: 0, exact: false };
  return { usd: (COST_REF[quality] ?? 0) * ((w * h) / COST_REF.pixels), exact: false };
}

// ---------------------------------------------------------------- env

function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    for (const raw of fs.readFileSync(p, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      if (process.env[key] !== undefined) continue;
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

// ---------------------------------------------------------------- args

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const DRY = flag('dry-run');
const FORCE = flag('force');
const LOCAL_ONLY = flag('local');
const ONLY = opt('only');

// ---------------------------------------------------------------- helpers

const readJson = (p, fallback) =>
  fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback;

function specHash(styleContract, spec, d) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        styleContract,
        prompt: spec.prompt,
        size: spec.size ?? d.size,
        quality: spec.quality ?? d.quality,
        format: spec.outputFormat ?? d.outputFormat,
      })
    )
    .digest('hex')
    .slice(0, 16);
}

function buildPrompt(styleContract, spec) {
  // 风格合约放前面、主体放后面。反过来模型会跑偏 —— 这是这类批量生成
  // 最常见的翻车点：每张图长得都不一样，站点看起来像拼贴画。
  return `${styleContract}\n\nSubject: ${spec.prompt}`;
}

async function generate({ prompt, size, quality, outputFormat, background }) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-image-2',
      prompt,
      n: 1,
      size,
      quality,
      output_format: outputFormat,
      ...(background ? { background } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }

  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error('no b64_json in response');
  return { buffer: Buffer.from(b64, 'base64'), usage: json.usage };
}

async function uploadR2(key, buffer, contentType) {
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // SEO 配图永不变更内容（改了就换文件名），可以放心长缓存
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

// ---------------------------------------------------------------- main

async function main() {
  loadEnv();

  const manifest = readJson(MANIFEST, null);
  if (!manifest) {
    console.error(`manifest 不存在: ${MANIFEST}`);
    process.exit(1);
  }

  const lock = readJson(LOCKFILE, { images: {} });
  const d = manifest.defaults;
  const style = manifest.styleContract;

  let specs = manifest.images;
  if (ONLY) specs = specs.filter((s) => s.id === ONLY || s.group === ONLY);
  if (!specs.length) {
    console.error(`--only ${ONLY} 没匹配到任何图`);
    process.exit(1);
  }

  // ---- 先算账
  const plan = specs.map((s) => {
    const size = s.size ?? d.size;
    const quality = s.quality ?? d.quality;
    const hash = specHash(style, s, d);
    const cached = lock.images[s.id];
    const skip = !FORCE && cached?.hash === hash;
    const { usd, exact } = costOf(size, quality);
    return { spec: s, size, quality, hash, skip, cost: usd, exactCost: exact };
  });

  const todo = plan.filter((p) => !p.skip);
  const est = todo.reduce((a, p) => a + p.cost, 0);

  console.log(`\n  manifest : ${specs.length} 张`);
  console.log(`  已缓存   : ${plan.length - todo.length} 张（跳过）`);
  console.log(`  待生成   : ${todo.length} 张`);
  const interpolated = todo.some((p) => !p.exactCost);
  console.log(
    `  成本估算 : ~$${est.toFixed(3)}  (${manifest.model})` +
      (interpolated ? '  ← 含按像素插值的尺寸，以账单为准' : '') +
      '\n'
  );

  for (const p of plan) {
    console.log(
      `  ${p.skip ? '·' : '→'} ${p.spec.id.padEnd(22)} ${p.size} ${p.quality.padEnd(6)} ` +
        `${p.skip ? 'cached' : `$${p.cost.toFixed(3)}`}  ${p.spec.slug}`
    );
  }
  console.log('');

  if (DRY) {
    console.log('  --dry-run，没有调用 API。\n');
    return;
  }
  if (!todo.length) {
    console.log('  全部已缓存，无事可做。\n');
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error('  缺 OPENAI_API_KEY（.env.local）。\n');
    process.exit(1);
  }
  if (!LOCAL_ONLY && !process.env.R2_PUBLIC_URL) {
    console.error('  缺 R2 配置，或者加 --local 只写本地。\n');
    process.exit(1);
  }

  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  let spent = 0;
  let failed = 0;

  for (const p of todo) {
    const s = p.spec;
    const fmt = s.outputFormat ?? d.outputFormat;
    const filename = `${s.slug}-${p.hash}.${fmt}`; // 哈希进文件名 = 内容变了 URL 就变
    process.stdout.write(`  ${s.id} … `);

    try {
      const { buffer } = await generate({
        prompt: buildPrompt(style, s),
        size: p.size,
        quality: p.quality,
        outputFormat: fmt,
        background: s.background ?? d.background,
      });

      const localPath = path.join(LOCAL_DIR, filename);
      fs.writeFileSync(localPath, buffer);

      let url = `/images/seo/${filename}`;
      if (!LOCAL_ONLY) {
        url = await uploadR2(`seo/${s.group}/${filename}`, buffer, `image/${fmt}`);
      }

      const [w, h] = p.size.split('x').map(Number);
      lock.images[s.id] = {
        hash: p.hash,
        url,
        alt: s.alt,
        width: w,
        height: h,
        bytes: buffer.length,
        group: s.group,
        usedBy: s.usedBy ?? [],
        model: manifest.model,
        quality: p.quality,
        generatedAt: new Date().toISOString(),
      };
      spent += p.cost;
      console.log(`ok  ${(buffer.length / 1024).toFixed(0)} KB  ${url}`);
    } catch (err) {
      failed++;
      console.log(`FAIL  ${err.message}`);
    }

    // 每张都落盘，中途挂掉不丢已生成的
    fs.writeFileSync(LOCKFILE, JSON.stringify(lock, null, 2) + '\n');
  }

  console.log(
    `\n  完成：${todo.length - failed} 成功 / ${failed} 失败，约 $${spent.toFixed(3)}`
  );
  console.log(`  lock: ${path.relative(ROOT, LOCKFILE)}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
