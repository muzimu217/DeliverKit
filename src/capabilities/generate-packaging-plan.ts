/**
 * generate_packaging_plan - plan orchestration, 由生态知识包驱动。
 *
 * inspect -> resolve delivery targets -> load knowledge -> derive decisions -> render -> write.
 * 支持多目标：goals 中的每个生态/产物目标会解析为独立的 delivery_target。
 */

import * as path from 'node:path';
import { inspectProject } from './inspect-project.js';
import { assertSourceDir, PathValidationError, pathExists } from './utils/filesystem.js';
import type { GeneratePackagingPlanOutput, DeliveryTargetSummary } from './types.js';
import {
  loadEcosystemResult,
  resolveEcosystemId,
  selectArtifactIds,
} from '../knowledge/ecosystem-loader.js';
import type { EcosystemKnowledge } from '../knowledge/ecosystem-schema.js';
import {
  deriveDecisionBasis,
  deriveNextActions,
  deriveRisks,
  type DeliveryTargetPlan,
} from './plan-decision-engine.js';
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

  const resolution = resolveDeliveryTargets(goals, targetEnvironment);
  if (!resolution.ok) {
    return { status: 'failed', error: resolution.error };
  }
  const { targets, warnings } = resolution;

  const risks = deriveRisks(targets);
  const nextActions = deriveNextActions(targets, inspection);
  const decisions = deriveDecisionBasis(targets);
  const planPath = path.join(sourceDir, 'Forge.md');

  const writeResult = writePlan(
    planPath,
    renderForgeMd({
      sourceDir,
      inspectResult: inspection,
      deliveryTargets: targets,
      risks,
      nextActions,
    })
  );

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
    summary: `已生成 ${inspection.language || '未知语言'} 项目的交付计划，目标生态：${targets
      .map((t) => t.id)
      .join(', ')}`,
    warnings: [...(inspection.warnings || []), ...warnings],
    decision_basis: decisions,
    next_actions: nextActions,
    delivery_targets: targets.map(toDeliveryTargetSummary),
  };
}

interface ResolveResult {
  ok: true;
  targets: DeliveryTargetPlan[];
  warnings: string[];
}

interface ResolveError {
  ok: false;
  error: {
    code: 'invalid_input' | 'ecosystem_not_found' | 'ecosystem_knowledge_unreadable' | 'ecosystem_knowledge_invalid';
    summary: string;
    suggested_fix?: string;
  };
}

function resolveDeliveryTargets(
  goals: string[],
  targetEnvironment?: string
): ResolveResult | ResolveError {
  const goalList =
    goals.length > 0 ? goals : targetEnvironment ? [targetEnvironment] : ['ubuntu'];

  const byEcosystem = new Map<string, { knowledge: EcosystemKnowledge; artifacts: Set<string> }>();
  const unresolved: string[] = [];

  for (const goal of goalList) {
    const ecosystemId = resolveEcosystemId(goal);
    if (!ecosystemId) {
      unresolved.push(goal);
      continue;
    }

    let entry = byEcosystem.get(ecosystemId);
    if (!entry) {
      const loadResult = loadEcosystemResult(ecosystemId);
      if (!loadResult.ok) {
        return {
          ok: false,
          error: {
            code: loadResult.error.code,
            summary: loadResult.error.summary,
            suggested_fix: '检查生态知识包注册信息与 YAML 结构后重试',
          },
        };
      }
      entry = { knowledge: loadResult.knowledge, artifacts: new Set() };
      byEcosystem.set(ecosystemId, entry);
    }

    for (const artifactId of selectArtifactIds(goal, entry.knowledge)) {
      entry.artifacts.add(artifactId);
    }
  }

  const targets: DeliveryTargetPlan[] = [...byEcosystem.entries()].map(([id, entry]) => ({
    id,
    knowledge: entry.knowledge,
    artifactIds: [...entry.artifacts],
  }));

  if (targets.length === 0) {
    return {
      ok: false,
      error: {
        code: 'invalid_input',
        summary: `无法解析交付目标: ${unresolved.join(', ')}`,
        suggested_fix:
          '当前支持 Ubuntu/Debian（linux/ubuntu）和 HarmonyOS（mobile/harmonyos）生态，例如 deb、docker、ubuntu、harmonyos、app、hap',
      },
    };
  }

  const warnings = unresolved.length > 0
    ? [`以下目标无法解析，已忽略: ${unresolved.join(', ')}`]
    : [];

  return { ok: true, targets, warnings };
}

function toDeliveryTargetSummary(target: DeliveryTargetPlan): DeliveryTargetSummary {
  return {
    ecosystem: target.id,
    name: target.knowledge.name,
    artifacts: target.artifactIds,
    store: target.knowledge.distribution.store,
    signing_required: target.knowledge.signing.required,
  };
}
