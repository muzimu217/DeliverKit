/**
 * Executor Test - 输入校验 + 真实 inspect_project / generate_packaging_plan 路由
 *
 * DeliverKit 当前只暴露规划类工具；构建类工具（pack_* / build_*）接入后，
 * 会在此补充 plan_path 强制校验用例。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { executeTool } from '../../../src/mcp-server/tools/executor.js';

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-exec-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Executor - 输入校验', () => {
  it('inspect_project 缺少 source_dir 返回 invalid_input', async () => {
    const result = await executeTool('inspect_project', {});

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('invalid_input');
    expect(result.error?.summary).toContain('source_dir');
  });

  it('generate_packaging_plan 字段类型错误返回 invalid_input', async () => {
    const result = await executeTool('generate_packaging_plan', {
      source_dir: tmpDir,
      goals: 'Docker',
    });

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('invalid_input');
    expect(result.error?.summary).toContain('goals');
  });

  it('未知工具返回 unknown_error', async () => {
    const result = await executeTool('unknown_tool', {});

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('unknown_error');
  });
});

describe('Executor - 路由到真实能力', () => {
  it('inspect_project 路由到真实实现并识别语言', async () => {
    const projDir = path.join(tmpDir, 'inspect-target');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'app.py'), 'print("hi")');

    const result = await executeTool('inspect_project', { source_dir: projDir });

    expect(result.status).toBe('success');
    expect((result as { language?: string }).language).toBe('Python');
  });

  it('inspect_project 源目录不存在返回 path_not_found', async () => {
    const result = await executeTool('inspect_project', {
      source_dir: '/nonexistent/xyz',
    });

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('path_not_found');
  });

  it('generate_packaging_plan 为 Python 项目生成 Forge.md', async () => {
    const projDir = path.join(tmpDir, 'plan-target');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'app.py'), 'print("hi")');

    const result = await executeTool('generate_packaging_plan', {
      source_dir: projDir,
      goals: ['deb'],
    });

    expect(result.status).toBe('success');
    expect((result as { plan_path?: string }).plan_path).toContain('Forge.md');
    fs.rmSync(path.join(projDir, 'Forge.md'), { force: true });
  });

  it('get_ecosystem_knowledge 返回已注册生态知识包', async () => {
    const result = await executeTool('get_ecosystem_knowledge', {});

    expect(result.status).toBe('success');
    const output = result as { total?: number; ecosystems?: { id: string }[] };
    expect(output.total).toBeGreaterThanOrEqual(2);
    expect(output.ecosystems?.map((e) => e.id)).toContain('linux/ubuntu');
  });

  it('get_ecosystem_knowledge 查询未注册生态返回 ecosystem_not_found', async () => {
    const result = await executeTool('get_ecosystem_knowledge', { ecosystem: 'desktop/windows' });

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('ecosystem_not_found');
  });
});
