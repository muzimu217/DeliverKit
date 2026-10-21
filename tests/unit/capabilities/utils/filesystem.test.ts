/**
 * Filesystem 单元测试
 *
 * 越界检查（assertWithinRoot）是防 Agent 误传路径的第一道闸，重点覆盖。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  pathExists,
  resolvePath,
  assertWithinRoot,
  assertSourceDir,
  assertFileExists,
  listFiles,
  readTextFile,
  PathValidationError,
} from '../../../../src/capabilities/utils/filesystem.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgekit-fs-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('pathExists', () => {
  it('存在的路径返回 true', () => {
    expect(pathExists(tmpDir)).toBe(true);
  });

  it('不存在的路径返回 false', () => {
    expect(pathExists(path.join(tmpDir, 'nope'))).toBe(false);
  });
});

describe('resolvePath', () => {
  it('解析相对片段为绝对路径', () => {
    const resolved = resolvePath(path.join(tmpDir, 'sub', '..', 'file.txt'));
    expect(resolved).toBe(path.join(tmpDir, 'file.txt'));
  });
});

describe('assertWithinRoot', () => {
  it('根内路径放行', () => {
    expect(() =>
      assertWithinRoot(path.join(tmpDir, 'a', 'b.txt'), tmpDir)
    ).not.toThrow();
  });

  it('与根相同的路径放行', () => {
    expect(() => assertWithinRoot(tmpDir, tmpDir)).not.toThrow();
  });

  it('根外路径抛 path_out_of_bounds', () => {
    expect(() => assertWithinRoot('/etc/passwd', tmpDir)).toThrowError(
      PathValidationError
    );
    try {
      assertWithinRoot('/etc/passwd', tmpDir);
      expect.unreachable('应当抛出');
    } catch (err) {
      expect((err as PathValidationError).code).toBe('path_out_of_bounds');
    }
  });

  it('仅前缀同名的兄弟目录不算根内（/a 与 /abc）', () => {
    const sibling = `${tmpDir}-sibling`;
    try {
      // sibling 前缀与 tmpDir 相同但不是子路径，必须被拦截
      assertWithinRoot(sibling, tmpDir);
      expect.unreachable('应当抛出');
    } catch (err) {
      expect((err as PathValidationError).code).toBe('path_out_of_bounds');
    }
  });

  it('报错信息同时包含原始目标与根目录', () => {
    try {
      assertWithinRoot('/etc/passwd', tmpDir);
      expect.unreachable('应当抛出');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain('/etc/passwd');
      expect(message).toContain(tmpDir);
    }
  });
});

describe('assertSourceDir', () => {
  it('存在的目录放行', () => {
    expect(() => assertSourceDir(tmpDir)).not.toThrow();
  });

  it('不存在的路径抛 path_not_found', () => {
    try {
      assertSourceDir(path.join(tmpDir, 'missing'));
      expect.unreachable('应当抛出');
    } catch (err) {
      expect((err as PathValidationError).code).toBe('path_not_found');
    }
  });

  it('文件而非目录抛 invalid_path', () => {
    const file = path.join(tmpDir, 'plain.txt');
    fs.writeFileSync(file, 'x');
    try {
      assertSourceDir(file);
      expect.unreachable('应当抛出');
    } catch (err) {
      expect((err as PathValidationError).code).toBe('invalid_path');
    }
  });
});

describe('assertFileExists', () => {
  it('存在的文件放行', () => {
    const file = path.join(tmpDir, 'ok.txt');
    fs.writeFileSync(file, 'x');
    expect(() => assertFileExists(file)).not.toThrow();
  });

  it('缺失文件默认抛 path_not_found', () => {
    try {
      assertFileExists(path.join(tmpDir, 'gone.txt'));
      expect.unreachable('应当抛出');
    } catch (err) {
      expect((err as PathValidationError).code).toBe('path_not_found');
    }
  });

  it('可指定错误码透传给上层', () => {
    try {
      assertFileExists(path.join(tmpDir, 'gone.txt'), 'plan_not_found');
      expect.unreachable('应当抛出');
    } catch (err) {
      expect((err as PathValidationError).code).toBe('plan_not_found');
    }
  });
});

describe('listFiles', () => {
  it('返回目录内条目', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'a');
    fs.writeFileSync(path.join(tmpDir, 'b.txt'), 'b');

    const files = listFiles(tmpDir);
    expect(files).toContain('a.txt');
    expect(files).toContain('b.txt');
  });

  it('目录不存在返回空数组而不抛错', () => {
    expect(listFiles(path.join(tmpDir, 'no-such-dir'))).toEqual([]);
  });
});

describe('readTextFile', () => {
  it('返回文件内容', () => {
    const file = path.join(tmpDir, 'note.md');
    fs.writeFileSync(file, 'hello');
    expect(readTextFile(file)).toBe('hello');
  });

  it('缺失文件返回 null', () => {
    expect(readTextFile(path.join(tmpDir, 'gone.txt'))).toBeNull();
  });
});
