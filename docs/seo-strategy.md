# SEO 策略：videocompress.ai 拆解 + VidSmaller 打法

> **进度**：Tier 0 已完成。Tier 1 A 组（8 个平台限制页）已完成。
> 页面数 12 → 42。详见文末「已完成」。

调研时间：抓取 videocompress.ai 生产站点（sitemap / 首页 / 3 篇博客 / 1 个工具页）+ vidsmaller.com 线上现状对比。

---

## 一、竞品拆解：videocompress.ai

### 1.1 站点规模

`sitemap_index.xml` → 25 个语言站点，每个 34 条 URL，**约 850 个索引页**。

英文站 34 条 URL 的构成：

| 类型 | 数量 | URL |
| --- | --- | --- |
| 首页（主词） | 1 | `/` |
| **工具页（每页一个头部词）** | **10** | `/image-compressor` `/pdf-compressor` `/video-cutter` `/crop-video` `/audio-cutter` `/video-to-mp3` `/video-to-text-converter` `/video-translator` `/pdf-translator` `/image-translator` |
| 博客 | 1+12 | `/blog` + 12 篇 |
| 商业页 | 3 | `/pricing` `/desktop-app` `/mac-download-installation-guide` |
| 法务/功能页 | 7 | privacy / terms / subscription-policies / login 类 |

**核心结论：他们不是在做长尾 pSEO，是「一个头部词 = 一个落地页 × 25 语言」。**
选 11 个胖词，每个配一个 1200 词落地页，再用 hreflang 矩阵放大 25 倍。

注意选词逻辑：10 个工具页没有一个是随机的，全部是**「文件太大 / 文件格式不对」这条痛点线上的邻居**，
后端可以复用同一套转码服务，前端可以复用同一个上传组件，用户还是同一批人。
他们做的不是「视频压缩器」，是**文件工具聚合站**。

### 1.2 工具页模板（10 个页面一模一样）

以 `/video-to-mp3` 为例：

```
title:       Video to MP3 Converter - Free Online Video to MP3 Tool     (58 字符)
description: Convert video to MP3 and download high-quality audio instantly.
             Free online video to MP3 converter with no account or software required.
keywords:    video to mp3 converter, convert video to mp3, mp4 to mp3,
             extract audio from video, online video to mp3          ← 还在用 keywords 标签
H1:          Video to MP3 Converter                                  ← 纯关键词，无修饰
正文:         ~1241 词
```

H2 永远是这 5 块，顺序都不变：

1. `How to convert video to MP3 online?` — 3 步走，吃 "how to" 意图
2. `Why Choose Our Tool to convert video to MP3?` — 功能点
3. `Convert Video to MP3 and Get the Audio You Need` — 收益
4. `Why People Rely on Our Video to MP3 Tool?` — 社会证明
5. `Video to MP3 FAQs` — 8~9 条问答

首页同一套骨架，多了一个 **"Trusted by" logo 墙**——放的是 YouTube / Instagram / Google /
Netflix / Canva / Dropbox。这些不是客户，是**上传目的地**，用视觉暗示"哪都能传"，
同时白嫖品牌词的语义关联。挺聪明。

首页的 H3 里藏着长尾：`Compress Video for Email`、`Compress Video for Discord`、
`Save Storage Space` —— **他们把这些长尾当段落，没做成页面。这是我们的口子。**

### 1.3 结构化数据

每个页面都注入：

```
WebSite · Organization · WebPage · Brand · ContactPoint
SoftwareApplication + Offer + AggregateRating     ← 这一组是拿 SERP 星星的
ImageObject
```

sitemap 里每条 URL 还带 `<image:image>`（首页带了 7 张）。
hreflang：每页 27 条 `xhtml:link`（25 语言 + x-default + zh 别名），全站 325 条。

### 1.4 博客打法：只有 3 种模板，一篇都没跑偏

12 篇文章：

| 模板 | 篇数 | 例子 | 吃的意图 |
| --- | --- | --- | --- |
| **`N Best {品类} in {年份}`** | **7** | 9 Best Online Video Compressors in 2026 | 商业调研，转化率最高 |
| **`How to {任务} Without Losing Quality`** | **4** | How to Reduce MP4 File Size Without Losing Quality in 2026 | 信息型，量大 |
| **`{竞品} Review: Best {X} Alternative`** | **1** | TinyJPG Review: Best Free Image Compressor Alternative | 蹭品牌词 |

每篇的解剖结构（三篇抓下来完全一致）：

```
2,300 – 2,600 词
H2:  Introduction
     Quick Takeaways              ← AI Overview / 精选摘要 诱饵
     Evaluation Standards ...
     Detailed Reviews  (H3 = 每个工具一个)
     How to Choose ...
     FAQ                          ← H3 全写成完整疑问句
     Final Thoughts
H3 带 emoji:  📉 Compression Performance / ⚙️ Features & Workflow / 🌍 Accessibility & Pricing
```

几个值得抄的细节：

- **自己排第一**。"9 Best Online Video Compressors" 里 `1. VideoCompress`，2-9 名是
  VEED / FreeConvert / Clideo / Kapwing / Media.io / Riverside / FlexClip / Vimeo。
  连自己的上游供应商 FreeConvert 都列进去了，显得客观。
- **H3 带 emoji**。SERP 里视觉抓眼，同时给 LLM 提供清晰的 chunk 边界，好被引用。
- **FAQ 的 H3 写成完整问句**，直接吃 FAQ 富媒体 + 被 AI 问答引用。
- **每篇博客都链向全部 10 个工具页**（导航+页脚），每篇文章都在给钱页导权重。
- **不显示发布日期**。全站抓不到一个 `2026-01-01` 格式的日期。
  → 没有内容衰减信号，明年把标题里的 2026 改成 2027 就行，成本为 0。

### 1.5 他们的弱点 = 我们的入口

| # | 弱点 | 我们怎么打 |
| --- | --- | --- |
| 1 | 无日期、无作者、无实测 → E-E-A-T 弱 | 每篇挂实测数据 + 方法论 + 可复现步骤 |
| 2 | **零原创数据**，全是功能表格和主观描述 | 我们有 FreeConvert 计费实测（593MB 文件，import/compress/export 分段耗时），这是护城河 |
| 3 | 博客之间**没有正文互链**，话题簇只靠导航 | 做真正的 hub-and-spoke 内链 |
| 4 | 25 语言机翻同一批内容，薄内容风险高 | 只做 10 个真有量的语种，但每个都本地化（文件大小限制各地不同） |
| 5 | 摊得太开（PDF / 图片 / 翻译），**视频压缩的主题权威被稀释** | 我们往深里挖：按格式、按编码、按平台、按目标体积 |
| 6 | **没有 vs 页、没有格式页、没有平台限制页** | 这三类全部拿下 |
| 7 | `AggregateRating` 无真实评论支撑 | 用真实数据（压缩比分布）替代假评分 |

---

## 二、VidSmaller 现状体检（不留情面）

线上抓取结果：

```
sitemap 总 URL 数        12      （竞品 850）
真实内容页               1       （首页，770 词；竞品首页 ~2000 词 + 10 个工具页）
博客文章                 0       （blogs/ 下 3 个 demo.mdx，一篇没发）
词汇表条目               0       （/glossary 页面建好了，空的）
JSON-LD                  0       （竞品 8 类 schema）
工具页                   0
/pricing 独立 URL        无      （只是首页 #pricing 锚点，无法排名、无法被外链）
语言                     3       （en/zh/ja，竞品 25）
sitemap hreflang         无      （Next 的 alternates.languages 没用上）
/about                   未进 sitemap
```

最致命的三条：

1. **H1 = `Make any video smaller — without making it look worse`**
   文案很好，**关键词是零**。竞品 H1 是干巴巴的 `Free Online Video Compressor`。
   Google 不为文采付费。
2. **title 品牌开头**：`VidSmaller - Compress video online...`。
   VidSmaller 这个词全网 0 搜索量，前 11 个字符全浪费。
3. **整站就一个页面**。竞品用 11 个页面接 11 个词，我们用 1 个页面接 1 个词，
   而且是最难的那个词。这是结构性劣势，不是文案能补的。

---

## 三、打法：抄结构，但走差异化

### 差异化定位一句话

> **他们是没有数据的通用文件工具站。我们是有实测数字的视频压缩权威站。**

三个差异化支点：

**① 实测，不吹。**
每一个数字都能复现。竞品说 "compress up to 90%"，我们说
「1080p 60fps 屏幕录制，H.264 CRF 23 → 平均缩到 18.4%，样本 N=200，方法见附录」。
这既是 E-E-A-T，也正好是 LLM 最爱引用的那种内容。

**② 目的地优先的信息架构。**
竞品把 "Compress Video for Discord" 写成一个 H3。我们做成一个**页面**：
真实上限（免费 10MB / Nitro 50MB / Boost 100MB）、真实换算公式、一键预设按钮。
长尾、有购买意图、几乎无竞争，而且 CTA 是「现在就压到 9.8 MB」——转化率碾压泛压缩页。

**③ 往深不往宽。**
他们横向扩到 PDF/图片/翻译。我们纵向挖视频：格式 × 编码 × 平台 × 目标体积。
一个主题的权威度，永远打得过六个主题的浅覆盖。

---

## 四、执行清单

### Tier 0 — 技术地基（1 天，必须先做）

| # | 动作 | 文件 |
| --- | --- | --- |
| 0.1 | **首页 H1 加词**：`Free Online Video Compressor`（H1）+ 现有文案降级为副标题 | `i18n/messages/*/Landing.json` |
| 0.2 | **title 关键词前置**：`Free Online Video Compressor — Compress MP4 Without Losing Quality \| VidSmaller` | `app/[locale]/(basic-layout)/page.tsx` 加 `generateMetadata` |
| 0.3 | **注入 JSON-LD**：`WebSite` + `Organization` + `SoftwareApplication`(+`Offer`) + `FAQPage`（现成 8 条 FAQ 直接喂） + `BreadcrumbList` | 新建 `components/seo/JsonLd.tsx` |
| 0.4 | **/pricing 独立成页**，首页锚点保留但加 canonical 指向 | 新建 `app/[locale]/(basic-layout)/pricing/page.tsx` |
| 0.5 | **sitemap 补 hreflang**：用 `alternates: { languages: {...} }` | `app/sitemap.ts` |
| 0.6 | **sitemap 补 /about、/pricing**；把假的 `changeFrequency: 'daily'` 改成真实值 | `app/sitemap.ts:41` `staticPages` 数组现在只有 `['']` |
| 0.7 | 首页正文从 770 词扩到 1600+ 词（补 "How to compress a video in 3 steps" 区块） | `components/home/` |

### Tier 1 — 钱页（4 周，约 24 个页面）

复用同一个 `[tool]` 动态路由 + 配置驱动，一次开发多页复用。

**A 组 · 平台限制页**（意图最强、竞争最弱） ✅ **已完成**

```
/compress-video-for-discord      Free 20MB（2026-08 从 10MB 上调）/ Nitro Basic 50MB / Nitro 500MB
/compress-video-for-email        Gmail 标称 25MB → 实际 ~18MB（base64 膨胀 37%）/ Outlook 20MB / Exchange 10MB
/compress-video-for-whatsapp     聊天内 16MB / Web 64MB / 文档 2GB
/compress-video-for-telegram     2GB / Premium 4GB / Bot API 仅 50MB
/compress-video-for-slack        全套餐 1GB，但免费版 90 天可见期才是真限制
/compress-video-for-instagram    4GB，但 IG 会重编码——真正的约束是喂给它什么
/compress-video-for-tiktok       安卓 72MB / iOS 288MB / 网页 10GB
/compress-video-for-twitter      512MB + 2:20，时长先到顶
```

数据源：`config/platforms.ts`，每个平台带 `verifiedAt` + `sources`。
发现竞品和全网大量教程都还在写 Discord 10MB——2026 年 8 月已改成 20MB。

每页模板（抄竞品 5 块骨架，第 2 块换成我们的差异化）：

```
H1   Compress Video for Discord
H2   Discord's real file size limits in 2026        ← 表格：免费/Nitro Basic/Nitro/Boost 等级
H2   What 10 MB actually buys you                   ← 我们的实测表：时长 × 分辨率 → 可行码率
H2   How to compress a video for Discord (3 steps)
H2   Discord compression FAQs                       ← FAQPage schema
```

「What X MB actually buys you」这一块竞品做不出来，因为他们没测过。
这是抢精选摘要和 AI 引用的关键块。

**B 组 · 目标体积页**（用户真的这么搜）

```
/compress-video-to-25mb   /compress-video-to-10mb   /compress-video-to-50mb
/compress-video-to-100mb  /compress-video-to-8mb    /compress-1gb-video
```

**C 组 · 格式 / 编码页**

```
/compress-mp4  /compress-mov  /compress-mkv  /compress-avi  /compress-webm
/hevc-to-h264  /h265-video-compressor  /compress-4k-video
```

**D 组 · 对比 / 替代页**（直接蹭竞品品牌词）

```
/vs/handbrake        （HandBrake 搜索量巨大，且是桌面端，我们是云端，差异天然）
/vs/veed
/vs/clideo
/vs/freeconvert
/alternatives/videocompress-ai      ← 直接打竞品
```

对比页必须有一张**实测对比表**（同一个源文件跑两边，列出输出体积/SSIM/耗时），
否则就是竞品那种没营养的功能勾选表。

### Tier 2 — 博客（每周 2 篇，先排 12 篇）

抄他们的 3 个模板，再加我们独有的 2 个：

| 模板 | 竞品有 | 我们 |
| --- | --- | --- |
| `N Best ... in 2026` | ✅ | ✅ 抄，但每个工具跑同一个测试文件出真实数据 |
| `How to ... Without Losing Quality` | ✅ | ✅ 抄 |
| `{竞品} Review / Alternative` | ✅ | ✅ 抄，直接写 videocompress.ai |
| **`Benchmark：我们测了 N 次`** | ❌ | ✅ **独有，外链和 AI 引用的来源** |
| **`编码原理 + 术语表`** | ❌ | ✅ **独有，喂已经建好但空着的 /glossary** |

**首批 12 篇（按优先级）**

| # | 标题 | 模板 | 落地页指向 |
| --- | --- | --- | --- |
| 1 | How to Compress a Video Without Losing Quality (2026) | How-to | 首页 |
| 2 | How to Compress a Video for Discord (10 MB, 50 MB, 100 MB) | How-to | A 组 |
| 3 | 9 Best Online Video Compressors in 2026 (We Tested All of Them) | 榜单+实测 | 首页 |
| 4 | **We Compressed the Same 593 MB File 40 Ways — Here's the Data** | **Benchmark** | 全站 |
| 5 | How to Email a Video That's Too Big for Gmail | How-to | A 组 |
| 6 | CRF Explained: What Number Should You Actually Use? | 原理 | /glossary |
| 7 | H.264 vs H.265 vs AV1: Real File Sizes, Real Compatibility | 原理+实测 | C 组 |
| 8 | videocompress.ai Review: Honest Look at the Free Tier | 竞品评测 | D 组 |
| 9 | HandBrake vs Online Compressors: When Is Local Actually Faster? | 对比 | /vs/handbrake |
| 10 | How to Compress 4K Video Without Turning It Into Mush | How-to | C 组 |
| 11 | 7 Best Free Video Compressors With No Watermark in 2026 | 榜单 | 首页 |
| 12 | Why Your Compressed Video Looks Worse on Instagram Than on Your Laptop | 原理 | A 组 |

**每篇的硬性要求**（写进 CMS 模板）：

- 2,000–2,600 词
- 开头 `Quick Takeaways` 项目符号块（精选摘要 / AI Overview 诱饵）
- H3 带 emoji
- FAQ 区，H3 写成完整问句，配 `FAQPage` schema
- **至少 3 条正文内链指向 Tier 1 钱页**（竞品没做，这是我们的增量）
- **至少 1 条内链指向另一篇博客**（构建话题簇）
- 至少 1 张原创数据表或截图
- **显示日期 + 作者**（跟竞品反着来，赌 E-E-A-T）
- `Article` + `BreadcrumbList` schema

**配图**见 `docs/seo-images.md`。要点：装饰插画用 gpt-image-2 批量生成（`pnpm seo:images`，
全站统一风格合约，72 张约 $3），但**数据图、UI 截图、压缩前后对比帧必须来自真实数据**——
那是差异化本身，编不得。

### Tier 3 — 多语言（Tier 1/2 跑完再动）

不追 25 个。翻译 0 内容 × 25 语言 = 0。
先把英文做实，再按「搜索量 × 变现能力 × 翻译风险」挑 10 个：

```
第一批（已有）:  en  zh  ja
第二批:          es  pt-BR  de  fr        ← 量大、CPM 高
第三批:          ko  id  vi               ← 量大、竞争小
```

关键：平台文件大小限制在不同地区不一样（比如 WhatsApp 在印度/巴西的使用场景完全不同），
**A 组页面必须本地化正文，不能纯机翻**——这正好是竞品 25 语言机翻的软肋。

---

## 五、体量对账

| | videocompress.ai | VidSmaller 现状 | VidSmaller 目标 |
| --- | --- | --- | --- |
| 英文索引页 | 34 | 5 | 1 + 24 工具 + 24 博客 + 30 词条 + 5 法务 = **84** |
| 语言 | 25 | 3 | 10 |
| 总页面 | ~850 | 12 | **~840** |
| 单页平均词数 | 1200（工具）/ 2400（博客） | 770 | 1500 / 2300 |
| 原创数据 | 0 | — | 每页都有 |
| JSON-LD 类型 | 8 | 0 | 6 |

**页面体量打平，但每页深度和数据密度是他们的 2-3 倍。**
在 2026 年的 AI 搜索环境下，可被引用的具体数字比页面数量更值钱。

---

## 六、执行顺序

```
第 1 周   Tier 0 全部（技术地基）+ 博客 #1 #2
第 2-3 周 A 组 8 个平台页 + 博客 #3 #4 #5 #6
第 4-5 周 B 组 6 个体积页 + C 组 8 个格式页 + 博客 #7-#10
第 6 周   D 组 5 个对比页 + 博客 #11 #12 + 30 条 glossary
第 7 周+  Tier 3 多语言铺开
```

先做 Tier 0，因为现在的站连「让 Google 理解我们是干什么的」这一步都没完成。
在 H1 没有关键词、全站 1 个内容页的状态下，写多少博客都是漏水的桶。

---

## 附：已完成（Tier 0 + Tier 1 A 组）

### 页面数

| | 起点 | 现在 |
| --- | --- | --- |
| sitemap URL | 12 | **42** |
| 平台工具页 | 0 | **8 × 3 语言 = 24** |
| 真实内容页 | 1 | **10**（首页 + /pricing + 8 工具页）|
| JSON-LD 类型 | 0 | **6**（Organization / WebSite / SoftwareApplication+Offer / HowTo / FAQPage / BreadcrumbList）|
| 首页词数 | 770 | 1,442 |
| /pricing | `#pricing` 锚点 | 独立页，658 词 + 5 条 FAQ |
| 工具页词数 | — | 每页 900–990 词（中日文 1,200–1,900 字）|

### 关键实现决策

**`config/platforms.ts` 是唯一数据源。**
8 个页面的差别只有数据。上限会变——Discord 2026-08 从 10MB 改成 20MB，全网硬编码 10 的静态页现在全错了。
所以限制值、推荐目标、核实日期、来源链接都在这一个文件里，
页面正文、码率表、JSON-LD、压缩器预设、footer 链接、sitemap 全部从它读。
顺手修掉了 `lib/compress/estimate.ts` 里已经过期的快捷预设（Discord 10 → 20，email 25 → 18）。

**「N MB 到底能装多少」是护城河，所以两列的认知地位必须分开。**
- 码率列 = 纯算术。给定体积和时长只有一个答案，是硬上限。
- 分辨率/结论列 = 判断。来自公开的 H.264 码率阶梯，整体下调约 1/3
  （对已压过一次的素材再编码，能承受的码率比编码母版低）。

正文里明说了哪一列是算术、哪一列是建议。把两者混在一起，
「我们有真实数据」就退化成跟别人一样的空话。刻意偏保守——
宁可说难听点，也不能告诉用户「没问题」结果画面糊了。

**没有抄的东西：`AggregateRating`。**
竞品挂了个无真实评论支撑的评分去骗 SERP 星星。那是人工处罚风险，
而且跟我们的定位正好相反。

**`/pricing` 的 FAQPage schema 是后加的。**
第一版加了 schema 但页面不渲染 FAQ——那是全站富媒体被撤销的典型死法。
先把 5 条可见 FAQ 写出来，才把 schema 加回去。

**CJK 排版：`lib/seo/cjk.ts`。**
`{platform} 视频压缩` 对 Discord 是对的（中英之间该有空格），
对「邮件」就成了 `邮件 视频压缩`。用一条规则解决：
两个 CJK 字符之间的空格不是空格。

### 还没做

- 博客 0 篇（Tier 2 的 12 篇清单在上面）
- glossary 0 条
- 数据图管线（`docs/seo-images.md` 第 2 类）— 优先级高于 AI 插画
- B 组目标体积页 / C 组格式页 / D 组对比页
- 工具页的 `opengraph-image.tsx`
- sitemap 的 `<image:image>`
