import { readFileSync, existsSync } from 'node:fs';
if (existsSync('.env.local')) for (const l of readFileSync('.env.local','utf8').split('\n')) {
  const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if(m&&!process.env[m[1]]) process.env[m[1]]=m[2].replace(/^["']|["']$/g,'').trim();
}
const { S3Client, GetBucketLifecycleConfigurationCommand } = await import('@aws-sdk/client-s3');
const client = new S3Client({ region:'auto',
  endpoint:`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials:{ accessKeyId:process.env.R2_ACCESS_KEY_ID, secretAccessKey:process.env.R2_SECRET_ACCESS_KEY }});
const Bucket = process.env.R2_BUCKET_NAME;
try {
  const r = await client.send(new GetBucketLifecycleConfigurationCommand({ Bucket }));
  console.log('现有规则:'); console.log(JSON.stringify(r.Rules, null, 2));
} catch (e) {
  console.log('读取现有规则 ->', e.name, '|', e.message.slice(0,160));
}
