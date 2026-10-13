// correction-pr.mjs 纯逻辑单测：node --test .github/scripts/correction-pr.test.mjs
// 守的是安全边界：越界字段必须被拒，work_id 必须合法，文件排版必须原样保持。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIssueBody, applyChanges, pathOf, bucketOf, classifyField,
} from './correction-pr.mjs';

const wrap = (obj) => `## 变更字段\n\n\`\`\`json\n${JSON.stringify(obj, null, 2)}\n\`\`\`\n`;

test('pathOf / bucketOf 与导出脚本一致', () => {
  assert.equal(bucketOf(56), '000');
  assert.equal(pathOf(56), 'data/000/56.json');
  assert.equal(pathOf(739578), 'data/739/739578.json');
  assert.equal(pathOf(-1), '');
  assert.equal(pathOf(1.5), '');
});

test('parseIssueBody：正常解析', () => {
  const r = parseIssueBody(wrap({ work_id: 56, changes: [{ field: 'work.title', from: 'a', to: 'b' }] }));
  assert.equal(r.ok, true);
  assert.equal(r.workId, 56);
  assert.deepEqual(r.changes, [{ field: 'work.title', to: 'b' }]);
});

test('parseIssueBody：没有 json 块 / 非法 JSON → 拒绝', () => {
  assert.equal(parseIssueBody('随便写点什么').ok, false);
  assert.equal(parseIssueBody('```json\n{ 坏掉的\n```').ok, false);
  assert.equal(parseIssueBody('').ok, false);
});

test('parseIssueBody：work_id 非法 → 拒绝', () => {
  for (const id of [null, '', -1, 1.5, 'abc', []]) {
    assert.equal(parseIssueBody(wrap({ work_id: id, changes: [{ field: 'work.title', to: 'b' }] })).ok, false, String(id));
  }
});

test('parseIssueBody：越界字段全部被跳过，且不得放行', () => {
  const r = parseIssueBody(wrap({
    work_id: 56,
    changes: [
      { field: 'work.id', to: 99 },
      { field: 'annotation.confidence', to: 'low' },
      { field: 'work_id', to: 1 },
    ],
  }));
  assert.equal(r.ok, false, '全部越界时不得放行');
});

test('parseIssueBody：混合时只保留白名单字段', () => {
  const r = parseIssueBody(wrap({
    work_id: 56,
    changes: [
      { field: 'work.title', to: '水调歌头·明月几时有' },
      { field: 'annotation.appreciation', to: '改过的赏析' },
      { field: 'work.id', to: 99 },
    ],
  }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.changes.map((c) => c.field), ['work.title', 'annotation.appreciation']);
  assert.deepEqual(r.skipped, ['work.id']);
});

test('applyChanges：只写白名单字段，不改入参', () => {
  const obj = { work_id: 56, work: { id: 56, title: '水调歌头', author: '苏轼' }, annotation: null };
  const out = applyChanges(obj, [
    { field: 'work.title', to: '水调歌头·明月几时有' },
    { field: 'annotation.translation', to: '明月何时才有' },
  ]);
  assert.equal(out.work.title, '水调歌头·明月几时有');
  assert.equal(out.work.author, '苏轼', '未列出的字段必须原样保留');
  assert.equal(out.work.id, 56, '定位键不得改');
  assert.equal(out.annotation.translation, '明月何时才有', 'annotation 为 null 时要能建起来');
  assert.equal(obj.work.title, '水调歌头', '入参不得被改');
  assert.equal(obj.annotation, null);
});

test('classifyField 与前端白名单一致（work 9 + annotation 3）', () => {
  for (const f of ['work.title', 'work.title_tr', 'work.author', 'work.author_tr', 'work.dynasty',
    'work.kind_cn', 'work.rhythmic', 'work.content', 'work.content_tr',
    'annotation.translation', 'annotation.annotation', 'annotation.appreciation']) {
    assert.equal(classifyField(f), 'fixable', f);
  }
  for (const f of ['work.id', 'work_id', 'annotation.confidence', 'annotation.ai_generated', 'work.zzz']) {
    assert.equal(classifyField(f), 'blocked', f);
  }
});
