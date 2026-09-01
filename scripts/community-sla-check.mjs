import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const date = new Date().toISOString().slice(0, 10);
const output = resolve(root, 'metrics', 'reports', `community-sla-${date}.md`);
const repo = process.env.GITHUB_REPOSITORY || 'muzimu217/DeliverKit';

function ghApi(endpoint) {
  try {
    return JSON.parse(execFileSync('gh', ['api', endpoint], { cwd: root, encoding: 'utf8' }));
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

const issues = ghApi(`repos/${repo}/issues?state=open&per_page=100`);
const discussions = ghApi(`repos/${repo}/discussions?per_page=100`);
const now = Date.now();
const stale = Array.isArray(issues)
  ? issues.filter((item) => !item.pull_request && now - Date.parse(item.created_at) > 24 * 60 * 60 * 1000 && !item.comments)
  : [];
const issueStatus = issues.error ? `UNKNOWN（${issues.error}）` : `${issues.length} 个开放 issue`;
const discussionStatus = discussions.error ? `UNKNOWN（API 不可用或未授权：${discussions.error}）` : `${discussions.length} 条 discussion`;
const lines = [
  `# 社区响应 SLA · ${date}`,
  '',
  '> 目标：工作日内发现超过 24 小时未响应的 issue/discussion。API 失败标记 UNKNOWN，不静默当作没有待办。',
  '',
  `- Issues：${issueStatus}`,
  `- Discussions：${discussionStatus}`,
  `- 超过 24 小时且无评论的 issue：${issues.error ? 'UNKNOWN' : stale.length}`,
  '',
  '## 需要维护者处理',
  '',
];
if (stale.length > 0) {
  for (const item of stale) lines.push(`- [ ] #${item.number} ${item.title} — ${item.html_url}`);
} else if (issues.error) {
  lines.push('- [ ] 检查 GH_TOKEN 权限后重新运行。');
} else {
  lines.push('- [x] 没有发现超过 24 小时且无评论的公开 issue。');
}
mkdirSync(resolve(root, 'metrics', 'reports'), { recursive: true });
writeFileSync(output, `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
