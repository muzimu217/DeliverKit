/**
 * Persist pack results so generate_release_manifest can aggregate them
 * without manual plumbing. A successful build whose evidence never reaches
 * the manifest is a broken first-run experience — this closes that gap.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export function persistResultJson(sourceDir: string, command: string, result: unknown): void {
  try {
    const resultsDir = path.join(path.resolve(sourceDir), '.deliverkit', 'results');
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(
      path.join(resultsDir, `${command}.json`),
      `${JSON.stringify(result, null, 2)}\n`,
      'utf8'
    );
  } catch {
    // 结果落盘失败不应让已成功的构建失败；manifest 缺文件时会给出自己的指引。
  }
}
