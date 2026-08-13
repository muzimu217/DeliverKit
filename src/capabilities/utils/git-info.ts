/**
 * Git Info Collector - Git信息采集工具
 *
 * 功能：
 * - 采集当前Git仓库的提交信息
 * - 检测工作区状态（是否有未提交修改）
 * - 获取远程仓库信息
 * - 脱敏处理敏感信息
 */

import { runCommand } from './command.js';

export interface GitInfo {
  commit_sha: string;
  commit_message: string;
  branch?: string;
  tag?: string;
  remote_url?: string;
  is_dirty: boolean;
  dirty_files: string[];
}

/**
 * 检查当前目录是否在Git仓库中
 */
export function isGitRepository(sourceDir: string): boolean {
  const result = runCommand('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: sourceDir,
  });
  return result.success && result.stdout.trim() === 'true';
}

/**
 * 获取Git信息
 */
export function getGitInfo(sourceDir: string): GitInfo | null {
  // 检查是否在Git仓库中
  if (!isGitRepository(sourceDir)) {
    return null;
  }

  // 获取当前提交SHA
  const shaResult = runCommand('git', ['rev-parse', 'HEAD'], { cwd: sourceDir });
  if (!shaResult.success) {
    return null;
  }
  const commit_sha = shaResult.stdout.trim();

  // 获取提交消息
  const msgResult = runCommand('git', ['log', '-1', '--pretty=%B'], { cwd: sourceDir });
  const commit_message = msgResult.success ? msgResult.stdout.trim() : '';

  // 获取当前分支
  const branchResult = runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: sourceDir,
  });
  const branch = branchResult.success ? branchResult.stdout.trim() : undefined;

  // 获取当前标签
  const tagResult = runCommand('git', ['describe', '--tags', '--exact-match'], {
    cwd: sourceDir,
  });
  const tag = tagResult.success ? tagResult.stdout.trim() : undefined;

  // 获取远程仓库URL
  const remoteResult = runCommand('git', ['config', '--get', 'remote.origin.url'], {
    cwd: sourceDir,
  });
  let remote_url = remoteResult.success ? remoteResult.stdout.trim() : undefined;

  // 脱敏：如果URL包含token，移除
  if (remote_url) {
    remote_url = sanitizeRemoteUrl(remote_url);
  }

  // 检查工作区状态
  const statusResult = runCommand('git', ['status', '--porcelain'], { cwd: sourceDir });
  const is_dirty = statusResult.success && statusResult.stdout.trim().length > 0;

  // 获取未提交文件列表（脱敏）
  let dirty_files: string[] = [];
  if (is_dirty && statusResult.success) {
    dirty_files = statusResult.stdout
      .trim()
      .split('\n')
      .slice(0, 10) // 最多10个，避免泄露太多
      .map((line) => line.substring(3).trim()); // 移除状态标记
  }

  return {
    commit_sha,
    commit_message,
    branch,
    tag,
    remote_url,
    is_dirty,
    dirty_files,
  };
}

/**
 * 获取Git配置的用户信息
 */
export function getGitUser(sourceDir: string): { name?: string; email?: string } {
  const nameResult = runCommand('git', ['config', 'user.name'], { cwd: sourceDir });
  const emailResult = runCommand('git', ['config', 'user.email'], { cwd: sourceDir });

  return {
    name: nameResult.success ? nameResult.stdout.trim() : undefined,
    email: emailResult.success ? emailResult.stdout.trim() : undefined,
  };
}

/**
 * 脱敏远程仓库URL
 *
 * 移除可能存在的token/密码
 */
function sanitizeRemoteUrl(url: string): string {
  // 处理 https://token@github.com/... 格式
  if (url.includes('@') && url.includes('://')) {
    const protocol = url.split('://')[0];
    const rest = url.split('@')[1];
    return `${protocol}://<redacted>@${rest}`;
  }

  // 处理 git@github.com:password/repo.git 格式（不太常见）
  if (url.includes(':') && url.includes('@') && !url.startsWith('http')) {
    const parts = url.split(':');
    if (parts.length >= 3) {
      // 有密码，脱敏
      return `${parts[0]}:<redacted>:${parts[parts.length - 1]}`;
    }
  }

  return url;
}

/**
 * 检查是否有未推送的提交
 */
export function hasUnpushedCommits(sourceDir: string): boolean {
  const result = runCommand(
    'git',
    ['log', '@{u}..HEAD', '--oneline'],
    { cwd: sourceDir }
  );
  return result.success && result.stdout.trim().length > 0;
}

/**
 * 获取最近的标签
 */
export function getLatestTag(sourceDir: string): string | null {
  const result = runCommand('git', ['describe', '--tags', '--abbrev=0'], {
    cwd: sourceDir,
  });
  return result.success ? result.stdout.trim() : null;
}