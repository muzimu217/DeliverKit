import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const metricsDir = resolve(root, 'metrics');
const outputDir = resolve(metricsDir, 'reports');
const now = new Date();
const date = now.toISOString().slice(0, 10);
const cutoff = Date.now() - 8 * 24 * 60 * 60 * 1000;
const files = existsSync(metricsDir)
  ? readdirSync(metricsDir).filter((file) => /^traffic-\d{4}-\d{2}-\d{2}\.json$/.test(file)).sort()
  : [];
const recent = files
  .map((file) => ({ file, data: JSON.parse(readFileSync(resolve(metricsDir, file), 'utf8')) }))
  .filter(({ data }) => Date.parse(data.date) >= cutoff);
const latest = recent.at(-1)?.data;
const cases = readFileSync(resolve(root, 'docs/community/promotion/success-cases.md'), 'utf8')
  .split('\n').filter((line) => /^\| \d+ \|/.test(line) && !line.includes('| — |')).length;
const unknown = !latest || latest.traffic_ok !== true;

const report = `# 宣传与真实用户周报 · ${date}\n\n` +
  `> 北极星：30 天 10 个真实外部用户成功交付。数据缺失标记 UNKNOWN，不当作 0。\n\n` +
  `## 数据健康\n\n` +
  `- 最近 8 天快照：${recent.length > 0 ? recent.length : 'UNKNOWN'}\n` +
  `- 最新快照：${latest?.date ?? 'UNKNOWN'}\n` +
  `- traffic API：${unknown ? 'UNKNOWN（需 METRICS_TOKEN 或快照缺失）' : 'OK'}\n` +
  `- npm 周下载：${latest?.npm_downloads_last_week ?? 'UNKNOWN（包未发布或 API 不可用）'}\n` +
  `- Stars / forks / issues：${latest ? `${latest.repo.stars} / ${latest.repo.forks} / ${latest.repo.open_issues}` : 'UNKNOWN'}\n\n` +
  `## 北极星进度\n\n` +
  `- 已记录成功案例：${cases} / 10\n` +
  `- 结论：${cases >= 10 ? '目标达成，继续收集复现证据。' : '目标未达成，优先邀请真实用户完成 Linux 首次交付。'}\n\n` +
  `## 本周动作\n\n` +
  (unknown ? '- 修复 metrics 快照凭据或补跑 workflow；在数据恢复前不要解读流量下降。\n' : '- 对照 referrer 与 npm 下载复盘渠道质量。\n') +
  (cases < 10 ? '- 在 Discussions 邀请用户按 success-cases.md 模板反馈一次真实交付。\n' : '- 选取已获授权案例更新推广文案。\n');

mkdirSync(outputDir, { recursive: true });
writeFileSync(resolve(outputDir, `weekly-${date}.md`), report);
console.log(report);
