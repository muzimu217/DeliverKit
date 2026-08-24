/**
 * Plan decision engine — 由生态知识包驱动。
 *
 * 从知识包推导决策依据、风险与后续动作，取代旧的中文 key decision-rules 分支。
 * 支持多目标：一个计划可覆盖多个生态（delivery_targets）。
 */

import type { EcosystemKnowledge } from '../knowledge/ecosystem-schema.js';
import type { DecisionBasis, InspectProjectOutput } from './types.js';

/** 一个已解析的交付目标：生态知识包 + 选定产物。 */
export interface DeliveryTargetPlan {
  id: string;
  knowledge: EcosystemKnowledge;
  artifactIds: string[];
}

/** 从主目标推导决策依据（用于 MCP 结果的 decision_basis 字段）。 */
export function deriveDecisionBasis(targets: DeliveryTargetPlan[]): DecisionBasis {
  const primary = targets[0];
  if (!primary) {
    return { target_platform: 'unknown', build_method: '未解析到交付目标' };
  }

  const { knowledge, artifactIds } = primary;
  return {
    target_platform: knowledge.ecosystem,
    target_version: knowledge.compatibility[0]?.target ?? knowledge.name,
    build_method: `${knowledge.name}（${artifactIds.join(', ')}）`,
    compatibility_notes: knowledge.compatibility.map(
      (row) => `${row.target}${row.remark ? `: ${row.remark}` : ''}`
    ),
    risks_acknowledged: [],
  };
}

/** 汇总全部目标的已知失败模式 + 签名风险（去重）。 */
export function deriveRisks(targets: DeliveryTargetPlan[]): string[] {
  const risks: string[] = [];
  const seen = new Set<string>();

  for (const target of targets) {
    const { knowledge } = target;
    for (const issue of knowledge.known_issues) {
      add(risks, seen, `[${knowledge.name}] ${issue.symptom}`);
    }
    for (const risk of knowledge.signing.risks) {
      add(risks, seen, `[${knowledge.name}] ${risk}`);
    }
  }

  return risks;
}

/** 生成后续动作：审查契约 + 各生态的构建与签名动作。 */
export function deriveNextActions(
  targets: DeliveryTargetPlan[],
  inspect: InspectProjectOutput
): string[] {
  const actions = ['审查生成的 Forge.md（Delivery Targets / Decisions / Risks 段）'];

  for (const target of targets) {
    const { knowledge, artifactIds } = target;
    if (knowledge.ecosystem === 'harmonyos') {
      actions.push('调用 pack_harmonyos 执行构建（需携带 plan_path）');
      if (knowledge.signing.required) {
        actions.push(
          `上架前在 ${knowledge.distribution.store} 配置正式签名：${knowledge.signing.how_to_get ?? '见知识包'}`
        );
      }
      continue;
    }
    if (knowledge.ecosystem === 'apple') {
      actions.push('调用 generate_ci_workflow 生成 macos-14 工作流（需配置 Apple secrets）');
      for (const artifact of artifactIds.filter((id) => id === 'dmg' || id === 'pkg')) {
        actions.push(`在 macOS runner 上调用 pack_macos --artifact ${artifact} 构建、签名、公证并验证 ${artifact.toUpperCase()}`);
      }
      continue;
    }
    if (artifactIds.includes('deb')) {
      actions.push('调用 pack_deb 构建 deb 包（需携带 plan_path）');
    }
    if (artifactIds.includes('rpm')) {
      actions.push('调用 pack_rpm 构建 rpm 包（需携带 plan_path）');
    }
    if (artifactIds.includes('appimage')) {
      actions.push('调用 pack_appimage 构建 AppImage（需携带 plan_path）');
    }
    if (artifactIds.includes('msi')) {
      actions.push('调用 generate_ci_workflow 生成 Windows runner 工作流（需配置签名 secrets）');
      actions.push('在 Windows runner 上调用 pack_windows_msi 构建、签名并静默安装验证 MSI');
    }
    if (artifactIds.includes('docker-image')) {
      actions.push('调用 build_docker_image 构建镜像（需携带 plan_path）');
      if (!inspect.existing_packaging?.dockerfile) {
        actions.push('项目缺少 Dockerfile，构建时将自动生成默认模板');
      }
    }
  }

  return actions;
}

function add(list: string[], seen: Set<string>, item: string): void {
  if (!seen.has(item)) {
    seen.add(item);
    list.push(item);
  }
}
