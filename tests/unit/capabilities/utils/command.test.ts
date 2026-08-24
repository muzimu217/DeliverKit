import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  describeCommandFailure,
  logTail,
  runCommand,
  runCommandWithLog,
} from '../../../../src/capabilities/utils/command.js';

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
    expect(result.timedOut).toBe(false);
    const log = fs.readFileSync(result.logPath, 'utf8');
    expect(log).toContain('## Combined output (live)');
    expect(log).toContain('# Exit code: 0');
  });

  it('把失败输出留在日志里，供上层做 log_excerpt', () => {
    const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgekit-command-fail-'));
    tempDirs.push(logDir);

    const result = runCommandWithLog(
      process.execPath,
      ['-e', 'console.error("E: Unable to locate package nonexistent"); process.exit(100)'],
      { logDir, logFileName: 'fail.log' }
    );

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(100);
    expect(logTail(result.stdout)).toContain('Unable to locate package');
  });
});

describe('runCommand 超时归一', () => {
  it('超时被标记为 timedOut，而不是伪装成普通退出码', () => {
    const result = runCommand(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { timeout: 150 });

    expect(result.success).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(describeCommandFailure(result, 150)).toContain('超时');
  });

  it('普通失败保留退出码描述', () => {
    const result = runCommand(process.execPath, ['-e', 'process.exit(3)']);

    expect(result.timedOut).toBe(false);
    expect(describeCommandFailure(result)).toBe('退出码 3');
  });
});

describe('logTail', () => {
  it('只保留尾部若干行并丢弃空行', () => {
    const text = ['a', '', 'b', 'c'].join('\n');
    expect(logTail(text, 2)).toBe('b\nc');
  });

  it('超过字符上限时标记截断', () => {
    const text = 'x'.repeat(50);
    expect(logTail(text, 40, 10)).toContain('[truncated]');
  });
});
