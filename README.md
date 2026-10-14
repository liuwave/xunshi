# 寻诗 · 古诗词开放数据集

**744,571 首**古诗词的结构化 JSON 数据集：繁简双列正文、部分篇目有逐字平仄记录、另有 15,838 首附 AI 解说。
本站由 [寻诗](https://xunshi.oldmen.cn)（免登录公网古诗词全文检索站）维护，数据与站点同源。

## 数据规模

| 项 | 数量 |
|---|---|
| 作品 | 744,571 首 |
| 作者 | 39,188 位（**作者条目数**，含按「姓名+朝代」拆分的佚名类实体，不等于真实人物数） |
| 朝代 | 19 个（只计有篇目的朝代） |
| 有逐字平仄记录 | 264,662 首（程序预计算，未经逐首人工校核） |
| 有 AI 解说 | 15,838 首（约 2.1%；批量生成已结束，不再增长） |

> **平仄为什么不写百分比**：分子来自唐诗与宋诗的篇目，分母却是全库 744,571 ——
> 分子分母不同源，任何百分比都是双重错误。另外「有记录」不等于「能逐字渲染」：
> `strains_aligned = false` 的篇目站点降级为整句展示。两点都不支持一个单一比例数。

## 目录结构

```
data/
  000/56.json        ← 作品 id 56（注意：id 不补零）
  000/57.json
  739/739578.json   ← 作品 id 739578
```

**映射规则**：作品在寻诗站的详情页地址是 `/poems/{id}`，对应本仓库的 `data/{id 除以 1000、三位补零}/{id}.json`。
桶名三位补零，**文件名里的 id 不补零**。
例：《水调歌头》（苏轼）在站点是 `https://xunshi.oldmen.cn/poems/56`，数据文件是 [`data/000/56.json`](data/000/56.json)。

## 参与纠错

两种方式，任选其一：

**方式一：在 GitHub 直接改文件（推荐）**
到 `data/{桶}/{id}.json` 点编辑 → 改完提交 PR。也可以先在寻诗站的纠错弹窗里拿到
「修正后的完整 JSON」（点「提交 PR」会自动复制到剪贴板并打开编辑页），全选粘贴即可。

**方式二：在站点提 Issue，机器人自动开 PR**
在寻诗站点点「生成 Issue」提交后，`.github/workflows/correction-pr.yml` 会解析 Issue
正文里的变更 JSON，自动建分支、改文件、开 PR，并在 Issue 下留言 PR 链接。
正文里那段 `json` 块的格式：

```json
{ "work_id": 56, "changes": [{ "field": "work.title", "from": "旧值", "to": "新值" }] }
```

可改字段见下方「JSON 字段说明」；`work_id`、`work.id`、`annotation.confidence`、
`annotation.ai_generated` 等不接受外部改动，会被自动跳过。
不是纠错内容的 Issue 不会被评论打扰，机器人静默跳过。补跑某条 Issue：
Actions → 「纠错 Issue → 自动 PR」→ Run workflow，填 Issue 号。

> **仓库前置条件**：Settings → Actions → General 需开启
> 「Allow GitHub Actions to create and approve pull requests」，否则机器人开 PR 会 403。
> 已开启（2026-10-13）。

**PR 合并后**：维护者跑
`node scripts/web/import_fixes.mjs --repo <本仓库> --range main~1..main`
把改动回流到修正层，下次 `build:webdb` 生效。

## JSON 字段说明

```json
{
  "work_id": 56,
  "work": {
    "id": 56, "title": "水调歌头", "title_tr": "水調歌頭",
    "author": "苏轼", "author_tr": "蘇軾", "dynasty": "宋",
    "kind_cn": "词", "rhythmic": "水调歌头",
    "content": "明月几时有，把酒问青天。", "content_tr": "明月幾時有，把酒問青天。"
  },
  "anthologies": ["唐诗三百首"],
  "annotation": {
    "translation": "译文", "annotation": "注释", "appreciation": "赏析",
    "confidence": "high", "ai_generated": true
  },
  "strains_aligned": true
}
```

| 字段 | 说明 |
|---|---|
| `work_id` / `work.id` | 作品唯一 id，**纠错时请勿修改** |
| `title` / `title_tr` | 标题（简体 / 繁体） |
| `author` / `author_tr` | 作者 |
| `dynasty` / `kind_cn` / `rhythmic` | 朝代 / 体裁 / 词牌曲牌 |
| `content` / `content_tr` | 正文（简体 / 繁体），两列为原生数据，**非程序转换** |
| `anthologies` | 所属选本（如「唐诗三百首」） |
| `annotation` | AI 解说（译文/注释/赏析），无则为 `null`；`ai_generated: true` 表示 AI 生成 |
| `strains_aligned` | 逐字平仄是否与正文逐字对齐；`false` 时站点降级为整句展示 |

## 数据来源与许可

- 原始数据来自公开数据集 [chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)（MIT License，Copyright (c) 2016 JackeyGao），经聚合、繁简对照、平仄挂接与 AI 解说加工。
- **脚本、工作流与文档以 MIT 授权**，见 [`LICENSE`](./LICENSE)。
- ⚠️ **`data/` 下的数据本体不适用 MIT**：其中占数据量多数的一路上游来源，
  尚未取得可核验的许可声明 ⇒ **聚合数据集的许可未整体明确**，详见
  [`DATA-LICENSE.md`](./DATA-LICENSE.md)。转载或再分发前请先自行确认上游授权状态。
- **诚实声明**：
  - 正文取自公开数据集原始字段，**未做版本校勘**，异文（其他版本）不作优劣判定
  - AI 解说由大模型生成，**可能存在错误**，未经校勘，仅供参考。每条以 `ai_generated`
    布尔标记来源（`true` = AI 生成，`false` = 经社区人工校正），`model` 字段给出生成模型
  - 平仄为字符集 平 / 仄 / ○ / ？，**不含韵部、多音字与格律类型字段**
  - `□` 为原书缺字标记，属正常数据

## 如何纠错（欢迎 PR）

数据有错？**直接改**：

1. 在寻诗站点对应诗篇点「纠错 → 去 GitHub 编辑此文件」，或在本仓库找到对应 `data/{桶}/{id}.json`
2. 网页端编辑（铅笔图标）或 Fork 后修改，提交 PR
3. PR 会说明改动 diff，维护者 review 后合并
4. 合并的修正经校验写入寻诗数据管线，随下次发布同步到站点

也可以先在 [Issues](../../issues) 里讨论不确定的修改。

**可修改的字段**：

- `work` 里的 9 个字段：`title` / `title_tr` / `author` / `author_tr` / `dynasty` / `kind_cn` / `rhythmic` / `content` / `content_tr`
- `annotation` 里的 3 个字段：`translation`（译文）/ `annotation`（注释）/ `appreciation`（赏析）

**请勿修改**：`work_id`、`work.id`、`confidence`（质检分）、`ai_generated`（来源标记）、`strains_aligned`（平仄对齐标记）、`anthologies`（选本归属）。不要增删字段。
正文与作者是**繁简两列原生数据**，改简体时请一并核对繁体列，避免两侧不一致。

拿不准的地方保持原值，并在同名字段外新增 `{字段名}_fix_note` 说明修改依据，例如 `"title_fix_note": "原标题误挂诗句，据词牌与正文首句推断"`。

解说若被人工修正，站点会把它标成「经人工校正」，不再标记为纯 AI 生成。

### 合并前会自动跑一次校验

任何改动 `data/` 的 PR，CI 都会跑 [校验闸门](.github/workflows/validate-corrections.yml)
（脚本：`.github/scripts/validate-corrections.mjs`）。红灯不给合并，本地可以先自查：

```bash
BASE_SHA=$(git merge-base origin/main HEAD) HEAD_SHA=HEAD \
  node .github/scripts/validate-corrections.mjs
```

它拦的是确定的错误：**JSON 语法非法**、**路径与 `work_id` 不一致**、**不变量字段被改**、
**繁简两列行数不一致**、**改了却没给 `_fix_note`**，以及最容易踩的一条——
**换行转义损坏**：`content` 里本该写 `\n`，退化成字面 `n` 会让整首诗糊成一段。

2026-10-14 就真实发生过一次：某次网页端直接编辑把 `\n` 写成了 `n`，坏数据进了公开仓库。
闸门不拦谁的入口（网页端照改），但出来的一定要过一遍。

只 **WARN** 不拦的两类：解说缺 `ai_generated`，以及 `ai_generated: true` 却没有 `model`
（标识有了但溯源断了）。这两条往往确实不知道答案，硬拦只会让人绕过去，所以留给你判断。

## 相关

- 寻诗站：https://xunshi.oldmen.cn
- API 文档：https://xunshi.oldmen.cn/api
