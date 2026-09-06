# FreeConvert 成本实测报告

测试日期：2026-09-06
脚本：`scripts/fc-benchmark.mjs` · 原始数据：`scripts/fc-benchmark-results.jsonl` · 模型：`scripts/fc-cost-model.mjs`

> **v2 更正（同日）**：v1 把计费规则搞错了，成本低估 3–18 倍。
> 真实规则是**每个 task 各自向上取整、最低 1 分钟**，不是 compress 任务的原始墙钟时间。
> 用账号面板反推验证：3 个 benchmark 任务，v2 模型算 12 分钟，面板实际扣 11 分钟（±10%）；
> v1 算出来只有 2.06 分钟。

## 1. 两个互相独立的配额

免费档同时有两个限制，任一耗尽就发不出任务：

| 配额 | 免费档 | 付费档 |
|---|---|---|
| Conversion minutes | 20 / 天 | 按套餐（Basic 1500/月） |
| **Operations** | **约 10 / 天** | **Unlimited** |

我们的 job 有 3 个 task = **3 个 operations**，所以免费档实际只能跑 **3 个任务/天**。
面板会出现「还剩 9 分钟但 0 operations」的状态，此时任何任务都会被 402 拒绝：

```
HTTP 402 {"errorCode":"daily_operations_limit_exceeds"}
```

**不买套餐就没法上线**，这跟有没有订单无关。

## 2. 计费规则（v2，已验证）

```
job_minutes = Σ over tasks: max(1, ceil(task_seconds / 60))
```

实测明细：

| job | task | 秒 | 计费 |
|---|---|---|---|
| 1080p 1min | import | 15.6 | 1 |
| | compress | 13.2 | 1 |
| | export | **0.7** | **1** |
| 1080p 10min | import | **127.8** | **3** |
| | compress | 77.5 | 2 |
| | export | 0.4 | 1 |

两个要命的含义：

1. **每个任务保底 3 分钟**（3 个 task 各 1 分钟保底）。压一个 5 秒的片段和压一个 1 分钟的视频，成本一模一样。
2. **import 计的是「用户上传耗时」**，取决于用户上行带宽，不在我们控制内。同一个 600MB 文件：
   上行 1 MB/s → import 10 分钟；上行 10 MB/s → import 1 分钟。**慢网用户贵 10 倍。**

## 3. compress 速度（v1 这部分测得是对的）

拟合：`compress_seconds ≈ 6.1 + 0.1191 × source_seconds`（1080p, libx264, medium）

- 服务器 8.4x 实时
- libx265 慢 **3.77x**
- 4K 慢 **3.85x**（本地同编码器同参数标定）

这个模型只用来预测 compress **那一个 task** 的秒数，最后仍要过一次 `max(1, ceil(/60))`。

## 4. 真实单任务成本

| 场景 | v1 估算 | import | compress | export | **真实** | 低估倍数 |
|---|---|---|---|---|---|---|
| 匿名 200MB / 3.3min | 0.49 | 1 | 1 | 1 | **3** | 6.1x |
| 免费典型 300MB / 7min | 0.94 | 2 | 1 | 1 | **4** | 4.3x |
| 免费满载 1GB / 23min | 2.84 | 4 | 3 | 1 | **8** | 2.8x |
| Pro 典型 600MB / 10min | 1.29 | 3 | 2 | 1 | **6** | 4.6x |
| Pro 4K 900MB / 5min | 2.39 | 4 | 3 | 1 | **8** | 3.3x |
| 小片段 20MB / 30s | 0.16 | 1 | 1 | 1 | **3** | **18.6x** |

## 5. 定价风险：小片段会亏钱

VidSmaller 现在 `1 credit = 1 源视频分钟`，`MIN_CREDITS_PER_JOB = 1`。
Pro 档 $9 / 600 credits，100% 烧完时：

| 用量形态 | 任务数 | FC 分钟 | 成本 | 毛利 |
|---|---|---|---|---|
| 10 分钟一个 | 60 | 360 | $2.70 | 70% |
| 3 分钟一个 | 200 | 600 | $4.50 | 50% |
| **1 分钟一个** | **600** | **1800** | **$13.50** | **−50%** ⚠️ |
| 4K 10 分钟一个 | 60 | 780 | $5.85 | 35% |

**批量压短视频的用户会让你倒贴。** 这不是极端场景，是社交媒体创作者的标准用法。

修法：`MIN_CREDITS_PER_JOB` 从 1 提到 **5**，让最低收费对齐最低成本。
提到 5 之后，最坏情况变成 120 个任务 × 3 分钟 = 360 FC 分钟 = $2.70，毛利回到 70%。

## 6. 容量：远比 v1 说的紧

免费池按套餐的 50% 算：

| 套餐 | 日额度 | 免费池 | 匿名 200MB | 典型 300MB | 满载 1GB |
|---|---|---|---|---|---|
| Basic | 50 | 25 | 8 次/天 | **6 次/天** | 3 次/天 |
| Pro | 133 | 67 | 22 次/天 | 16 次/天 | 8 次/天 |

（v1 声称 Basic 能撑 54 次/天，错的。）

## 7. 优化：R2 中转（已上线，实测验证）

| 方案 | import | compress | export | 合计 | 降幅 |
|---|---|---|---|---|---|
| 原状：浏览器直传 | 3 | 2 | 1 | 6 | – |
| **② R2 中转（已上线）** | **1** | **2** | **1** | **4** | **33%** |
| ① 去掉 export task（未做） | 3 | 2 | 0 | 5 | 17% |
| ①+② | 1 | 2 | 0 | 3 | 50% |

### ② R2 中转 —— 已上线

用户传到 R2（不计 FreeConvert 的费），provider 从 R2 服务器间拉取。实测 593 MB 文件：

```
import/url  18.3s (32 MB/s) -> 1 分钟    ← 浏览器直传是 127.8s -> 3 分钟
compress    81.3s           -> 2 分钟
export       1.6s           -> 1 分钟
                        合计   4 分钟    (原 6 分钟)
```

**踩过的坑：presigned URL 不能用。** AWS SDK 会在签名里带上 `x-id` 和
`x-amz-checksum-mode` 两个非标准查询参数，**少任何一个参数签名就失效**，而
FreeConvert 的 HTTP 客户端会归一化 URL 把它们丢掉 → 一律 403
`SignatureDoesNotMatch`。改用 R2 自定义域 `cdn.vidsmaller.com` 直链解决：没有
签名可破、走 Cloudflare 边缘（拉取更快）、egress 免费。

保密性靠 key 不可猜（`buildStagingKey` 用 v4 UUID，122 bit）+ 任务终态后立即
删除。**建议在 R2 加一条生命周期规则，`compress-input/` 一天后过期**，兜住那些
永远跑不完的任务。

额外收益：旧的兜底流程是「建 job → 直传失败 → 再建一个 job」，白烧一遍
operations，改默认后消失。

### ① 去掉 export task —— 暂不做（经济账不划算，不是技术门槛）

技术上完全可行，已验证：compress task 的 result 本来就带 `url`，下载内容与
export 的 **md5 完全一致**，有效期也一样。

阻碍只有一个：**文件名**。compress 的 URL 尾巴是 UUID，下载路由是 302 跳转，
浏览器按 URL 存名 → 用户拿到 `39c54aa3-88ab-....mp4`。已排除的方法：

- FreeConvert 下载服务器只返回 `content-disposition: attachment`（不带 filename）
- 不认 `?filename=` / `?response-content-disposition=` 等任何查询参数
- compress task 忽略 `filename` 字段
- `import/url` 的 `filename` 也不会被 compress 输出继承

**可行的四条路**（都不需要迁移到 Cloudflare）：

| 方案 | 新基建 | 代价 |
|---|---|---|
| 客户端 blob 重命名 | 无 | 整个文件进内存 |
| Next.js 路由代理（`COMPRESS_PROXY_DOWNLOADS=true`，代码已有） | 无 | Vercel 60s 上限 + 出网带宽费 |
| File System Access API | 无 | 仅 Chrome/Edge |
| Cloudflare Worker 代理 | 有 | 要写要部署 |

最省事的是第一条 —— 实测 FreeConvert 下载服务器返回
`access-control-allow-origin: *`，浏览器可以跨域 fetch 后自己改名，后端一行不用改：

```js
const res = await fetch(`/api/compress/jobs/${id}/download`); // 自动跟 302
const blob = await res.blob();
// a.download = 'demo-compressed.mp4'
```

配合 `job.outputSize` 按大小分流（小文件走 blob，大文件退回 302）即可。

**为什么现在不做**：省 1 分钟/任务，典型任务 4 → 3，Basic 的容量从 375 → 500
个任务/月（+33%），折钱只有 $3–4/月。而真到了逼近 375 个任务/月那天，
**升级 FC Pro（$29.99）4000 分钟 = +167% 容量，还送 5GB 上限 + GPU 编码，
只需改一个单词** —— 几乎肯定比动下载体验划算。

所以这条优化很可能永远不需要做。只有规模大到 FC Pro 也不够、且带宽成本开始
成为主要支出时，才轮到它。

## 8. 已上线的修复清单

| 改动 | 位置 | 效果 |
|---|---|---|
| `MIN_CREDITS_PER_JOB` 1 → 3 | `config/compress.ts` | 小片段场景毛利 −73% → **+42%** |
| R2 中转改默认 | `useCompressor.ts` + `staging.ts` | 典型任务 6 → **4 分钟** |
| 预算闸改用真实计费规则 | `config/compress.ts` | 原先少算 3–18 倍，等于没保护 |
| 计费分钟落库 | `provider_billed_minutes` | 看板不再少报 |
| provider 配额 402 单独识别 | `jobs/route.ts` | 不再误导用户「换个预设」 |

预估器已与实测对齐：59 MB/1min 估 3 实测 3；593 MB/10min 估 4 实测 4。

## 8. 复现

```bash
node scripts/e2e-compress.mjs <video.mp4>   # 端到端跑一次，输出真实计费明细
node scripts/fc-benchmark.mjs <video.mp4>   # 只测 provider 层
node scripts/fc-cost-model.mjs              # 成本模型
node scripts/fc-usage.mjs                   # 线上用量 + 升级信号
node scripts/r2-staging-check.mjs [--clean] # 暂存区堆积 / 生命周期规则体检
```

## 10. R2 暂存区治理

Cloudflare 上已配置生命周期规则（R2 → vidsmaller → 设置 → 对象生命周期规则）：

| 规则名 | 前缀 | 操作 |
|---|---|---|
| `expire-compress-input` | `compress-input/` | 1 天后删除对象 |

任务进终态时 `syncJob` 会主动删除暂存对象，但有漏网路径：用户关页面、上传中断、
或任务在创建前就失败。实测时就抓到过 2 个 60MB 的孤儿文件。规则是兵底。

注意：现有的 `R2_ACCESS_KEY_ID` 是 Object Read & Write 范围，**改不了桶级配置**
（`GetBucketLifecycleConfiguration` 直接 AccessDenied）。要用代码管理生命周期规则，
需要另建一个 Admin 范围的 R2 token 或 Cloudflare API token。

生成测试素材：

```bash
ffmpeg -f lavfi -i "testsrc2=size=1920x1080:rate=30:duration=600" \
       -f lavfi -i "sine=frequency=440:duration=600" \
       -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -c:a aac -b:a 128k \
       -movflags +faststart s_1080p_600s.mp4
```
