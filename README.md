# 寻诗 · 古诗词开放数据集

**744,571 首**古诗词的结构化 JSON 数据集：繁简双列正文、逐字平仄标注、部分篇目附 AI 解说。
本站由 [寻诗](https://xunshi.oldmen.cn)（免登录公网古诗词全文检索站）维护，数据与站点同源。

## 数据规模

| 项 | 数量 |
|---|---|
| 作品 | 744,571 首 |
| 作者 | 39,188 位 |
| 朝代 | 19 个 |
| 带逐字平仄标注 | 264,662 首（占 35.5%） |
| 带 AI 解说 | 持续增长（同步时约 1.9%） |

## 目录结构

```
data/
  000/056.json      ← 作品 id 56
  000/057.json
  739/739578.json   ← 作品 id 739578
```

**映射规则**：作品在寻诗站的详情页地址是 `/poems/{id}`，对应本仓库的 `data/{id 除以 1000、三位补零}/{id}.json`。
例：《水调歌头》（苏轼）在站点是 `https://xunshi.oldmen.cn/poems/56`，数据文件是 [`data/000/056.json`](data/000/056.json)。

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

- 原始数据来自公开数据集 [chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)（MIT License，Copyright (c) 2016 JackeyGao），经聚合、繁简对照、平仄标注与 AI 解说加工。
- 本仓库数据同样以 **MIT License** 开放，可自由使用。
- **诚实声明**：
  - 正文取自公开数据集原始字段，**未做版本校勘**，异文（其他版本）不作优劣判定
  - AI 解说由大模型生成，**可能存在错误**，均标注「AI 生成」，仅供参考
  - 平仄为字符集 平 / 仄 / ○ / ？，**不含韵部、多音字与格律类型字段**
  - `□` 为原书缺字标记，属正常数据

## 如何纠错（欢迎 PR）

数据有错？**直接改**：

1. 在寻诗站点对应诗篇点「纠错 → 去 GitHub 编辑此文件」，或在本仓库找到对应 `data/{桶}/{id}.json`
2. 网页端编辑（铅笔图标）或 Fork 后修改，提交 PR
3. PR 会说明改动 diff，维护者 review 后合并
4. 合并的修正经校验写入寻诗数据管线，随下次发布同步到站点

也可以先在 [Issues](../../issues) 里讨论不确定的修改。

**修改时请保持字段结构不变**：不要增删字段、不要改 `work_id`/`id`；拿不准的地方保持原值。
如某字段确有错误，建议在同名字段外新增 `{字段名}_fix_note` 说明修改依据。

## 相关

- 寻诗站：https://xunshi.oldmen.cn
- API 文档：https://xunshi.oldmen.cn/api
