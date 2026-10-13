#!/usr/bin/env node
/**
 * 纠错 Issue → 自动 PR
 *
 * 由 .github/workflows/correction-pr.yml 调用。读者在寻诗站点点「生成 Issue」后，
 * Issue 正文里会带一个 ```json 块，形如：
 *   { "work_id": 56, "changes": [ { "field": "work.title", "from": "…", "to": "…" } ] }
 * 本脚本把它解析、校验、落到 data/<桶>/<id>.json，然后开一个真实 PR。
 *
 * 合并后由 scripts/web/import_fixes.mjs --range main~1..main 回流到修正层，
 * 下次 build:webdb 生效 —— 维护者不需要手动搬运数据。
 *
 * 纯逻辑（parseIssueBody / applyChanges / pathOf）导出以便 node --test 单测；
 * 直接执行时才走 GitHub API。
 */

export const WORK_FIELDS = new Set([
  'title', 'title_tr', 'author', 'author_tr',
  'dynasty', 'kind_cn', 'rhythmic', 'content', 'content_tr',
]);
// 解说三项走 annotation-overrides.jsonl 回流；confidence / ai_generated 不接受外部改
export const ANNO_FIELDS = new Set(['translation', 'annotation', 'appreciation']);

// 桶 = floor(id/1000) 三位补零，id 不补零。与 scripts/web/export_json.mjs 一致
export function bucketOf(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) return '';
  return String(Math.floor(n / 1000)).padStart(3, '0');
}

export function pathOf(id) {
  const n = Number(id);
  const b = bucketOf(n);
  if (!b) return '';
  return `data/${b}/${n}.json`;
}

export function classifyField(f) {
  const p = String(f == null ? '' : f);
  if (p.startsWith('annotation.')) return ANNO_FIELDS.has(p.slice('annotation.'.length)) ? 'fixable' : 'blocked';
  return WORK_FIELDS.has(p.replace(/^work\./, '')) ? 'fixable' : 'blocked';
}

/**
 * 解析 Issue 正文里的变更 JSON。
 * 返回 { ok: true, workId, changes, skipped } 或 { ok: false, reason }
 */
export function parseIssueBody(body) {
  const text = String(body == null ? '' : body);
  const m = /```json\s*([\s\S]*?)```/.exec(text);
  // 没有 json 块 = 这不是一条纠错 Issue（普通提问、闲聊等），静默跳过，不评论打扰。
  // 不能靠 label 判断：站点链接带的 labels=data-correction 对无写权限的读者会被
  // GitHub 静默丢弃，实测 Issue #1 就是因为没有标签而没被处理。
  if (!m) return { ok: false, silent: true, reason: '正文里没有 json 代码块，非纠错 Issue。' };
  let data;
  try { data = JSON.parse(m[1].trim()); } catch {
    return { ok: false, reason: 'JSON 代码块解析失败，可能不是合法的 JSON。' };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, reason: 'JSON 顶层必须是对象。' };
  }
  // 不能直接 Number()：Number(null)===0、Number('')===0、Number([])===0，
  // 会把空值当成 work_id=0 放行，改到 data/000/0.json 这个文件上。
  const rawId = data.work_id;
  const idOk = (typeof rawId === 'number' && Number.isInteger(rawId) && rawId >= 0)
    || (typeof rawId === 'string' && /^\d+$/.test(rawId.trim()));
  if (!idOk) {
    return { ok: false, reason: `work_id 不是合法的非负整数：${JSON.stringify(rawId)}` };
  }
  const workId = Number(rawId);
  if (!Array.isArray(data.changes) || data.changes.length === 0) {
    return { ok: false, reason: 'changes 为空，没有可应用的修改。' };
  }
  const changes = [];
  const skipped = [];
  for (const c of data.changes) {
    if (!c || typeof c !== 'object') { skipped.push(String(c)); continue; }
    if (classifyField(c.field) !== 'fixable') { skipped.push(String(c.field)); continue; }
    if (typeof c.to !== 'string' && typeof c.to !== 'number' && typeof c.to !== 'boolean') {
      skipped.push(String(c.field)); continue;
    }
    changes.push({ field: String(c.field), to: c.to });
  }
  if (!changes.length) {
    return { ok: false, reason: `没有一条字段在白名单内（被跳过：${skipped.join('、') || '无'}）。` };
  }
  return { ok: true, workId, changes, skipped };
}

/** 把变更应用到数据对象（深拷贝，不改入参） */
export function applyChanges(obj, changes) {
  const out = JSON.parse(JSON.stringify(obj == null ? {} : obj));
  for (const c of changes) {
    if (classifyField(c.field) !== 'fixable') continue;
    const parts = String(c.field).split('.');
    if (parts.length !== 2) continue;
    const [top, key] = parts;
    if (top !== 'work' && top !== 'annotation') continue;
    if (out[top] === null || typeof out[top] !== 'object' || Array.isArray(out[top])) out[top] = {};
    out[top][key] = c.to;
  }
  return out;
}

/* ==================== 以下为 GitHub API 执行部分 ==================== */

const env = (k, d = '') => process.env[k] || d;

async function gh(pathname, init = {}) {
  const api = env('GITHUB_API_URL', 'https://api.github.com');
  const res = await fetch(`${api}${pathname}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env('GH_TOKEN')}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`GitHub API ${init.method || 'GET'} ${pathname} → ${res.status} ${t.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}

async function comment(body) {
  const n = env('ISSUE_NUMBER');
  if (!n) return;
  await gh(`/repos/${env('GITHUB_REPOSITORY')}/issues/${n}/comments`, {
    method: 'POST', body: JSON.stringify({ body }),
  });
}

async function main() {
  const repo = env('GITHUB_REPOSITORY');
  const issueNo = env('ISSUE_NUMBER') || env('ISSUE_NUMBER_INPUT');

  // ISSUE_BODY 由 workflow 用 toJSON 传入（防换行注入）；手动 dispatch 时没有它，
  // 就按 issue 号自己取。两条路都覆盖，补跑老 Issue 也能用。
  let rawBody = '';
  // 注意：workflow 里 toJSON(github.event.issue.body) 在 dispatch 时会渲染成字符串
  // "null"，JSON.parse 出来是 null 而不是空串 —— 必须当「没传」处理再去取，否则
  // 会把一条真实纠错误判成非纠错 Issue（实测 Issue #1 补跑时踩到）。
  const envBody = env('ISSUE_BODY');
  if (envBody && envBody !== 'null' && envBody !== '""') {
    try {
      const v = JSON.parse(envBody);
      rawBody = typeof v === 'string' ? v : '';
    } catch { rawBody = envBody; }
  }
  if (!rawBody && issueNo) {
    const it = await gh(`/repos/${repo}/issues/${issueNo}`);
    rawBody = it.body || '';
  }

  const parsed = parseIssueBody(rawBody);
  if (parsed.silent) { console.log(`跳过：${parsed.reason}`); return; }

  if (!parsed.ok) {
    await comment([
      '自动开 PR 失败，需要人工处理：',
      '',
      `- ${parsed.reason}`,
      '',
      '若你确实要改数据，请到数据仓库编辑对应文件提 PR，或在评论里补充规范格式的 JSON。',
      '',
      '<!-- bot: correction-pr -->',
    ].join('\n'));
    console.log(`跳过：${parsed.reason}`);
    return;
  }

  const { workId, changes, skipped } = parsed;
  const path = pathOf(workId);
  if (!path) { await comment(`work_id ${workId} 无法定位文件。`); return; }

  // 1) 取 main 的 HEAD
  const ref = await gh(`/repos/${repo}/git/ref/heads/main`);
  const baseSha = ref.object.sha;
  // 2) 取当前文件（需要 sha 才能更新）
  const file = await gh(`/repos/${repo}/contents/${path}?ref=main`);
  const original = Buffer.from(file.content || '', 'base64').toString('utf8');
  const obj = JSON.parse(original);

  const merged = applyChanges(obj, changes);
  // 排版与仓库现有文件保持一致：2 空格缩进 + 末尾换行（见 data/000/56.json）
  const next = `${JSON.stringify(merged, null, 2)}\n`;
  if (next === original) {
    await comment([
      '这份改动应用后文件内容与当前一致（没有实际变化），未创建 PR。',
      '',
      `work_id ${workId} · 字段：${changes.map((c) => `\`${c.field}\``).join('、')}`,
      '',
      '<!-- bot: correction-pr -->',
    ].join('\n'));
    return;
  }

  // 3) 建分支
  const branch = `fix/issue-${issueNo || 'x'}-${workId}`;
  await gh(`/repos/${repo}/git/refs`, {
    method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
  });
  // 4) 更新文件
  await gh(`/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `fix(work ${workId}): ${changes.map((c) => c.field).join(', ')}（来自 #${issueNo}）`,
      content: Buffer.from(next, 'utf8').toString('base64'),
      branch, sha: file.sha,
    }),
  });
  // 5) 开 PR
  const pr = await gh(`/repos/${repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: `[纠错 #${issueNo}] work ${workId}：${changes.map((c) => c.field).join(', ')}`,
      head: branch, base: 'main',
      body: [
        `由 #${issueNo} 自动生成的纠错 PR。`,
        '',
        '## 变更字段',
        ...changes.map((c) => `- \`${c.field}\``),
        skipped.length ? '' : null,
        skipped.length ? `> 另有 ${skipped.length} 个字段不在白名单内，已跳过：${skipped.join('、')}` : null,
        '',
        '合并后由 `scripts/web/import_fixes.mjs` 回流到修正层，下次构建生效。',
        '',
        `Closes #${issueNo}`,
      ].filter((x) => x !== null).join('\n'),
    }),
  });
  await gh(`/repos/${repo}/issues/${pr.number}/labels`, {
    method: 'POST', body: JSON.stringify({ labels: ['data-correction'] }),
  });
  await comment([
    `已自动创建 PR：#${pr.number} ${pr.html_url}`,
    '',
    '合并后数据会在下次构建时回流生效。',
    '',
    '<!-- bot: correction-pr -->',
  ].join('\n'));
  console.log(`PR 已创建：${pr.html_url}`);
}

// 直接执行（而非被 import）时才跑 main。路径分隔符在 Windows/Linux 不同，统一成 /
const invoked = String(process.argv[1] || '').replace(/\\/g, '/');
if (invoked.endsWith('/.github/scripts/correction-pr.mjs')) {
  main().catch(async (e) => {
    console.error(e);
    try {
      await comment([
        '自动开 PR 时出错，需要人工处理：',
        '',
        '```',
        String(e && e.message ? e.message : e).slice(0, 500),
        '```',
        '',
        '<!-- bot: correction-pr -->',
      ].join('\n'));
    } catch (e2) { console.error('评论也失败了：', e2); }
    process.exit(1);
  });
}
