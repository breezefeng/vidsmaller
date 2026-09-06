#!/usr/bin/env node
/**
 * FreeConvert 用量报表 —— 升级决策看这个。
 *
 *   node scripts/fc-usage.mjs [--days 30]
 *
 * 数据源是 compression_jobs.provider_compress_seconds，也就是 provider 自己
 * 的任务时间戳，不是估算值。
 */
import { readFileSync, existsSync } from 'node:fs';
import postgres from 'postgres';

for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  }
}

const PLANS = {
  basic: { usd: 12.99, minutes: 1500, gb: 1.5 },
  standard: { usd: 24.99, minutes: 2000, gb: 2 },
  pro: { usd: 29.99, minutes: 4000, gb: 5 },
};

// keep in sync with config/compress.ts
const PLAN = 'basic';
const plan = PLANS[PLAN];

const i = process.argv.indexOf('--days');
const days = i === -1 ? 30 : Number(process.argv[i + 1]);

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const rows = await sql`
  select
    date_trunc('month', created_at) as month,
    count(*)                                             as jobs,
    count(*) filter (where user_id is null)              as anon_jobs,
    count(*) filter (where status = 'failed')            as failed,
    count(*) filter (where provider_billed_minutes is not null) as measured,
    coalesce(sum(credits_charged) filter (where provider_billed_minutes is not null), 0) as measured_credits,
    coalesce(sum(provider_billed_minutes), 0)            as fc_minutes,
    coalesce(sum(provider_billed_minutes) filter (where user_id is null), 0) as fc_minutes_free,
    coalesce(sum(credits_charged), 0)                    as credits,
    coalesce(sum(input_size), 0) / 1073741824.0          as input_gb,
    coalesce(max(input_size), 0) / 1073741824.0          as largest_gb
  from compression_jobs
  where created_at > now() - ${days + ' days'}::interval
  group by 1 order by 1 desc
`;

const f = (n, d = 1) => Number(n).toFixed(d);

console.log(`\nFreeConvert 计划: ${PLAN}  $${plan.usd}/mo  ${plan.minutes} 分钟/月  单文件 ${plan.gb} GB\n`);

if (!rows.length) {
  console.log('还没有任何任务记录。');
} else {
  console.log('月份       任务   已测   匿名   失败   FC分钟   其中免费   占套餐   credits   上传GB   最大文件');
  for (const r of rows) {
    const pct = (r.fc_minutes / plan.minutes) * 100;
    console.log(
      `${r.month.toISOString().slice(0, 7)}  ${String(r.jobs).padStart(5)} ` +
        `${String(r.measured).padStart(6)} ` +
        `${String(r.anon_jobs).padStart(6)} ${String(r.failed).padStart(6)} ` +
        `${f(r.fc_minutes).padStart(8)} ${f(r.fc_minutes_free).padStart(10)} ` +
        `${(f(pct) + '%').padStart(8)} ${String(r.credits).padStart(9)} ` +
        `${f(r.input_gb).padStart(8)} ${f(r.largest_gb, 2).padStart(9)}`
    );
  }

  const cur = rows[0];
  const pct = (cur.fc_minutes / plan.minutes) * 100;

  // 只统计带测量数据的任务，否则改动之前的历史任务会把倍率稀释成 0
  const totals = rows.reduce(
    (a, r) => ({
      measured: a.measured + Number(r.measured),
      minutes: a.minutes + Number(r.fc_minutes),
      credits: a.credits + Number(r.measured_credits),
    }),
    { measured: 0, minutes: 0, credits: 0 }
  );

  if (totals.measured === 0) {
    console.log(
      `\n真实倍率 credit → FC 分钟: 暂无数据（${rows.reduce((a, r) => a + Number(r.jobs), 0)} 个任务都早于本次改动）` +
        `\n  跑通第一个任务后这里会显示实测值，基准 ~0.5x`
    );
  } else {
    const ratio = totals.credits > 0 ? totals.minutes / totals.credits : 0;
    const drift = ratio / 0.5;
    console.log(
      `\n真实倍率 credit → FC 分钟: ${f(ratio, 3)}x  ` +
        `(基准 ~0.5x，${drift > 1 ? '高' : '低'} ${f(Math.abs(drift - 1) * 100, 0)}%，样本 ${totals.measured} 个)`
    );
    if (drift > 2) {
      console.log('  ⚠️  实际成本是基准的 2 倍以上，定价假设需要重算');
    }
  }

  console.log('\n升级信号:');
  const hit = (ok, txt) => console.log(`  ${ok ? '🔴' : '🟢'} ${txt}`);
  hit(pct >= 80, `本月消耗 ${f(pct)}%（阈值 80%）`);

  const [{ blocked }] = await sql`
    select count(*)::int as blocked from compression_jobs
    where created_at > now() - interval '30 days'
      and error_code is not null
      and (error_code ilike '%size%' or error_message ilike '%larger than%' or error_message ilike '%capped at%')
  `;
  hit(blocked >= 3, `30 天内因文件过大被拒 ${blocked} 次（阈值 3）`);

  const [{ mrr }] = await sql`
    select coalesce(sum(
      case when p.recurring_interval = 'year' then p.price::numeric / 12
           else p.price::numeric end), 0)::float as mrr
    from subscriptions s join pricing_plans p on p.id = s.plan_id
    where s.status = 'active'
  `;
  hit(mrr > 150, `MRR $${f(mrr)}（阈值 $150）`);

  if (pct >= 80 || blocked >= 3 || mrr > 150) {
    console.log(`\n  → 升级到 FreeConvert Pro ($29.99, 4000 分钟, 5 GB)，`);
    console.log(`    然后把 config/compress.ts 的 PROVIDER_PLAN 改成 'pro'，`);
    console.log(`    并在 pricing-config.ts 把 Max 档 isActive 改回 true。`);
  }
}

await sql.end();
