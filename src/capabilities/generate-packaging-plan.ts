/**
 * generate_packaging_plan - plan orchestration only.
 *
 * inspect -> resolve adapter -> derive decisions -> render -> write.
 */

import * as path from 'node:path';
import { inspectProject } from './inspect-project.js';
import { assertSourceDir, PathValidationError, pathExists } from './utils/filesystem.js';
import type { GeneratePackagingPlanOutput } from './types.js';
import { loadSystemAdapterResult, resolveSystemAdapterId } from '../systems/adapter-loader.js';
import { deriveDecisions, deriveNextActions, deriveRisks } from './plan-decision-engine.js';
import { renderForgeMd } from './forge-renderer.js';
import { writePlan } from './plan-writer.js';

export async function generatePackagingPlan(
  sourceDir: string,
  goals: string[],
  targetEnvironment?: string
): Promise<GeneratePackagingPlanOutput> {
  try {
    assertSourceDir(sourceDir);
  } catch (error) {
    if (error instanceof PathValidationError) {
      return {
        status: 'failed',
        error: {
          code: error.code,
          summary: error.message,
          suggested_fix: '请提供有效的项目根目录路径',
        },
      };
    }
    throw error;
  }

  const inspection = await inspectProject(sourceDir);
  if (inspection.status === 'failed') {
    return { status: 'failed', error: inspection.error };
  }

  // 未显式指定目标环境时，按工程特征自动推断（鸿蒙工程 → harmonyos）
  if (!targetEnvironment && pathExists(path.join(sourceDir, 'AppScope', 'app.json5'))) {
    targetEnvironment = 'harmonyos';
  }

  const adapterId = resolveSystemAdapterId(targetEnvironment);
  if (!adapterId) {
    return {
      status: 'failed',
      error: {
        code: 'invalid_input',
        summary: `尚不支持目标环境: ${targetEnvironment}`,
        suggested_fix: '当前支持 Ubuntu 服务器和 HarmonyOS，例如 ubuntu-22.04 或 harmonyos-12',
      },
    };
  }

  const adapterResult = loadSystemAdapterResult(adapterId);
  if (!adapterResult.ok) {
    return {
      status: 'failed',
      error: {
        code: adapterResult.error.code,
        summary: adapterResult.error.summary,
        suggested_fix: '检查适配器注册信息、规则文件路径与 YAML 结构后重试',
      },
    };
  }
  const rules = adapterResult.adapter.rules;
  const decisions = deriveDecisions(goals, inspection, rules, targetEnvironment);
  const risks = deriveRisks(rules, goals);
  const planPath = path.join(sourceDir, 'Forge.md');
  const writeResult = writePlan(planPath, renderForgeMd({
    sourceDir,
    inspectResult: inspection,
    goals,
    decisions,
    risks,
    platform: rules?.平台,
  }));

  if (!writeResult.ok) {
    return {
      status: 'failed',
      error: {
        code: 'unknown_error',
        summary: `无法写入 Forge.md: ${writeResult.reason}`,
        suggested_fix: '检查目标目录写权限，或手动删除现有 Forge.md 后重试',
      },
    };
  }

  return {
    status: 'success',
    plan_path: planPath,
    summary: `已生成 ${inspection.language || '未知语言'} 项目的打包计划，目标产物：${goals.join(', ')}`,
    warnings: inspection.warnings || [],
    decision_basis: decisions,
    next_actions: deriveNextActions(goals, inspection, rules),
  };
}
