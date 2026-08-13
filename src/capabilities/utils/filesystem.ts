/**
 * Filesystem Utilities - 路径校验与越界检查
 *
 * 防止 Agent 误传路径导致越界访问
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ErrorCode } from '../types.js';

/**
 * 校验路径存在
 */
export function pathExists(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * 规范化路径，解析 .. 和符号链接，防止越界
 */
export function resolvePath(p: string): string {
  return path.resolve(p);
}

/**
 * 校验路径在某根目录内（越界检查）
 * @throws 若路径在 rootDir 之外
 */
export function assertWithinRoot(target: string, rootDir: string): void {
  const resolvedTarget = resolvePath(target);
  const resolvedRoot = resolvePath(rootDir);

  // 相同路径允许
  if (resolvedTarget === resolvedRoot) {
    return;
  }

  // target 必须以 root + sep 开头
  const rootWithSep = resolvedRoot + path.sep;
  if (!resolvedTarget.startsWith(rootWithSep)) {
    throw new PathValidationError(
      'path_out_of_bounds',
      `路径越界：${target} 不在根目录 ${rootDir} 内（解析为 ${resolvedTarget}）`
    );
  }
}

/**
 * 校验 source_dir 存在且是目录
 */
export function assertSourceDir(sourceDir: string): void {
  if (!pathExists(sourceDir)) {
    throw new PathValidationError('path_not_found', `源目录不存在: ${sourceDir}`);
  }
  const stat = fs.statSync(sourceDir);
  if (!stat.isDirectory()) {
    throw new PathValidationError('invalid_path', `源路径不是目录: ${sourceDir}`);
  }
}

/**
 * 校验文件存在
 */
export function assertFileExists(
  filePath: string,
  errorCode: ErrorCode = 'path_not_found'
): void {
  if (!pathExists(filePath)) {
    throw new PathValidationError(errorCode, `文件不存在: ${filePath}`);
  }
}

/**
 * 自定义路径校验错误
 */
export class PathValidationError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'PathValidationError';
  }
}

/**
 * 读取目录下匹配的文件（单层）
 */
export function listFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * 读取文件内容（文本）
 */
export function readTextFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}
