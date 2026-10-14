#!/usr/bin/env node
// ============================================================================
// data/ 变更校验 —— PR 侧的机器闸门
//
// 为什么要有这个文件（起因，勿删）：
//   2026-10-14 PR #5 把 data/106/106205.json 的 `\n` 改成了字面 `n`，坏数据直接
//   推上了公开数据仓。那条 PR 的分支是 liuwave-patch-2 —— GitHub **网页端直接编辑**
//   自动生成的分支名，不是本仓库机器人的 fix/issue-{n}-{id}。
//   ⇒ 网页端那条路绕开了 correction-pr.mjs 的字段白名单，也绕开了 `_fix_note` 约定，
//     最后连 JSON 转义都改坏了。根因不在 correction-pr.mjs（它用 JSON.stringify，
//     转义是对的），而在**这条入口当时没有任何机器闸门**。
//
// 设计取向：
//   - 不堵塞合法入口。网页端直接编辑应当允许 —— 它只是**必须在 PR 侧被兜住**。
//   - 只校验本次 PR 改动的文件。全量 744,571 个文件里有历史遗留数据，
//     用新规则全量扫会把整个仓库判红。
//   - FAIL 只允许给「确定的错误」，可解释性差的一律降级为 WARN。
//     把 WARN 抬成 FAIL 会让贡献者学会绕过闸门，得不偿失。
//
// 用法（CI 内）：
//   BASE_SHA=<merge base>  HEAD_SHA=<PR head>  node .github/scripts/validate-corrections.mjs
// 本地自查：
//   BASE_SHA=$(git merge-base origin/main HEAD) HEAD_SHA=HEAD node .github/scripts/validate-corrections.mjs
// ============================================================================
import { execFileSync } from 'node:child_process';

/** work 里允许外部修改的字段（与 README「可修改的字段」一致） */
const FIXABLE = new Set([
  'title', 'title_tr', 'sub_title', 'author', 'author_tr',
  'dynasty', 'kind_cn', 'rhythmic', 'content', 'content_tr',
]);

/** 一律不许改：要么是不变量，要么是机器派生、不可人工主张 */
const FROZEN = [
  'work_id', 'id', 'anthologies', 'strains_aligned', 'strains', 'rank_score',
];

/**
 * 疑似「换行转义被写坏」：句读标点后紧跟一个裸 n。
 * 背景：正确写法 `\n` 在某些编辑器/粘贴路径上会被退化成 `n`，
 * 于是「…。n下句」在原串里看起来是「。n下句」——字符串不再分行，页面上就糊成一段。
 * 中文本身几乎不会在标点后直接出现英文字母 n（除非夹拉丁牛词），故误伤极低。
 */
const STRAY_N = /[，。！？；、」』”）]n/;

/** 路径 ↔ id 的一致性：data/{id/1000 三位补零}/{id}.json */
export function pathMatchesWorkId(filePath, workId) {
  if (!Number.isInteger(workId) || workId < 0) return false;
  const bucket = String(Math.floor(workId / 1000)).padStart(3, '0');
  const expected = `data/${bucket}/${workId}.json`;
  return filePath.replace(/\\/g, '/') === expected;
}

/** 一行 helper：取 work 对象（容错不同 shape） */
function workOf(doc) {
  return (doc && typeof doc.work === 'object' && doc.work) || doc || {};
}

/**
 * 校验单个文件的最终形态，返回 { errors, warnings }。
 * @param {string} filePath
 * @param {object|null} baseDoc  base 分支上的同名文件（新增文件为 null）
 * @param {string} rawText       最终要落盘的原文
 */
export function validateFile(filePath, baseDoc, rawText) {
  const errors = [];
  const warnings = [];

  let doc;
  try {
    doc = JSON.parse(rawText);
  } catch (e) {
    return { errors: [`JSON 语法错误：${e.message}`], warnings };
  }

  const w = workOf(doc);

  // ---- FAIL 1：路径 ↔ work_id ----
  const wid = w.work_id != null ? w.work_id : doc.work_id;
  if (wid == null) errors.push('缺少 work_id');
  else if (!pathMatchesWorkId(filePath, Number(wid))) {
    errors.push(`work_id=${wid} 与文件路径不一致（应为 data/${String(Math.floor(Number(wid) / 1000)).padStart(3, '0')}/${wid}.json）`);
  }

  // ---- FAIL 2：不变量字段被改 ----
  const baseWork = baseDoc ? workOf(baseDoc) : null;
  if (baseWork) {
    for (const k of FROZEN) {
      const before = JSON.stringify(baseWork[k]);
      const after = JSON.stringify(w[k]);
      if (before !== after) {
        errors.push(`不允许修改 \`${k}\`：${before} → ${after}（属机器派生或不变量，不可人工主张）`);
      }
    }
  }

  // ---- FAIL 3：换行转义损坏 ----
  for (const k of ['content', 'content_tr']) {
    const v = w[k];
    if (typeof v !== 'string') continue;
    if (STRAY_N.test(v)) {
      errors.push(`\`${k}\` 疑似换行转义损坏：句读标点后出现裸 n（应为 \\n）`);
    }
  }

  // ---- FAIL 4：繁简两列必须同步分行 ----
  if (typeof w.content === 'string' && typeof w.content_tr === 'string'
      && String(w.content).trim() !== '') {
    const a = String(w.content).split(/[\n\r]+/).filter((s) => s.trim()).length;
    const b = String(w.content_tr).split(/[\n\r]+/).filter((s) => s.trim()).length;
    if (a !== b) errors.push(`content(${a} 行) 与 content_tr(${b} 行) 行数不一致 —— 繁简须同步分行`);
  }

  // ---- FAIL 5：改动必须自带依据（G5′：删了不能变成沉默，缺口/依据须同现）----
  if (baseWork) {
    for (const k of FIXABLE) {
      const before = baseWork[k] == null ? '' : String(baseWork[k]);
      const after = w[k] == null ? '' : String(w[k]);
      if (before === after) continue;
      const noteKey = `${k}_fix_note`;
      const note = w[noteKey] == null ? '' : String(w[noteKey]).trim();
      if (!note) {
        errors.push(`修改了 \`${k}\` 但没给出 \`${noteKey}\`（改了必须说依据）`);
      }
    }
  }

  // ---- WARN：AI 内容的溯源闭环 ----
  const ann = doc.annotation;
  const baseAnn = baseDoc ? baseDoc.annotation : null;
  const annChanged = JSON.stringify(ann || null) !== JSON.stringify(baseAnn || null);
  if (ann && annChanged) {
    if (ann.ai_generated == null) {
      warnings.push('`annotation.ai_generated` 缺失 —— 无法判断这条解说是否 AI 生成');
    } else if (ann.ai_generated === true && !ann.model) {
      warnings.push('`ai_generated: true` 但没有 `model` —— 标识有了，溯源断了（读者无法知道是哪个模型）');
    }
    if (ann.confidence != null) {
      warnings.push('`annotation.confidence` 是已废弃字段（新导出 shape 已移除），建议删掉');
    }
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function main() {
  const base = process.env.BASE_SHA;
  const head = process.env.HEAD_SHA;
  if (!base || !head) {
    console.error('需要 BASE_SHA / HEAD_SHA 两个环境变量');
    process.exit(2);
  }

  const files = git(['diff', '--name-only', '--diff-filter=ACMR', base, head, '--', 'data/'])
    .split('\n').map((s) => s.trim()).filter(Boolean);

  if (files.length === 0) {
    console.log('本次改动不涉及 data/，跳过校验。');
    return;
  }

  let hardFail = 0;
  const allWarnings = [];

  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    let raw;
    try {
      raw = git(['show', `${head}:${f}`]);
    } catch {
      console.log(`◦ ${f}（已删除，跳过）`);
      continue;
    }
    let baseDoc = null;
    try {
      baseDoc = JSON.parse(git(['show', `${base}:${f}`]));
    } catch { /* 新增文件无 base 版本，属正常 */ }

    const { errors, warnings } = validateFile(f, baseDoc, raw);

    if (errors.length) {
      hardFail += 1;
      console.log(`\n✗ ${f}`);
      for (const e of errors) console.log(`    ERROR  ${e}`);
    } else {
      console.log(`✓ ${f}`);
    }
    for (const w of warnings) console.log(`    WARN   ${w}`);
    allWarnings.push(...warnings);
  }

  console.log(`\n──────── 校验结果 ────────`);
  console.log(`改动文件 ${files.length} 个 · 硬失败 ${hardFail} 个 · 警告 ${allWarnings.length} 条`);

  if (hardFail > 0) {
    console.error('\n存在必须修完才能合并的问题，见上列 ERROR。');
    process.exit(1);
  }
}

const invoked = String(process.argv[1] || '').replace(/\\/g, '/');
if (invoked.endsWith('validate-corrections.mjs')) main();
