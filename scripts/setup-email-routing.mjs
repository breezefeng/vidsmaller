#!/usr/bin/env node
/**
 * 给 vidsmaller.com 配 Cloudflare Email Routing，让 support@ 能收到信。
 *
 *   node scripts/setup-email-routing.mjs --to=you@gmail.com            # 只看，不改
 *   node scripts/setup-email-routing.mjs --to=you@gmail.com --apply    # 真的配
 *   node scripts/setup-email-routing.mjs --status                      # 查当前状态
 *
 * 为什么需要它：support@vidsmaller.com 已经印在关于页和三个法律页上，
 * 但根域没有 MX 记录，发过来的信直接退回。页面在教用户联系我们，却没有
 * 能收信的地方 —— 这是目前唯一一个"上线了但没闭环"的洞。
 *
 * 为什么用 Email Routing 而不是 Resend：Resend 这个域名 receiving 是
 * disabled，且它的入站是投递到 webhook，等于要为一封支持邮件写一个转发
 * 服务。Email Routing 免费、零代码、直接转到你现有的邮箱。两者都要占用
 * 根域 MX，只能二选一。（Resend 的发信记录挂在 send. 子域，不冲突。）
 *
 * 需要一个 API Token（不是 Global Key），权限四条：
 *   Zone   → Zone            → Read
 *   Zone   → Zone Settings   → Edit     （开启路由 + 写 MX/SPF）
 *   Zone   → Email Routing Rules → Edit
 *   Account→ Email Routing Addresses → Edit
 * 建 token：https://dash.cloudflare.com/profile/api-tokens
 * 放进 .env.local 的 CLOUDFLARE_API_TOKEN，或者临时 export。
 *
 * 有一步脚本替不了：Cloudflare 会往目的邮箱发一封验证信，必须你本人点
 * 里面的链接，转发才会生效。这是反滥用设计，没有 API 绕过。
 */
import { existsSync, readFileSync } from 'node:fs';

for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue;
  for (const l of readFileSync(f, 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]])
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

const DOMAIN = 'vidsmaller.com';
/** 想收信的地址，按需加 billing@ / abuse@ 之类 */
const ALIASES = ['support'];

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const statusOnly = args.includes('--status');
const destination = (args.find((a) => a.startsWith('--to=')) || '').slice(5);

const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID; // R2 的 account id 就是 Cloudflare account id

if (!TOKEN) {
  console.error(
    'CLOUDFLARE_API_TOKEN 未设置。见文件顶部注释里需要的四条权限。'
  );
  process.exit(1);
}
if (!ACCOUNT_ID) {
  console.error('R2_ACCOUNT_ID 未设置（Email Routing 的目的地址是账号级资源）');
  process.exit(1);
}
if (!statusOnly && !destination) {
  console.error('要转发到哪个邮箱？用 --to=you@example.com 指定。');
  process.exit(1);
}

const API = 'https://api.cloudflare.com/client/v4';

async function cf(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!body.success) {
    const msg = (body.errors || [])
      .map((e) => `${e.code} ${e.message}`)
      .join('; ');
    throw new Error(`${init.method || 'GET'} ${path} -> ${res.status} ${msg}`);
  }
  return body.result;
}

const tick = (ok) => (ok ? '✓' : '·');

/* 1. zone ------------------------------------------------------------- */

const zones = await cf(`/zones?name=${DOMAIN}`);
if (!zones.length) {
  console.error(`账号里没有 ${DOMAIN} 这个 zone，或者 token 没有 Zone:Read`);
  process.exit(1);
}
const zoneId = zones[0].id;
console.log(`zone   ${DOMAIN}  ${zoneId}`);

/* 2. 现状 -------------------------------------------------------------- */

const settings = await cf(`/zones/${zoneId}/email/routing`).catch(() => null);
const enabled = Boolean(settings?.enabled);
console.log(`路由   ${tick(enabled)} ${enabled ? '已开启' : '未开启'}`);

const mx = await cf(
  `/zones/${zoneId}/dns_records?type=MX&name=${DOMAIN}`
).catch(() => []);
const foreignMx = mx.filter((r) => !/mx\.cloudflare\.net$/i.test(r.content));
if (foreignMx.length) {
  console.error('\n根域已经有非 Cloudflare 的 MX 记录：');
  for (const r of foreignMx) console.error(`  ${r.priority} ${r.content}`);
  console.error(
    '开启 Email Routing 会接管根域收信，可能打断现有邮箱。先确认再手动处理。'
  );
  process.exit(1);
}
console.log(`根域MX ${tick(mx.length > 0)} ${mx.length} 条`);

const addresses = await cf(
  `/accounts/${ACCOUNT_ID}/email/routing/addresses?per_page=50`
).catch(() => []);
const existingDest = destination
  ? addresses.find((a) => a.email.toLowerCase() === destination.toLowerCase())
  : null;
if (destination) {
  console.log(
    `目的地 ${tick(Boolean(existingDest?.verified))} ${destination} ` +
      (existingDest
        ? existingDest.verified
          ? '已验证'
          : '待验证（收件箱里那封 Cloudflare 的信还没点）'
        : '未添加')
  );
}

const rules = await cf(`/zones/${zoneId}/email/routing/rules?per_page=50`).catch(
  () => []
);
for (const alias of ALIASES) {
  const addr = `${alias}@${DOMAIN}`;
  const hit = rules.find((r) =>
    (r.matchers || []).some((m) => m.value?.toLowerCase() === addr)
  );
  console.log(`规则   ${tick(Boolean(hit))} ${addr}`);
}

if (statusOnly) process.exit(0);

if (!apply) {
  console.log('\n以上是现状。加 --apply 才会真的改。');
  process.exit(0);
}

/* 3. 动手 -------------------------------------------------------------- */

console.log('');

if (!enabled) {
  await cf(`/zones/${zoneId}/email/routing/enable`, {
    method: 'POST',
    body: '{}',
  });
  console.log('已开启 Email Routing，MX + SPF 记录由 Cloudflare 写入并锁定');
} else {
  console.log('Email Routing 早就开着，跳过');
}

if (!existingDest) {
  const created = await cf(`/accounts/${ACCOUNT_ID}/email/routing/addresses`, {
    method: 'POST',
    body: JSON.stringify({ email: destination }),
  });
  console.log(
    `已添加目的地址 ${created.email} —— 验证信已发出，去点里面的链接`
  );
} else {
  console.log(`目的地址已存在（${existingDest.verified ? '已验证' : '待验证'}）`);
}

for (const alias of ALIASES) {
  const addr = `${alias}@${DOMAIN}`;
  const hit = rules.find((r) =>
    (r.matchers || []).some((m) => m.value?.toLowerCase() === addr)
  );
  if (hit) {
    console.log(`规则 ${addr} 已存在，跳过`);
    continue;
  }
  await cf(`/zones/${zoneId}/email/routing/rules`, {
    method: 'POST',
    body: JSON.stringify({
      enabled: true,
      name: `${addr} -> ${destination}`,
      matchers: [{ type: 'literal', field: 'to', value: addr }],
      actions: [{ type: 'forward', value: [destination] }],
    }),
  });
  console.log(`已建规则 ${addr} -> ${destination}`);
}

/* 4. 剩下要你做的 ------------------------------------------------------- */

const fresh = await cf(
  `/accounts/${ACCOUNT_ID}/email/routing/addresses?per_page=50`
);
const verified = fresh.find(
  (a) => a.email.toLowerCase() === destination.toLowerCase()
)?.verified;

console.log('');
if (verified) {
  console.log('目的地址已验证，转发即刻生效。发封信到 support@ 自测一下。');
} else {
  console.log(
    [
      `还差一步：${destination} 收件箱里有一封 Cloudflare 的验证信，点掉它。`,
      '在那之前规则是建好的，但邮件不会转发。',
      '点完再跑一次 --status 确认。',
    ].join('\n')
  );
}
