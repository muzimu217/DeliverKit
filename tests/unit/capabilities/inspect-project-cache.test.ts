/**
 * inspectProject 缓存集成测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { inspectProject } from '../../../src/capabilities/inspect-project.js';
import { globalCache } from '../../../src/capabilities/utils/cache.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgekit-inspect-cache-'));
  globalCache.clear();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  globalCache.clear();
});

describe('inspectProject 缓存集成', () => {
  it('首次调用应执行分析', async () => {
    // 准备 Python 项目
    fs.writeFileSync(path.join(tmpDir, 'app.py'), 'print("hello")');
    fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'flask==2.0.0');

    const result = await inspectProject(tmpDir);

    expect(result.status).toBe('success');
    expect(result.language).toBe('Python');
    expect(result.entrypoints).toContain('app.py');
  });

  it('第二次调用应从缓存返回', async () => {
    // 准备项目
    fs.writeFileSync(path.join(tmpDir, 'main.py'), 'print("hello")');

    // 第一次调用（缓存未命中）
    const result1 = await inspectProject(tmpDir);

    // 第二次调用（缓存命中）
    const result2 = await inspectProject(tmpDir);

    // 结果应相同
    expect(result2).toEqual(result1);

    // 验证缓存已设置
    const stats = globalCache.stats();
    expect(stats.size).toBe(1);
    expect(stats.keys).toContain(tmpDir);
  });

  it('文件修改后缓存应失效', async () => {
    // 准备项目
    fs.writeFileSync(path.join(tmpDir, 'app.py'), 'print("v1")');

    const result1 = await inspectProject(tmpDir);
    expect(result1.language).toBe('Python');

    // 等待 mtime 更新
    await new Promise((r) => setTimeout(r, 10));

    // 修改文件
    fs.writeFileSync(path.join(tmpDir, 'app.py'), 'print("v2")');

    // 缓存应失效，重新分析
    const result2 = await inspectProject(tmpDir);

    // 结果仍应为 Python，但这次是重新分析的
    expect(result2.language).toBe('Python');
    expect(result2).toEqual(result1); // 内容相同
  });

  it('添加新文件后缓存应失效', async () => {
    // 初始项目
    fs.writeFileSync(path.join(tmpDir, 'app.py'), 'print("hello")');

    const result1 = await inspectProject(tmpDir);
    expect(result1.existing_packaging?.requirements_txt).toBeFalsy();

    // 等待 mtime 更新
    await new Promise((r) => setTimeout(r, 10));

    // 添加 requirements.txt
    fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'flask');

    const result2 = await inspectProject(tmpDir);
    expect(result2.existing_packaging?.requirements_txt).toBe(true);
  });

  it('错误结果也应缓存（避免重复错误）', async () => {
    // 尝试分析不存在的目录
    const invalidPath = path.join(tmpDir, 'nonexistent');

    const result1 = await inspectProject(invalidPath);
    expect(result1.status).toBe('failed');

    // 第二次应从缓存返回错误
    const result2 = await inspectProject(invalidPath);
    expect(result2).toEqual(result1);
  });

  it('不同项目应独立缓存', async () => {
    // 项目 1
    const dir1 = path.join(tmpDir, 'project1');
    fs.mkdirSync(dir1);
    fs.writeFileSync(path.join(dir1, 'app.py'), '');

    // 项目 2
    const dir2 = path.join(tmpDir, 'project2');
    fs.mkdirSync(dir2);
    fs.writeFileSync(path.join(dir2, 'package.json'), '{}');

    const result1 = await inspectProject(dir1);
    const result2 = await inspectProject(dir2);

    expect(result1.language).toBe('Python');
    expect(result2.language).toBe('JavaScript');

    const stats = globalCache.stats();
    expect(stats.size).toBe(2);
  });
});