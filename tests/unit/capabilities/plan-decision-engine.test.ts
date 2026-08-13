import { describe, expect, it } from 'vitest';
import {
  deriveDecisions,
  deriveNextActions,
  deriveRisks,
} from '../../../src/capabilities/plan-decision-engine.js';
import { loadSystemAdapter } from '../../../src/systems/adapter-loader.js';
import type { InspectProjectOutput } from '../../../src/capabilities/types.js';

const pythonInspection: InspectProjectOutput = {
  status: 'success',
  language: 'Python',
  runtime: 'Python 3.x',
  entrypoints: ['app.py'],
  existing_packaging: { dockerfile: false },
};

describe('plan decision engine', () => {
  it('根据目标、语言和 Ubuntu 规则推导决策', () => {
    const rules = loadSystemAdapter('servers/ubuntu')?.rules ?? null;
    const decisions = deriveDecisions(
      ['Docker', 'deb'],
      pythonInspection,
      rules,
      'ubuntu-20.04'
    );

    expect(decisions.target_platform).toBe('ubuntu-20.04');
    expect(decisions.base_image).toBe('python:3.10-slim');
    expect(decisions.build_method).toContain('Docker');
    expect(decisions.build_method).toContain('deb');
    expect(decisions.compatibility_notes?.some((note) => note.includes('glibc'))).toBe(true);
  });

  it('规则不可用时使用明确的回退风险', () => {
    const risks = deriveRisks(null, ['deb']);

    expect(risks.some((risk) => risk.includes('glibc'))).toBe(true);
    expect(risks.some((risk) => risk.includes('systemd'))).toBe(true);
  });

  it('根据构建目标和项目状态生成后续动作', () => {
    const actions = deriveNextActions(['Docker'], pythonInspection);

    expect(actions.some((action) => action.includes('build_docker_image'))).toBe(true);
    expect(actions.some((action) => action.includes('自动生成'))).toBe(true);
  });
});
