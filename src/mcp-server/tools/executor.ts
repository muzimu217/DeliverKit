/**
 * Tool Executor - CallTool handler.
 *
 * DeliverKit 当前路由两个规划类工具：
 * - inspect_project
 * - generate_packaging_plan
 *
 * Plan-before-build 机制保留：构建类工具（pack_* / build_*）接入后，
 * 会在此强制校验 plan_path（Forge.md 交付契约必须先存在）。
 */

import * as fs from 'fs';
import { isBuildTool, isToolName } from './registry.js';
import { ToolInputSchemas } from './schemas.js';
import type { ForgeKitResult } from '../../capabilities/types.js';

import { inspectProject } from '../../capabilities/inspect-project.js';
import { generatePackagingPlan } from '../../capabilities/generate-packaging-plan.js';
import { getEcosystemKnowledge } from '../../capabilities/get-ecosystem-knowledge.js';

/**
 * Execute tool call
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<ForgeKitResult> {
  if (!isToolName(name)) {
    return {
      status: 'failed',
      error: { code: 'unknown_error', summary: `未知工具: ${name}` },
    };
  }

  // Preserve the public Plan-before-build error contract. Other malformed
  // fields are handled by the shared Zod contract below.
  if (isBuildTool(name) && !args.plan_path) {
    return planNotFound();
  }

  const parsed = ToolInputSchemas[name].safeParse(args);
  if (!parsed.success) {
    return invalidInput(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`));
  }
  const input = parsed.data as Record<string, unknown>;

  // ========== Step 1: 构建类工具强制校验 plan_path ==========
  if (isBuildTool(name)) {
    const planPath = input.plan_path as string | undefined;

    if (!planPath) {
      return planNotFound();
    }
    if (!fs.existsSync(planPath)) {
      return planNotFound(planPath);
    }
  }

  // ========== Step 2: 路由到具体工具 ==========
  switch (name) {
    case 'inspect_project':
      return inspectProject(input.source_dir as string);

    case 'generate_packaging_plan':
      return generatePackagingPlan(
        input.source_dir as string,
        input.goals as string[],
        input.target_environment as string | undefined
      );

    case 'get_ecosystem_knowledge':
      return getEcosystemKnowledge(input.ecosystem as string | undefined);

  }
}

function invalidInput(issues: string[]): ForgeKitResult {
  return {
    status: 'failed',
    error: {
      code: 'invalid_input',
      summary: `工具输入无效: ${issues.join('; ')}`,
      suggested_fix: '根据工具定义补齐必填字段并修正字段类型',
    },
  };
}

function planNotFound(planPath?: string): ForgeKitResult {
  return {
    status: 'failed',
    error: {
      code: 'plan_not_found',
      summary: planPath
        ? `Forge.md 交付契约文件不存在: ${planPath}`
        : 'Forge.md 交付契约文件不存在',
      suggested_fix: '请先调用 generate_packaging_plan 生成 Forge.md，再执行构建',
      plan_correction: '构建类工具必须传入已存在的 plan_path（Plan-before-build 强制约束）',
    },
    next_actions: ['调用 generate_packaging_plan 生成 Forge.md'],
  };
}
