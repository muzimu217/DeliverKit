/**
 * Drift guard: regenerate site/ecosystems.generated.js and fail if the
 * committed copy differs. Knowledge packs are the source of truth; a YAML
 * change without `npm run gen:site` must block, not silently ship stale
 * site content.
 */

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = 'site/ecosystems.generated.js';

execFileSync(process.execPath, [resolve(root, 'scripts/generate-site-content.mjs')], { stdio: 'inherit' });

try {
  execFileSync('git', ['diff', '--exit-code', '--', target], { cwd: root, stdio: 'pipe' });
  console.log(`site drift check passed: ${target} is up to date`);
} catch {
  console.error(
    `site drift detected: ${target} 不匹配知识包。运行 npm run gen:site 并提交生成文件后重试。`
  );
  process.exit(1);
}
