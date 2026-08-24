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
  /** execFileSync 因 timeout 被杀死。超时与真实构建失败必须能区分，否则用户会去排查自己的代码。 */
  timedOut: boolean;
  /** 终止信号（如 SIGTERM），未被信号终止时为 null。 */
  signal: string | null;
  /** spawn 层错误码（如 ENOENT、ETIMEDOUT），无则为 null。 */
  errorCode: string | null;
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
    execFileSync(checkCmd, [cmd], { stdio: 'ignore', timeout: 10_000 });
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
  options: { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv } = {}
): CommandResult {
  const { cwd, timeout = 120000 } = options;

  try {
    const stdout = execFileSync(command, args, {
      cwd,
      timeout,
      env: options.env ? { ...process.env, ...options.env } : undefined,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    return {
      exitCode: 0,
      stdout: stdout || '',
      stderr: '',
      success: true,
      timedOut: false,
      signal: null,
      errorCode: null,
    };
  } catch (error) {
    const failure = normalizeCommandError(error);
    return {
      exitCode: failure.status,
      stdout: failure.stdout,
      stderr: failure.stderr,
      success: false,
      timedOut: failure.timedOut,
      signal: failure.signal,
      errorCode: failure.errorCode,
    };
  }
}

function normalizeCommandError(error: unknown): {
  status: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  signal: string | null;
  errorCode: string | null;
} {
  const record = isRecord(error) ? error : {};
  const message = error instanceof Error ? error.message : String(error);
  const signal = typeof record.signal === 'string' ? record.signal : null;
  const errorCode = typeof record.code === 'string' ? record.code : null;
  // Node 在 timeout 到达时用 SIGTERM 杀掉子进程，此时 status 为 null，
  // 归一成退出码 1 会让超时看起来像普通构建失败。
  const timedOut = record.killed === true || errorCode === 'ETIMEDOUT' || signal === 'SIGTERM';
  return {
    status: typeof record.status === 'number' ? record.status : 1,
    stdout: outputToString(record.stdout),
    stderr: outputToString(record.stderr) || message,
    timedOut,
    signal,
    errorCode,
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
    redactedArgs?: string[];
    env?: NodeJS.ProcessEnv;
  } = {}
): CommandLogResult {
  const { logDir = 'dist/forgekit/logs', logFileName = `${command}-${Date.now()}.log` } = options;

  // 确保日志目录存在
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.resolve(logDir, logFileName);

  // 先创建日志，再把子进程 stdout/stderr 直接连接到文件。这样镜像拉取等长任务
  // 执行期间就能看到进度，而不是等 execFileSync 返回后才一次性落盘。
  const logHeader = [
    `# Command: ${command} ${(options.redactedArgs ?? args).join(' ')}`,
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
      env: options.env ? { ...process.env, ...options.env } : undefined,
      stdio: ['ignore', logFd, logFd],
    });
    result = { exitCode: 0, stdout: '', stderr: '', success: true, timedOut: false, signal: null, errorCode: null };
  } catch (error) {
    const failure = normalizeCommandError(error);
    result = {
      exitCode: failure.status,
      stdout: '',
      stderr: failure.stderr,
      success: false,
      timedOut: failure.timedOut,
      signal: failure.signal,
      errorCode: failure.errorCode,
    };
  } finally {
    fs.closeSync(logFd);
  }

  const liveOutput = fs.readFileSync(logPath, 'utf-8').slice(logHeader.length);
  fs.appendFileSync(
    logPath,
    `\n# Finished: ${new Date().toISOString()}\n# Exit code: ${result.exitCode}${result.timedOut ? ' (timed out)' : ''}\n`,
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

/**
 * 取日志尾部的有效内容，用于把失败原因直接放进错误结果。
 *
 * 只给日志路径等于把排错成本转嫁给用户：Agent 读不到原因，人要去翻文件。
 * 尾部若干行通常正是报错本身（编译器错误、apt 报错、dpkg 报错）。
 */
export function logTail(text: string, maxLines = 40, maxChars = 4000): string {
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  const tail = lines.slice(-maxLines).join('\n');
  return tail.length > maxChars ? `... [truncated]\n${tail.slice(-maxChars)}` : tail;
}

/**
 * 把一次失败的命令结果转成人类和 Agent 都能直接读懂的摘要。
 */
export function describeCommandFailure(result: CommandResult, timeoutMs?: number): string {
  if (result.timedOut) {
    const minutes = timeoutMs ? Math.round(timeoutMs / 60_000) : undefined;
    return minutes ? `执行超时（超过 ${minutes} 分钟上限被终止）` : '执行超时被终止';
  }
  if (result.errorCode === 'ENOENT') {
    return '命令不存在（ENOENT）';
  }
  return `退出码 ${result.exitCode}`;
}
