# SEO 配图方案

配套：`docs/seo-strategy.md`（内容策略）、`scripts/seo-images.mjs`（生成器）、`content/seo-images/manifest.json`（清单）。

---

## 一、先分类：图片不是一类，是五类

我们的差异化定位是「**有实测数字的视频压缩权威站**」。
这个定位决定了：**大部分位置的图不能是 AI 编的**——一旦编，护城河自己填了。

| # | 图位 | 出现在 | 该用什么 | 为什么不用 gpt-image-2 |
| --- | --- | --- | --- | --- |
| 1 | **OG / 社交卡片** 1200×630 | 每一个页面 | `next/og` `ImageResponse`（**已建好**） | 卡片主体是标题文字，图像模型渲染文字仍不可靠；而且这是每页一张，动态生成免费且永远对版 |
| 2 | **数据图表** | 博客 + 工具页 | 真实数据 → SVG / `ImageResponse` 渲染 | **这是护城河本身**。竞品全站零原创数据，我们编一个数字就跟他们一样了 |
| 3 | **产品 UI 截图** | 工具页、how-to 步骤 | Playwright 真实截图 | 假 UI 用户一眼看穿，跳出率直接掉；Google 也在用图文一致性做质量信号 |
| 4 | **压缩前后对比帧** | 首页、格式页、编码页 | 真跑一遍 ffmpeg，抽同一帧 | 同上。「看不出差别」这件事必须是真的 |
| 5 | **章节插画 / hero 插画** | 博客、落地页 | ✅ **gpt-image-2** | 这里 AI 无可替代：纯装饰、要求风格统一、量大、外包画师成本 100 倍 |

**结论：gpt-image-2 负责第 5 类，顺带给第 1 类做背景纹理。其余三类走真实数据。**

顺带说一句：AI 装饰图对排名的直接贡献接近 0。它的作用是**降低跳出率、提升可读性、
让 2400 词的长文不像一堵墙**——这些才是间接的排名收益。所以不要在这上面追求"精美"，
追求**统一**。

---

## 二、第 5 类：批量生成管线

### 2.1 已经建好的部分

```
content/seo-images/manifest.json   风格合约 + 图片清单（当前 6 张）
content/seo-images/lock.json       生成结果（url / alt / 尺寸 / 哈希），自动写入
scripts/seo-images.mjs             生成器
public/images/seo/                 本地副本
cdn.vidsmaller.com/seo/{group}/    R2 上的正式地址
```

```bash
node scripts/seo-images.mjs --dry-run     # 只算账，不花钱
node scripts/seo-images.mjs               # 生成缺失的
node scripts/seo-images.mjs --only blog   # 按 group 或 id 过滤
node scripts/seo-images.mjs --force       # 忽略缓存重来
node scripts/seo-images.mjs --local       # 不传 R2，只写本地
```

当前 6 张，中等质量 1536×1024，**估算 $0.25**。全量 24 篇博客 × 3 张 ≈ 72 张 ≈ **$3**。

**成本根本不是问题，一致性才是问题。**

### 2.2 一致性怎么保证：风格合约

批量 AI 配图最常见的翻车方式是——每张单独想 prompt，出来 72 张 72 个画风，
站点看起来像素材拼贴。解决办法是把风格锁死在一个字符串里，每次拼在主体描述**前面**：

```
manifest.styleContract  ← 调色板/构图/禁止项，全站唯一，改一次全站重生成
        +
spec.prompt             ← 只描述"画什么"，一句话
```

当前合约锁定的东西：

- **调色板**：`#1E1B4B` 深靛 / `#7C3AED` 电紫 / `#06B6D4` 青 / `#FAFAF9` 暖白，
  外加 `#F97316` 信号橙——**只给全图最重要的那一个元素用**
- 扁平矢量 + 轻噪点，等轴测或正视，不用戏剧性角度
- **禁止**：文字、字母、数字、UI 元素、logo、水印、人脸
- **构图**：左侧三分之一留空，方便叠标题

最后一条很实用：同一张图既能当博客 hero，也能裁成 OG 卡片背景，标题叠上去不糊。

### 2.3 幂等设计

`sha256(styleContract + prompt + size + quality + format)` 前 16 位进 lockfile，
也进文件名：

```
compress-video-for-discord-hero-a3f2c891e04b7d16.webp
```

- prompt 没改 → 跳过，不重复扣费
- prompt 改了 → 哈希变 → **文件名变 → URL 变 → CDN 缓存自动失效**

所以 R2 上直接挂 `max-age=31536000, immutable`，不用管缓存刷新。

---

## 三、图片本身的 SEO 细节（这部分才真的影响排名）

这几条比"图好不好看"重要得多，而且竞品都做了：

| 项 | 做法 | 现状 |
| --- | --- | --- |
| **文件名 = 关键词** | `compress-video-for-discord-hero.webp`，不是 `img_001.webp` | 生成器已按 slug 命名 ✅ |
| **alt 逐张手写** | 描述画面 + 自然带词，**不堆词**。alt 写在 manifest 里，跟图绑在一起 | manifest 已有 `alt` 字段 ✅ |
| **宽高必须显式声明** | 防 CLS，直接影响 Core Web Vitals | lock.json 已存 `width`/`height`，渲染时读 ✅ |
| **WebP / AVIF** | 输出直接是 WebP | ✅ |
| **sitemap 带 `<image:image>`** | **竞品每页都带，我们一条都没有** | ❌ 待做 |
| **同域名托管** | `cdn.vidsmaller.com` 是自有子域，Google 图片搜索认 | ✅ |
| **图片附近有相关正文** | Google 主要靠图周围的文字理解图 | 写作模板里约束 |

**唯一的缺口是 sitemap 的 `<image:image>`。** `app/sitemap.ts` 里补上，
数据源就是 `lock.json` 的 `usedBy` 字段——它已经记录了每张图被哪些页面用。

---

## 四、第 1-4 类怎么做（待建）

### 第 1 类 · OG 卡片

`blog/[slug]/opengraph-image.tsx` 和 `glossary/[slug]/opengraph-image.tsx` **已经在跑**，
但目前是白底 + logo + 标题，很素。改造两点：

1. 背景换成 manifest 里对应的插画（低透明度）
2. 工具页（Tier 1 那 24 个）目前**没有** `opengraph-image.tsx`，要补

### 第 2 类 · 数据图表 ← 最高优先级 ✅ 管线已建

**已做**（`components/charts/`，服务端 inline SVG，零 client JS）：

| 图 | 落地 | 数据性质 |
| --- | --- | --- |
| `BilledMinutesChart` 实测秒数 vs 计费分钟 | `/pricing` | **实测**，3 个真任务，带 jobId |
| `BudgetMatrix` 时长 × 分辨率 | 8 个平台页 | **纯算术**，图上写明 not measured |

数据层是 `lib/seo/benchmark.ts`，逐字段誊写自 `scripts/fc-benchmark-results.jsonl`，
`pnpm check:benchmark` 常驻校验防漂移。

inline SVG 而不是 `<img>`：数字以 `<text>` 节点留在 DOM 里，爬虫和答案引擎读得到。
这才是当初费劲去测的意义。

#### ⚠️ 撤回：本文档 v1 提的另外两张图做不出来

| v1 提的图 | 为什么做不了 | 补齐需要什么 |
| --- | --- | --- |
| CRF → 体积 / SSIM 双轴曲线 | 三次实测**全部用 `percentage:50` 模式**，没跑过 CRF sweep；**SSIM / PSNR / VMAF 一个都没测** | 跑一轮 CRF 18/20/23/26/28/32 × 3 种素材（实拍 / 录屏 / 动画），每档记录输出体积 + VMAF |
| 9 个在线压缩器输出体积对比 | **从没测过任何竞品** | 同一个源文件手动跑 VEED / Clideo / FreeConvert / Kapwing 等，记录输出体积、耗时、有无水印 |

编这两张图等于把「有实测数字」这个定位自己填了，**比不做更糟**。

这两轮测量做完，能同时喂：榜单文章（第 3 篇）、benchmark 文章（第 4 篇）、
CRF 原理文（第 6 篇）、编码器对比文（第 7 篇）——即 Tier 2 里最值钱的四篇。
所以它是下一步该做的事，不是图表管线的遗留问题。

#### 这份实测数据还**不包含**什么

写在 `lib/seo/benchmark.ts` 文件头，避免下一个人在上面盖一张它撑不起的图：
没有 CRF sweep、没有任何画质指标、没有竞品数据。样本量 N=3。

### 第 3 类 · UI 截图

Playwright 目前没装。加 devDependency，写 `scripts/seo-screenshots.mjs`：
跑本地站 → 固定视口 → 截关键步骤 → 存 R2。好处是产品 UI 一改，重跑一遍就全同步了。

### 第 4 类 · 压缩前后对比帧

真跑一遍：源文件 → 各档压缩 → ffmpeg 同帧抽取 → 并排拼图。
放在首页和格式页，配上真实的体积数字。这张图是转化率杀手，也是最能证明
「我们真的测过」的一张。

---

## 五、执行顺序

```
1. 补 OPENAI_API_KEY 到 .env.local，跑 seo-images.mjs 出 6 张，肉眼验风格
2. 风格满意后，扩 manifest 到 24 篇博客的量（每篇 hero + 2 张章节图）
3. app/sitemap.ts 补 <image:image>（读 lock.json）
4. 建第 2 类数据图管线 ← 这个比第 5 类重要，别被"AI 生图"带偏优先级
5. 补工具页的 opengraph-image.tsx
6. 装 Playwright，做第 3、4 类
```

第 4 步才是真正拉开差距的地方。第 5 类（AI 插画）只是让长文不难看，
**它不会让我们赢，但缺了它内容会显得廉价。**
