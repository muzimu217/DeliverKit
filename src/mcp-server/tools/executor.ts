/**
 * Tool Executor - CallTool handler.
 *
 * DeliverKit 当前路由规划、编排与构建工具：
 * - inspect_project
 * - generate_packaging_plan
 *
 * Plan-before-build 机制：编排与构建工具都强制校验 plan_path（Forge.md
 * 交付契约必须先存在）。
 */

import * as fs from 'fs';
import { isBuildTool, isToolName } from './registry.js';
import { ToolInputSchemas, type ToolName } from './schemas.js';
import type { ForgeKitResult } from '../../capabilities/types.js';

import { inspectProject } from '../../capabilities/inspect-project.js';
import { generatePackagingPlan } from '../../capabilities/generate-packaging-plan.js';
import { getEcosystemKnowledge } from '../../capabilities/get-ecosystem-knowledge.js';
import { packDeb } from '../../capabilities/pack-deb.js';
import { packRpm } from '../../capabilities/pack-rpm.js';
import { packAppImage } from '../../capabilities/pack-appimage.js';
import { generateCiWorkflow } from '../../capabilities/generate-ci-workflow.js';
import { packWindowsMsi } from '../../capabilities/pack-windows-msi.js';
import { packMacos } from '../../capabilities/pack-macos.js';
import { packHarmonyos } from '../../capabilities/pack-harmonyos.js';
import { generateReleaseManifest } from '../../capabilities/generate-release-manifest.js';

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
  // 未预期的异常（权限、磁盘、依赖 bug）也必须落回统一错误结构，
  // 否则 Agent 只会收到一句 InternalError，code / suggested_fix 全部丢失。
  try {
    return await dispatch(name, input);
  } catch (error) {
    return unexpectedFailure(name, error);
  }
}

function dispatch(
  name: ToolName,
  input: Record<string, unknown>
): ForgeKitResult | Promise<ForgeKitResult> {
  switch (name) {
    case 'inspect_project':
      return inspectProject(input.source_dir as string, {
        language: input.language as string | undefined,
        entrypoints: input.entrypoints as string[] | undefined,
      });

    case 'generate_packaging_plan':
      return generatePackagingPlan(
        input.source_dir as string,
        input.goals as string[],
        input.target_environment as string | undefined,
        {
          language: input.language as string | undefined,
          entrypoints: input.entrypoints as string[] | undefined,
        }
      );

    case 'get_ecosystem_knowledge':
      return getEcosystemKnowledge(input.ecosystem as string | undefined);

    case 'pack_deb':
      return packDeb({
        sourceDir: input.source_dir as string,
        planPath: input.plan_path as string,
        outputDir: input.output_dir as string | undefined,
        packageName: input.package_name as string | undefined,
      });

    case 'pack_rpm':
      return packRpm({
        sourceDir: input.source_dir as string,
        planPath: input.plan_path as string,
        outputDir: input.output_dir as string | undefined,
        packageName: input.package_name as string | undefined,
      });

    case 'pack_appimage':
      return packAppImage({
        sourceDir: input.source_dir as string,
        planPath: input.plan_path as string,
        outputDir: input.output_dir as string | undefined,
        packageName: input.package_name as string | undefined,
      });

    case 'generate_ci_workflow':
      return generateCiWorkflow({
        sourceDir: input.source_dir as string,
        planPath: input.plan_path as string,
        outputPath: input.output_path as string | undefined,
        overwrite: input.overwrite as boolean | undefined,
      });

    case 'pack_windows_msi':
      return packWindowsMsi({
        sourceDir: input.source_dir as string,
        planPath: input.plan_path as string,
        outputDir: input.output_dir as string | undefined,
        packageName: input.package_name as string | undefined,
      });

    case 'pack_macos':
      return packMacos({
        sourceDir: input.source_dir as string,
        planPath: input.plan_path as string,
        outputDir: input.output_dir as string | undefined,
        packageName: input.package_name as string | undefined,
        artifact: input.artifact as 'dmg' | 'pkg' | undefined,
      });

    case 'pack_harmonyos':
      return packHarmonyos({
        sourceDir: input.source_dir as string,
        planPath: input.plan_path as string,
        outputDir: input.output_dir as string | undefined,
        artifact: input.artifact as 'hap' | 'app' | undefined,
      });

    case 'generate_release_manifest':
      return generateReleaseManifest({
        sourceDir: input.source_dir as string,
        planPath: input.plan_path as string,
        resultsDir: input.results_dir as string | undefined,
        outputPath: input.output_path as string | undefined,
      });

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

/**
 * 未预期异常的统一出口。文件系统权限、磁盘写满这类失败常见于首次使用，
 * 用户需要的是「哪一步失败了、怎么办」，而不是一条裸的 Error message。
 */
export function unexpectedFailure(name: string, error: unknown): ForgeKitResult {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: unknown } | null)?.code;
  const permissionDenied = code === 'EACCES' || code === 'EPERM';
  const diskFull = code === 'ENOSPC';
  return {
    status: 'failed',
    error: {
      code: 'unknown_error',
      summary: `${name} 执行中出现未预期错误: ${message}`,
      suggested_fix: permissionDenied
        ? '当前进程对该路径没有写权限：换一个可写的 output_dir，或修正目录属主'
        : diskFull
          ? '磁盘空间不足：清理空间或指定其他分区上的 output_dir 后重试'
          : '这属于未预期错误，请附带此摘要在 GitHub issue 中反馈：https://github.com/muzimu217/DeliverKit/issues',
      log_excerpt: error instanceof Error && error.stack ? error.stack.split('\n').slice(0, 5).join('\n') : undefined,
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
