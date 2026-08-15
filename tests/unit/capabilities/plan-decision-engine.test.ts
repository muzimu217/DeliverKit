/**
 * plan decision engine 测试（知识包驱动）
 */

import { describe, expect, it } from 'vitest';
import {
  deriveDecisionBasis,
  deriveNextActions,
  deriveRisks,
  type DeliveryTargetPlan,
} from '../../../src/capabilities/plan-decision-engine.js';
import { loadEcosystem } from '../../../src/knowledge/ecosystem-loader.js';
import type { InspectProjectOutput } from '../../../src/capabilities/types.js';

const pythonInspection: InspectProjectOutput = {
  status: 'success',
  language: 'Python',
  entrypoints: ['app.py'],
  existing_packaging: { dockerfile: false },
};

const ubuntu = loadEcosystem('linux/ubuntu')!;
const harmony = loadEcosystem('mobile/harmonyos')!;

const ubuntuTarget: DeliveryTargetPlan = { id: 'linux/ubuntu', knowledge: ubuntu, artifactIds: ['deb'] };
const harmonyTarget: DeliveryTargetPlan = { id: 'mobile/harmonyos', knowledge: harmony, artifactIds: ['app'] };

describe('plan decision engine（知识包驱动）', () => {
  it('从主目标推导决策依据', () => {
    const basis = deriveDecisionBasis([ubuntuTarget]);

    expect(basis.target_platform).toBe('linux');
    expect(basis.build_method).toContain('deb');
    expect(basis.compatibility_notes?.some((n) => n.includes('Ubuntu 20.04'))).toBe(true);
  });

  it('汇总已知失败模式与签名风险', () => {
    const risks = deriveRisks([harmonyTarget]);

    expect(risks.some((r) => r.includes('p12'))).toBe(true);
    expect(risks.some((r) => r.includes('无法更新已上架应用'))).toBe(true);
  });

  it('根据目标生成后续动作（linux/deb）', () => {
    const actions = deriveNextActions([ubuntuTarget], pythonInspection);

    expect(actions.some((a) => a.includes('pack_deb'))).toBe(true);
    expect(actions.some((a) => a.includes('审查'))).toBe(true);
  });

  it('鸿蒙目标提示 AGC 正式签名与构建', () => {
    const actions = deriveNextActions([harmonyTarget], pythonInspection);

    expect(actions.some((a) => a.includes('pack_harmonyos_app'))).toBe(true);
    expect(actions.some((a) => a.includes('AppGallery'))).toBe(true);
  });

  it('docker 目标补充自动生成 Dockerfile 提示', () => {
    const dockerTarget: DeliveryTargetPlan = {
      id: 'linux/ubuntu',
      knowledge: ubuntu,
      artifactIds: ['docker-image'],
    };
    const actions = deriveNextActions([dockerTarget], pythonInspection);

    expect(actions.some((a) => a.includes('build_docker_image'))).toBe(true);
    expect(actions.some((a) => a.includes('自动生成'))).toBe(true);
  });
});
