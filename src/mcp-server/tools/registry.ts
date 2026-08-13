/**
 * MCP tool registry.
 *
 * Input contracts live in schemas.ts. This module only supplies MCP metadata
 * and converts those contracts to protocol JSON Schema at the boundary.
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ToolInputSchemas, type ToolName } from './schemas.js';

const descriptions: Record<ToolName, string> = {
  inspect_project:
    '分析项目目录，识别语言、入口和已有打包配置，返回推荐的跨生态交付目标。',
  generate_packaging_plan:
    '生成项目级 Forge.md 交付契约，记录目标生态、产物、决策依据和风险（计划先行，后续构建工具必须基于此契约）。',
};

export function registerTools(): Tool[] {
  return (Object.keys(ToolInputSchemas) as ToolName[]).map((name) => {
    const inputSchema = zodToJsonSchema(ToolInputSchemas[name], {
      target: 'jsonSchema7',
      $refStrategy: 'none',
    }) as Tool['inputSchema'];

    return {
      name,
      description: descriptions[name],
      inputSchema: { ...inputSchema, required: inputSchema.required ?? [] },
    };
  });
}

/**
 * 是否为构建类工具（必须基于已存在的 Forge.md 契约执行）。
 * 当前阶段只暴露规划类工具；pack_* / build_* 接入后在此登记。
 */
export function isBuildTool(_toolName: string): boolean {
  return false;
}

export function isToolName(value: string): value is ToolName {
  return Object.prototype.hasOwnProperty.call(ToolInputSchemas, value);
}
