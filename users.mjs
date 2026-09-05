import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, ssl: 'require', onnotice: () => {} });
const u = await sql`
  select u.email, u.name, u.role, u.created_at,
         coalesce(us.one_time_credits_balance,0) + coalesce(us.subscription_credits_balance,0) as credits,
         (select count(*) from compression_jobs j where j.user_id = u.id) as jobs
  from "user" u left join usage us on us.user_id = u.id
  order by u.created_at desc`;
console.log('注册用户数:', u.length);
for (const x of u) {
  console.log(`  ${x.email}  role=${x.role}  积分=${x.credits}  任务=${x.jobs}  注册于 ${x.created_at.toISOString().slice(0,16)}`);
}
const anon = await sql`select count(*)::int c from compression_jobs where user_id is null`;
console.log('匿名压缩任务:', anon[0].c);
process.exit(0);
