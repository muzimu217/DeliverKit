/**
 * get_ecosystem_knowledge - 只读知识查询能力
 *
 * 让 Agent 显式读取某个生态的打包/签名/上架/验证规则。
 * 未指定 ecosystem 时返回全部已注册生态知识包。
 */

import { listEcosystemIds, loadEcosystemResult } from '../knowledge/ecosystem-loader.js';
import type { EcosystemKnowledge } from '../knowledge/ecosystem-schema.js';
import type { ForgeKitResult } from './types.js';

export interface GetEcosystemKnowledgeOutput extends ForgeKitResult {
  ecosystems?: EcosystemKnowledge[];
  total?: number;
}

export function getEcosystemKnowledge(ecosystem?: string): GetEcosystemKnowledgeOutput {
  if (ecosystem?.trim()) {
    const result = loadEcosystemResult(ecosystem.trim());
    if (!result.ok) {
      return {
        status: 'failed',
        error: {
          code: result.error.code,
          summary: result.error.summary,
          suggested_fix: `可用生态: ${listEcosystemIds().join(', ')}；或检查知识包 YAML 结构`,
        },
      };
    }
    return { status: 'success', ecosystems: [result.knowledge], total: 1 };
  }

  const ids = listEcosystemIds();
  const ecosystems: EcosystemKnowledge[] = [];
  const errors: string[] = [];

  for (const id of ids) {
    const result = loadEcosystemResult(id);
    if (result.ok) {
      ecosystems.push(result.knowledge);
    } else {
      errors.push(result.error.summary);
    }
  }

  return {
    status: 'success',
    ecosystems,
    total: ecosystems.length,
    warnings: errors.length > 0
      ? [`部分生态知识包加载失败: ${errors.join('; ')}`]
      : undefined,
  };
}
