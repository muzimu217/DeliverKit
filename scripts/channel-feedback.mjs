/**
 * 外部渠道反馈检查 —— 「及时收集」的自动化半边。
 *
 * 监控三类反馈源并写入 metrics/reports/channel-feedback-YYYY-MM-DD.md：
 * 1. 提交中的目录线程（PR/issue 的评论、维护者要求）
 * 2. 本仓库的 issue / discussion 增量
 * 3. npm 包下载量（粗粒度健康信号）
 *
 * 只读 + 报告：不回复评论、不代用户做任何承诺；API 不可达时记 UNKNOWN。
 * 由 promotion-supervision 工作流每个工作日调用；本地也可直接运行。
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const date = new Date().toISOString().slice(0, 10);

const THREADS = [
  { label: 'awesome-mcp-servers PR', repo: 'punkpeye/awesome-mcp-servers', kind: 'pr', num: 14195 },
  { label: 'mcp.so 收录 issue', repo: 'chatmcp/mcpso', kind: 'issue', num: 4070 },
  { label: '中国独立开发者（程序员版）PR', repo: '1c7/chinese-independent-developer', kind: 'pr', num: 1374 },
];

function ghJson(args) {
  try {
    return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', timeout: 30_000 }));
  } catch {
    return null; // API 不可达 → UNKNOWN，不猜
  }
}

const lines = [`# 渠道反馈检查 · ${date}`, ''];
const actionItems = [];
let fetchFailures = 0;

for (const thread of THREADS) {
  const sub = thread.kind === 'pr' ? 'pr' : 'issue';
  const view = ghJson([sub, 'view', String(thread.num), '-R', thread.repo, '--json', 'state,comments']);
  if (!view) {
    lines.push(`## ${thread.label}`, '- 状态：UNKNOWN（GitHub API 不可达）', '');
    fetchFailures += 1;
    continue;
  }
  lines.push(`## ${thread.label}`, `- 状态：${view.state}`);
  const humans = (view.comments || []).filter((c) => !c.author?.login?.includes('github-actions'));
  if (humans.length === 0 && (view.comments || []).length > 0) {
    lines.push('- 评论：仅机器人（badge 检查等），无需行动');
  }
  for (const c of humans) {
    lines.push(`- @${c.author?.login ?? 'unknown'}：${(c.body || '').replace(/\s+/g, ' ').slice(0, 400)}`);
    actionItems.push(`${thread.label}：@${c.author?.login} 有新评论，判断是否需要回复/行动`);
  }
  if (humans.length === 0 && (view.comments || []).length === 0) {
    lines.push('- 评论：暂无');
  }
  lines.push('');
}

// 本仓库社区增量
const issues = ghJson(['issue', 'list', '-R', 'muzimu217/DeliverKit', '--state', 'all', '--limit', '10', '--json', 'number,title,state,comments,author']);
lines.push('## 本仓库 issue / discussion');
if (!issues) {
  lines.push('- 状态：UNKNOWN（API 不可达）');
  fetchFailures += 1;
} else if (issues.length === 0) {
  lines.push('- 暂无 issue（外部提问仍是本轮北极星的关键破零项）');
} else {
  for (const i of issues) {
    lines.push(`- #${i.number} [${i.state}] ${i.title}（${(i.comments || []).length} 评论）`);
    if (i.state === 'OPEN') {actionItems.push(`本仓库 issue #${i.number} 待回应（24h SLA）`);}
  }
}
lines.push('');

// npm 下载健康信号
let npmLine = '- npm 周下载：UNKNOWN（API 不可达）';
try {
  const dl = JSON.parse(execFileSync('curl', ['-sf', 'https://api.npmjs.org/downloads/point/last-week/deliverkit-mcp'], { encoding: 'utf8', timeout: 15_000 }));
  npmLine = `- npm 周下载：${dl.downloads}`;
} catch { /* keep UNKNOWN */ }
lines.push('## 安装侧信号', npmLine, '');

// 抓取不完整时禁止输出「无待办」——诚实失败优先于干净报告。
if (fetchFailures > 0) {
  actionItems.unshift(`渠道数据不完整（${fetchFailures} 项 UNKNOWN），本报告不能据此判定「无待办」，需人工复核`);
}

if (actionItems.length > 0) {
  lines.push('## 需要行动', ...actionItems.map((a) => `- [ ] ${a}`), '');
} else {
  lines.push('## 需要行动', '- 无待办反馈', '');
}

mkdirSync(resolve(root, 'metrics/reports'), { recursive: true });
const out = resolve(root, 'metrics/reports', `channel-feedback-${date}.md`);
writeFileSync(out, lines.join('\n') + '\n', 'utf8');
console.log(actionItems.length > 0
  ? `channel feedback: ${actionItems.length} action item(s) -> ${out}`
  : `channel feedback: none pending -> ${out}`);
