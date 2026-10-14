// validate-corrections.mjs 纯逻辑单测：node --test .github/scripts/validate-corrections.test.mjs
// 守的是安全边界：坏掉的转义必须被拦住、不变量字段不许改、改了必须留依据。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathMatchesWorkId, validateFile } from './validate-corrections.mjs';

/** 造一份「干净」的基准文档：能通过全部规则 */
const base = () => ({
  work_id: 106205,
  work: {
    id: 106205,
    title: '茉莉',
    title_tr: '茉莉',
    author: '卢梅坡',
    dynasty: '宋',
    content: '京尘湫隘■蚊多，彼美繁英玉雪窠。\n见谓娇柔能特立，肯凭他物学藤萝。',
    content_tr: '京塵湫隘■蚊多，彼美繁英玉雪窠。\n見謂嬌柔能特立，肯憑他物學藤蘿。',
    anthologies: [],
  },
  annotation: null,
  strains_aligned: true,
});

const P = 'data/106/106205.json';
const run = (doc, baseDoc = base()) =>
  validateFile(P, baseDoc, JSON.stringify(doc, null, 2));

test('路径 ↔ work_id 一致性', () => {
  assert.equal(pathMatchesWorkId('data/000/56.json', 56), true);
  assert.equal(pathMatchesWorkId('data/739/739578.json', 739578), true);
  assert.equal(pathMatchesWorkId('data/000/56.json', 57), false);
  assert.equal(pathMatchesWorkId('data/00/56.json', 56), false);
  assert.equal(pathMatchesWorkId('data/000/56.json', 'abc'), false);
});

test('干净文档零错误零警告', () => {
  const { errors, warnings } = validateFile(P, null, JSON.stringify(base(), null, 2));
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

// 这条是 PR #5 的原型用例：\n 被退化成字面 n。护栏存在的全部理由。
test('换行转义损坏必须 FAIL（PR #5 原型）', () => {
  const d = base();
  d.work.content = '京尘湫隘蠓蚊多，彼美繁英玉雪窠。n见谓娇柔能特立，肯凭他物学藤萝。';
  d.work.content_tr = '京塵湫隘蠓蚊多，彼美繁英玉雪窠。n見謂嬌柔能特立，肯憑他物學藤蘿。';
  const { errors } = run(d);
  assert.ok(errors.some((e) => e.includes('换行转义损坏') && e.includes('content')), `未拦住：${errors}`);
  assert.ok(errors.some((e) => e.includes('content_tr')), '繁体侧没被拦住');
});

test('繁简行数不一致必须 FAIL', () => {
  const d = base();
  d.work.content_tr = '只有一行没有分行';
  const { errors } = run(d);
  assert.ok(errors.some((e) => e.includes('行数不一致')), `未拦住：${errors}`);
});

test('不变量字段被改必须 FAIL', () => {
  for (const [key, val] of [['strains_aligned', false], ['work_id', 999], ['anthologies', ['唐诗三百首']]]) {
    const d = base();
    if (key === 'work_id') { d.work_id = val; d.work.id = val; } else d.work[key] = val;
    const { errors } = run(d);
    assert.ok(errors.some((e) => e.includes(key)), `改动 ${key} 未被拦：${errors}`);
  }
});

test('改 content 但不给 _fix_note 必须 FAIL（依据须同现）', () => {
  const d = base();
  d.work.content = '改了内容但没说依据';
  d.work.content_tr = '改了內容但沒說依據';
  const { errors } = run(d);
  assert.ok(errors.some((e) => e.includes('content_fix_note')), `未拦住：${errors}`);
});

test('给了 _fix_note 就放行', () => {
  const d = base();
  d.work.content = '改了内容\n第二行';
  d.work.content_tr = '改了內容\n第二行';
  d.work.content_fix_note = '据某某本改';
  d.work.content_tr_fix_note = '据某某本改';
  const { errors } = run(d);
  assert.deepEqual(errors, [], `不该报错：${errors}`);
});

test('AI 解说缺 model 只 WARN 不 FAIL（否则贡献者会学会绕闸门）', () => {
  const d = base();
  d.annotation = { translation: 'x', annotation: 'y', appreciation: 'z', ai_generated: true };
  const { errors, warnings } = run(d);
  assert.deepEqual(errors, [], '溯源缺失不该造成硬失败');
  assert.ok(warnings.some((w) => w.includes('model')), `应有 model 警告：${warnings}`);
});

test('AI 解说缺 ai_generated 也只 WARN', () => {
  const d = base();
  d.annotation = { translation: 'x', annotation: 'y', appreciation: 'z' };
  const { errors, warnings } = run(d);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((w) => w.includes('ai_generated')), `应有警告：${warnings}`);
});

test('未改动的旧文件不被历史遗留问题判红', () => {
  const legacy = base();
  legacy.annotation = { translation: 'x', annotation: 'y', appreciation: 'z', ai_generated: true, confidence: 'medium' };
  // base 与最终形态一致 ⇒ 视为未改动 ⇒ 不产生 ai_generated / model / confidence 告警
  const { errors, warnings } = validateFile(P, legacy, JSON.stringify(legacy, null, 2));
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});
