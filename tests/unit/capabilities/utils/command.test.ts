import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runCommandWithLog } from '../../../../src/capabilities/utils/command.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('runCommandWithLog', () => {
  it('captures combined command output in an auditable log', () => {
    const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgekit-command-log-'));
    tempDirs.push(logDir);

    const result = runCommandWithLog(
      process.execPath,
      ['-e', 'console.log("build-step"); console.error("pull-progress")'],
      { logDir, logFileName: 'live.log' }
    );

    expect(result.success).toBe(true);
    expect(result.stdout).toContain('build-step');
    expect(result.stdout).toContain('pull-progress');
    const log = fs.readFileSync(result.logPath, 'utf8');
    expect(log).toContain('## Combined output (live)');
    expect(log).toContain('# Exit code: 0');
  });
});
