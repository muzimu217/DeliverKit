/**
 * 生态知识包 loader 测试
 * 验证：list / load / 校验失败返回可行动错误 / 目标解析。
 */

import { describe, expect, it } from 'vitest';
import {
  listEcosystemIds,
  loadEcosystem,
  loadEcosystemResult,
  resolveEcosystemId,
  selectArtifactIds,
} from '../../../src/knowledge/ecosystem-loader.js';

describe('ecosystem loader', () => {
  it('列出全部已注册生态（来自 id 字段）', () => {
    const ids = listEcosystemIds();
    expect(ids).toContain('linux/ubuntu');
    expect(ids).toContain('linux/rpm');
    expect(ids).toContain('linux/appimage');
    expect(ids).toContain('mobile/harmonyos');
    expect(ids).toContain('desktop/windows');
    expect(ids).toContain('desktop/macos');
  });

  it('加载 linux/ubuntu 知识包', () => {
    const knowledge = loadEcosystem('linux/ubuntu');
    expect(knowledge?.id).toBe('linux/ubuntu');
    expect(knowledge?.signing.required).toBe(false);
    expect(knowledge?.artifacts.map((a) => a.id)).toContain('deb');
  });

  it('加载 mobile/harmonyos 知识包（签名/上架规则）', () => {
    const knowledge = loadEcosystem('mobile/harmonyos');
    expect(knowledge?.signing.required).toBe(true);
    expect(knowledge?.signing.type).toBe('agc');
    expect(knowledge?.distribution.store).toBe('AppGallery');
    expect(knowledge?.distribution.requirements.length).toBeGreaterThan(0);
  });

  it('加载 Windows MSI 知识包（签名硬约束）', () => {
    const knowledge = loadEcosystem('desktop/windows');
    expect(knowledge?.artifacts.map((a) => a.id)).toContain('msi');
    expect(knowledge?.signing.required).toBe(true);
    expect(knowledge?.signing.type).toBe('codesign');
  });

  it('未注册生态返回可行动错误并列出可用生态', () => {
    const result = loadEcosystemResult('desktop/unknown');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ecosystem_not_found');
      expect(result.error.summary).toContain('desktop/unknown');
      expect(result.error.details?.[0]).toContain('linux/ubuntu');
    }
  });

  it('把目标环境解析为生态 id', () => {
    expect(resolveEcosystemId()).toBe('linux/ubuntu');
    expect(resolveEcosystemId('ubuntu-22.04')).toBe('linux/ubuntu');
    expect(resolveEcosystemId('deb')).toBe('linux/ubuntu');
    expect(resolveEcosystemId('harmonyos-12')).toBe('mobile/harmonyos');
    expect(resolveEcosystemId('centos-9')).toBe('linux/rpm');
    expect(resolveEcosystemId('appimage')).toBe('linux/appimage');
    expect(resolveEcosystemId('windows-msi')).toBe('desktop/windows');
    expect(resolveEcosystemId('macos-dmg')).toBe('desktop/macos');
  });

  it('按目标描述选择产物，未命名时回退到首个产物', () => {
    const ubuntu = loadEcosystem('linux/ubuntu');
    const harmony = loadEcosystem('mobile/harmonyos');

    expect(selectArtifactIds('deb', ubuntu!)).toEqual(['deb']);
    expect(selectArtifactIds('docker', ubuntu!)).toEqual(['docker-image']);
    expect(selectArtifactIds('rpm', loadEcosystem('linux/rpm')!)).toEqual(['rpm']);
    expect(selectArtifactIds('appimage', loadEcosystem('linux/appimage')!)).toEqual(['appimage']);
    expect(selectArtifactIds('windows-msi', loadEcosystem('desktop/windows')!)).toEqual(['msi']);
    expect(selectArtifactIds('macos-dmg', loadEcosystem('desktop/macos')!)).toEqual(['dmg']);
    expect(selectArtifactIds('macos-pkg', loadEcosystem('desktop/macos')!)).toEqual(['pkg']);
    expect(selectArtifactIds('app', harmony!)).toEqual(['app']);
    expect(selectArtifactIds('hap', harmony!)).toEqual(['hap']);
    expect(selectArtifactIds('', ubuntu!)).toEqual(['deb']);
  });
});
