#!/usr/bin/env node

/**
 * DeliverKit MCP Server - Main Entry
 *
 * AI 交付大脑：给 Agent 用的全生态交付编排工具。
 * Agent 通过 MCP 协议接入，先把一个产品合法地送达每一个生态。
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

// Tool definitions and executor
import { registerTools } from './tools/registry.js';
import { executeTool } from './tools/executor.js';
import { SERVER_NAME, SERVER_VERSION } from './server-metadata.js';

/**
 * Create MCP Server instance
 */
const server = new Server(
  { name: SERVER_NAME, version: SERVER_VERSION },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Handler: List available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = registerTools();
  return { tools };
});

/**
 * Handler: Execute tool call
 *
 * 使用 executor 路由（协议层）
 * - 编排/构建类工具强制校验 plan_path
 * - 所有调用返回结构化结果
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // Validate tool exists
    const tools = registerTools();
    const tool = tools.find((t) => t.name === name);

    if (!tool) {
      throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
    }

    // Execute tool (with plan_path enforcement in executor)
    const result = await executeTool(name, args || {});

    // Return structured result as JSON (Agent 可解析)。
    // isError 让客户端无需解析 JSON body 就能识别失败，
    // 结构化的 status/code/suggested_fix 仍在 text 里保留。
    return {
      isError: result.status === 'failed',
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${(error as Error).message}`);
  }
});

/**
 * Start server with stdio transport
 */
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
  console.error('DeliverKit MCP Server ready for AI agent connections');
console.error('已注册工具：inspect_project, generate_packaging_plan, get_ecosystem_knowledge, pack_deb, pack_rpm, pack_appimage, generate_ci_workflow, pack_windows_msi, pack_macos, pack_harmonyos, generate_release_manifest');
}

main().catch((error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});
