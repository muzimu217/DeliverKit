/**
 * Command Execution Utility - 命令执行 + 日志捕获
 *
 * 用于 docker build、dpkg-deb 等本地工具调用
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  success: boolean;
}

export interface CommandLogResult extends CommandResult {
  logPath: string;
}

/**
 * 检查命令是否可用（which/where）
 */
export function commandExists(cmd: string): boolean {
  try {
    const checkCmd = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(checkCmd, [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 执行命令并捕获输出
 * 不抛异常，返回结构化结果
 */
export function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; timeout?: number } = {}
): CommandResult {
  const { cwd, timeout = 120000 } = options;

  try {
    const stdout = execFileSync(command, args, {
      cwd,
      timeout,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    return {
      exitCode: 0,
      stdout: stdout || '',
      stderr: '',
      success: true,
    };
  } catch (error) {
    const failure = normalizeCommandError(error);
    return {
      exitCode: failure.status,
      stdout: failure.stdout,
      stderr: failure.stderr,
      success: false,
    };
  }
}

function normalizeCommandError(error: unknown): {
  status: number;
  stdout: string;
  stderr: string;
} {
  const record = isRecord(error) ? error : {};
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: typeof record.status === 'number' ? record.status : 1,
    stdout: outputToString(record.stdout),
    stderr: outputToString(record.stderr) || message,
  };
}

function outputToString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return Buffer.isBuffer(value) ? value.toString('utf8') : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * 执行命令并将完整输出写入日志文件
 * @returns 命令结果 + 日志路径
 */
export function runCommandWithLog(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    timeout?: number;
    logDir?: string;
    logFileName?: string;
  } = {}
): CommandLogResult {
  const { logDir = 'dist/forgekit/logs', logFileName = `${command}-${Date.now()}.log` } = options;

  // 确保日志目录存在
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.resolve(logDir, logFileName);

  // 先创建日志，再把子进程 stdout/stderr 直接连接到文件。这样镜像拉取等长任务
  // 执行期间就能看到进度，而不是等 execFileSync 返回后才一次性落盘。
  const logHeader = [
    `# Command: ${command} ${args.join(' ')}`,
    `# Started: ${new Date().toISOString()}`,
    '',
    '## Combined output (live)',
    '',
  ].join('\n');
  fs.writeFileSync(logPath, logHeader, 'utf-8');

  const logFd = fs.openSync(logPath, 'a');
  let result: CommandResult;
  try {
    execFileSync(command, args, {
      cwd: options.cwd,
      timeout: options.timeout ?? 120000,
      stdio: ['ignore', logFd, logFd],
    });
    result = { exitCode: 0, stdout: '', stderr: '', success: true };
  } catch (error) {
    const failure = normalizeCommandError(error);
    result = {
      exitCode: failure.status,
      stdout: '',
      stderr: failure.stderr,
      success: false,
    };
  } finally {
    fs.closeSync(logFd);
  }

  const liveOutput = fs.readFileSync(logPath, 'utf-8').slice(logHeader.length);
  fs.appendFileSync(
    logPath,
    `\n# Finished: ${new Date().toISOString()}\n# Exit code: ${result.exitCode}\n`,
    'utf-8'
  );
  result.stdout = liveOutput;

  return { ...result, logPath };
}

/**
 * 截取字符串片段（用于 stdout_snippet）
 */
export function snippet(text: string, maxLen = 2000): string {
  if (text.length <= maxLen) {
    return text;
  }
  return text.slice(-maxLen) + '\n... [truncated]';
}
