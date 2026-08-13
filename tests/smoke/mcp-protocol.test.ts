/**
 * MCP 协议层冒烟测试
 * 验证：工具可被发现、输入校验生效、结构化输出
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { executeTool } from '../../src/mcp-server/tools/executor.js';
import { registerTools } from '../../src/mcp-server/tools/registry.js';

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-smoke-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('MCP 协议层冒烟测试', () => {
  describe('工具发现测试', () => {
    it('能列出全部规划类工具', () => {
      const tools = registerTools();
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain('inspect_project');
      expect(toolNames).toContain('generate_packaging_plan');
      expect(tools.length).toBe(2);
    });

    it('所有工具都有正确的 Schema', () => {
      const tools = registerTools();

      tools.forEach((tool) => {
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
        expect(tool.inputSchema.required).toBeDefined();
        expect(tool.description).toBeTruthy();
      });
    });
  });

  describe('输入校验测试', () => {
    it('inspect_project 类型错误返回 invalid_input', async () => {
      const malformed = await executeTool('inspect_project', { source_dir: 42 });
      expect(malformed.error?.code).toBe('invalid_input');
    });

    it('规划类工具不强制 plan_path', async () => {
      const result = await executeTool('inspect_project', { source_dir: tmpDir });

      expect(result.status).toBe('success');
      expect(result.error).toBeUndefined();
    });
  });

  describe('结构化输出测试', () => {
    it('inspect_project 返回结构化结果（含 decision_basis）', async () => {
      const result = (await executeTool('inspect_project', { source_dir: tmpDir })) as Record<
        string,
        unknown
      >;

      expect(result).toHaveProperty('status');
      expect(result.status).toBe('success');
      expect(result.decision_basis).toBeDefined();
    });
  });

  describe('错误结构验证', () => {
    it('未知工具返回 unknown_error', async () => {
      const result = await executeTool('unknown_tool', {});

      expect(result.status).toBe('failed');
      expect(result.error?.code).toBe('unknown_error');
    });
  });
});
