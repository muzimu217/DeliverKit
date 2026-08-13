import { describe, expect, it } from 'vitest';
import {
  loadSystemAdapter,
  loadSystemAdapterResult,
  resolveSystemAdapterId,
  SYSTEM_ADAPTER_DESCRIPTORS,
  SUPPORTED_SYSTEM_ADAPTERS,
} from '../../../src/systems/adapter-loader.js';

describe('system adapter loader', () => {
  it('注册明确接入运行时的适配器', () => {
    expect(SUPPORTED_SYSTEM_ADAPTERS).toEqual(['servers/ubuntu', 'mobile/harmonyos']);

    const adapter = loadSystemAdapter('servers/ubuntu');
    expect(adapter?.id).toBe('servers/ubuntu');
    expect(adapter?.family).toBe('servers');
    expect(adapter?.platform).toBe('ubuntu');
    expect(adapter?.rules.产物格式).toBe('deb');
    expect(adapter?.descriptor.status).toBe('verified');
    expect(adapter?.descriptor.toolNames).toContain('build_docker_image');

    const harmonyAdapter = loadSystemAdapter('mobile/harmonyos');
    expect(harmonyAdapter?.family).toBe('mobile');
    expect(harmonyAdapter?.platform).toBe('harmonyos');
    expect(harmonyAdapter?.descriptor.status).toBe('experimental');
    expect(SYSTEM_ADAPTER_DESCRIPTORS['mobile/harmonyos'].requiredToolchain).toContain('hdc');
  });

  it('不会加载未注册的平台规则', () => {
    expect(loadSystemAdapter('mobile/android')).toBeNull();
    expect(loadSystemAdapter('desktop/windows')).toBeNull();
    expect(loadSystemAdapterResult('mobile/android')).toEqual({
      ok: false,
      error: {
        code: 'adapter_not_supported',
        summary: '未注册系统适配器: mobile/android',
      },
    });
  });

  it('只把已接入的目标解析到适配器', () => {
    expect(resolveSystemAdapterId()).toBe('servers/ubuntu');
    expect(resolveSystemAdapterId('ubuntu-24.04')).toBe('servers/ubuntu');
    expect(resolveSystemAdapterId('harmonyos-12')).toBe('mobile/harmonyos');
    expect(resolveSystemAdapterId('centos-9')).toBeNull();
  });
});
