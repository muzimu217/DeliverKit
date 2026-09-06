/**
 * Promotion readiness audit — T0 当天一切皆复制粘贴的保证。
 *
 * 只做审计，不做任何外部提交：
 * - npm 包可见性（未发布 → 渠道全部 BLOCKED，属预期门禁态，不算脚本失败）
 * - 提交材料与仓库事实一致（命令、npm 链接、无旧包名残留；不一致 → exit 1，这是仓库级错误）
 * - 站点数据无漂移（复用生成守卫）
 * - 关键渠道材料文件存在
 *
 * 用法：node scripts/promote-readiness.mjs [--offline]
 * --offline 跳过 npm view 网络检查（离线时输出 UNKNOWN，不归零）。
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const offline = process.argv.includes('--offline');
const problems = [];
const notes = [];

function read(rel) {
  const file = resolve(root, rel);
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

function must(condition, message) {
  if (!condition) {problems.push(message);}
}

// 1) npm 可见性（用户凭据门禁）
let npmState = 'UNKNOWN';
if (offline) {
  notes.push('npm 可见性: UNKNOWN（--offline 跳过网络检查）');
} else {
  try {
    const version = execFileSync('npm', ['view', 'deliverkit-mcp', 'version'], { encoding: 'utf8' }).trim();
    npmState = `PUBLIC@${version}`;
    notes.push(`npm 可见性: PUBLIC@${version}`);
  } catch {
    npmState = 'NOT_PUBLISHED';
    notes.push('npm 可见性: NOT_PUBLISHED —— 目录提交渠道全部保持 BLOCKED（预期门禁态，先执行 npm adduser && npm publish）');
  }
}

// 2) 提交材料与仓库事实一致
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
must(packageJson.name === 'deliverkit-mcp', `package.json name 应为 deliverkit-mcp，实际 ${packageJson.name}`);
const bins = Object.keys(packageJson.bin ?? {});
must(
  [...bins].sort().join(',') === 'deliverkit,deliverkit-mcp',
  `package.json bin 应为 deliverkit + deliverkit-mcp，实际 ${bins.join(', ')}`
);

const submissionFiles = [
  'docs/community/promotion/submissions/awesome-mcp-servers.md',
  'docs/community/promotion/submissions/directories.md',
  'docs/community/promotion/gates.md',
  'docs/community/promotion/matrix.md',
  'docs/community/promotion/copy/en-showhn.md',
  'docs/community/promotion/copy/en-reddit-r-mcp.md',
  'docs/community/promotion/copy/en-x-thread.md',
  'docs/community/promotion/copy/zh-v2ex.md',
  'docs/community/promotion/copy/zh-juejin-zhihu.md',
];
for (const rel of submissionFiles) {
  must(read(rel) !== null, `渠道材料缺失: ${rel}`);
}

const stalePattern = /@forgekit|npx -y deliverkit(?!-mcp)\b|npx -y --package=deliverkit(?!-mcp)\b/g;
const scanFiles = [
  'README.md',
  'skills/deliverkit-mcp/SKILL.md',
  'docs/community/promotion/gates.md',
  'docs/community/promotion/matrix.md',
  'docs/community/promotion/goal.md',
  'docs/community/promotion/success-cases.md',
  'site/index.html',
  ...submissionFiles,
];
for (const rel of scanFiles) {
  const content = read(rel);
  if (content === null) {continue;}
  const stale = content.match(stalePattern);
  if (stale) {
    problems.push(`${rel} 含旧包名/旧命令: ${[...new Set(stale)].join(', ')}`);
  }
}

const readme = read('README.md') ?? '';
must(readme.includes('"args": ["-y", "deliverkit-mcp"]'), 'README 缺少 MCP stdio 配置块（npx -y deliverkit-mcp）');
must(readme.includes('--package=deliverkit-mcp'), 'README 缺少 CLI --package= 形式命令');
must(readme.includes('success-story'), 'README 缺少成功交付反馈入口');

// 3) 站点数据漂移
try {
  execFileSync(process.execPath, [resolve(root, 'scripts/check-site-drift.mjs')], { stdio: 'pipe' });
  notes.push('站点生态卡片: 与知识包一致');
} catch {
  problems.push('站点生态卡片与知识包漂移：运行 npm run gen:site 并提交');
}

// 4) 结论
console.log('=== DeliverKit 推广就绪审计 ===');
for (const note of notes) {console.log(`- ${note}`);}
if (problems.length > 0) {
  console.log('\nFAILED —— 材料与事实不一致（仓库级错误，须修复）：');
  for (const problem of problems) {console.log(`  ✗ ${problem}`);}
  process.exit(1);
}
console.log('\nPASSED —— 材料一致。');
console.log(
  npmState.startsWith('PUBLIC')
    ? 'READY: npm 已公开，可按 matrix.md 的 T0 清单逐渠道提交（每渠道提交后回填链接与日期）。'
    : 'BLOCKED: npm 未发布前不向任何外部目录提交（红线）。发布后重跑本脚本确认 READY。'
);
