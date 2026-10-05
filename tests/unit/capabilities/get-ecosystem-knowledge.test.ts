/**
 * get_ecosystem_knowledge 单元测试
 *
 * 只读知识查询是 Agent 读取生态规则的入口：
 * 全量列举、单生态查询、未知生态的可行动报错三条路径都要稳。
 */

import { describe, it, expect } from 'vitest';
import { getEcosystemKnowledge } from '../../../src/capabilities/get-ecosystem-knowledge.js';
import { listEcosystemIds } from '../../../src/knowledge/ecosystem-loader.js';

describe('getEcosystemKnowledge', () => {
  it('不指定生态时返回全部已注册知识包', () => {
    const ids = listEcosystemIds();
    expect(ids.length).toBeGreaterThan(0);

    const output = getEcosystemKnowledge();

    expect(output.status).toBe('success');
    expect(output.total).toBe(ids.length);
    expect(output.ecosystems!.map((e) => e.id).sort()).toEqual(ids);
  });

  it('纯空白入参等同于全量列举', () => {
    const output = getEcosystemKnowledge('   ');

    expect(output.status).toBe('success');
    expect(output.total).toBe(listEcosystemIds().length);
  });

  it('查询已注册生态返回单个知识包', () => {
    const target = listEcosystemIds()[0];

    const output = getEcosystemKnowledge(target);

    expect(output.status).toBe('success');
    expect(output.total).toBe(1);
    expect(output.ecosystems![0].id).toBe(target);
  });

  it('未知生态报 ecosystem_not_found，并列出可用生态', () => {
    const output = getEcosystemKnowledge('no-such-ecosystem-xyz');

    expect(output.status).toBe('failed');
    expect(output.error!.code).toBe('ecosystem_not_found');
    expect(output.error!.suggested_fix).toContain(listEcosystemIds()[0]);
  });
});
