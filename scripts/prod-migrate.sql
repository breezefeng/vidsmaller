-- ===========================================================================
-- 生产库变更 —— 配合提交 2fae0f0 + 235310c
-- 在 Supabase 控制台 SQL Editor 里整段执行（幂等，可重复跑）
--   https://supabase.com/dashboard/project/twzvincfksdupxicwozb/sql/new
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 新字段：记录 provider 真实计费
--    纯新增、可空，对现有数据零影响。
--    provider_billed_minutes 才是账单依据（每个 task 向上取整、最低 1 分钟），
--    原始秒数只作参考。
-- ---------------------------------------------------------------------------
ALTER TABLE compression_jobs
  ADD COLUMN IF NOT EXISTS provider_compress_seconds numeric(12,3),
  ADD COLUMN IF NOT EXISTS provider_job_seconds      numeric(12,3),
  ADD COLUMN IF NOT EXISTS provider_billed_minutes   integer;

-- ---------------------------------------------------------------------------
-- 2. Max 档下线
--    Max 的头牌卖点是单文件 10 GB，而当前 FreeConvert Basic 套餐上限 1.5 GB。
--    继续售卖 = 保证上传失败 + 退款。等升级到 FC Pro 再放出来。
-- ---------------------------------------------------------------------------
UPDATE pricing_plans SET is_active = false WHERE card_title = 'Max';

-- ---------------------------------------------------------------------------
-- 3. 文案对齐真实上限：5 GB -> 1.4 GB（英/中/日，features 与 lang_jsonb）
--    1.4 GB = provider 上限 1.5 GB 减 100 MB 余量，与 config/compress.ts 里
--    的 PROVIDER_MAX_FILE_SIZE 一致。API 会按这个值拦截，文案必须一致。
-- ---------------------------------------------------------------------------
UPDATE pricing_plans
   SET features = replace(
         replace(
           replace(features::text, 'Up to 5 GB per file', 'Up to 1.4 GB per file'),
           '单文件最大 5 GB', '单文件最大 1.4 GB'),
         '1 ファイル 5 GB まで', '1 ファイル 1.4 GB まで')::jsonb
 WHERE features::text LIKE '%5 GB%';

UPDATE pricing_plans
   SET lang_jsonb = replace(
         replace(
           replace(lang_jsonb::text, 'Up to 5 GB per file', 'Up to 1.4 GB per file'),
           '单文件最大 5 GB', '单文件最大 1.4 GB'),
         '1 ファイル 5 GB まで', '1 ファイル 1.4 GB まで')::jsonb
 WHERE lang_jsonb::text LIKE '%5 GB%';

COMMIT;

-- ===========================================================================
-- 验证：应看到 3 个新字段；Max 全部 is_active=f；Pro/500 credits 显示 1.4 GB
-- ===========================================================================
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'compression_jobs'
   AND column_name LIKE 'provider%'
 ORDER BY 1;

SELECT card_title, group_slug, environment, price, is_active,
       (SELECT string_agg(f->>'description', ' | ')
          FROM jsonb_array_elements(features) f
         WHERE f->>'description' ILIKE '%GB%') AS size_copy
  FROM pricing_plans
 ORDER BY environment DESC, group_slug, display_order;
