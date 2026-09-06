# videocompress.ai 是怎么计费的（实测反推，2026-09-06）

起因：一个 702 MB / 46 分钟的任务扣了用户 5 credit，FreeConvert 实际计费 10 分钟。
问题是「竞品有没有同样的偏差、他们怎么消化」。答案是：**有，而且是同一个上游；
他们的解法不是把偏差算准，而是从一开始就不让价格跟成本挂钩。**

## 1. 他们的价格只由输入决定

前端 probe 出视频的宽高/帧率/时长，打自己后端的 `POST /api/compress/estimate-credits`，
把 credits 显示在压缩按钮上。把这个端点扫了 5 个分辨率 × 13 个时长之后，公式是：

```
credits = ceil( 时长秒 × (fps / 30) × (W×H)/(1920×1080) / 300 × 编码系数 )
```

| 输入 | credits |
|---|---|
| 1080p30 每 300 秒 | 1（与他们定价页写的「5 分钟 1080p ≈ 1 credit」一致） |
| 720p | 1080p 的 0.44 倍 |
| 1440p / 4K | 1.8 倍 / 4 倍 |
| 480p | 0.2 倍 |
| 60fps / 120fps | 2 倍 / 4 倍 |
| libx265 | 2 倍 |

**文件大小完全不进公式**：同一个 46 分钟 720p，`file_size` 填 50 MB 和 3 GB，
返回都是 5 credits。压缩模式（`by_size` / `by_percentage` / `by_video_quality`）也不影响。

实测样本（他们 API 的真实返回）：

| 文件 | 他们 | 我们（结算后 = 实际计费） |
|---|---|---|
| 30s 720p | 1 | 3 |
| 3 min 1080p | 1 | 3 |
| 10 min 1080p 录屏 | 2 | 4 |
| 46 min 720p（本次事故那个） | 5 | 10 |
| 80 min 720p | 8 | 8 |
| 2 min 4K | 2 | 5 |

## 2. 他们跑在同一个上游，所以偏差一模一样

他们前端发出去的 payload：

```json
{ "video_codec": "libx264", "compress_video": "by_size",
  "source_import": { "operation": "import/google-drive", "fileId": "...", "gtoken": "...", "filename": "..." },
  "file_info": { "file_size": ..., "file_duration": ..., "width": ..., "height": ..., "fps": ... } }
```

`compress_video: "by_size"`、`operation: "import/google-drive"` 是 FreeConvert 的 API 词汇。
用我们自己的 key 验证过：FreeConvert 接受 `import/google-drive`（201），
随便编一个 operation 会 400 `operation ... is invalid`。

也就是说他们同样按 conversion minutes 被计费、同样撞机器差异（我们实测同一文件同一设置
16.5s–45s）、同样在 46 分钟那个文件上被计 10 分钟。**他们只是没有把这笔账摊到用户头上。**

旁证：他们的进度条也是纯前端造的（`/_nuxt/CbLtJgxl.js`）——

```
SOFT_CAP = 97, ASYMPTOTE = 82, CRAWL_RATE = 0.004, MAX_JITTER = 0.8
tau = min(90, 15 + 复杂度 × 0.5)，复杂度 = 0.25×大小分 + 0.75×时长分
progress(t) = 82 × (1 − e^(−t/tau)) + 0.004t + 抖动，单调，封顶 97
```

同样拿不到 provider 的百分比，同样按大小和时长画指数曲线，还加随机抖动装活。
我们的 `lib/compress/progress.ts` 是同一类解法，区别是时间常数来自实测、并且报 ETA。

## 3. 他们怎么消化这笔差

按 Basic 档 $9 / 750 credits = **$0.012 / credit**，而 FreeConvert basic 是 $0.0087 / 分钟：

- 46 分钟那个文件：收 5 credits（$0.060），烧 10 分钟（$0.087）→ **这单他们也亏**
- 5 分钟 1080p：收 1 credit（$0.012），三个 task 的地板就是 3 分钟（$0.026）→ **也亏**

所以他们的账只能靠三件事，全都是**聚合**层面的，不是逐单的：

1. **价格锚在输入上**，用户能预知、他们能预算；成本方差留在自己账上。
2. **breakage**：订阅制下大多数人用不完月度 credits（Pro 5000 credits ≈ 416 小时 1080p）。
3. **硬闸门代替精算**：单文件上限（免费 1 GB / 付费 10 GB）、月度 credit 上限、
   访客配额接口 `check-guest-quota`、付费才有 priority processing（队列即容量控制）。
   外加上游几乎肯定不是 list price。

## 4. 对我们的意义

我们现在是「1 credit = provider 实际计费 1 分钟，结算多退少补」——**成本正确性最强，
但用户价格不可预知**，而且普遍比他们贵 2–3 倍：小文件被三个 task 的 3 分钟地板拖着，
大文件被机器差异转嫁。

三条路：

| 方案 | 成本正确性 | 价格可预知 | 竞争力 |
|---|---|---|---|
| A 维持现状（按实际计费结算） | 最强 | 差 | 差 |
| B 改成输入定价（时长×像素×fps），provider 分钟只做内部成本指标 | 聚合可控 | 好 | 对齐 |
| C 折中：输入定价报价，结算对用户封顶（如 1.2×），超出我们吃 | 中 | 好 | 对齐 |

B 的前提是费率标定，而这件事现在有数据支撑了：每个任务的 `provider_billed_minutes`、
`provider_compress_seconds`、`duration_seconds`、`input_size` 都已落库，攒够样本就能算出
「每像素秒的真实成本」，再把毛利定在费率里，而不是逐单跟机器赌运气。
