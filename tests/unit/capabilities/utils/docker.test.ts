import { describe, expect, it } from 'vitest';
import { amd64EmulationWarning, classifyDockerFailure, normalizeDockerProbe } from '../../../../src/capabilities/utils/docker.js';

describe('classifyDockerFailure', () => {
  it('Docker Desktop 未启动的真实报错归为守护进程未启动，而不是权限问题', () => {
    const real =
      'failed to connect to the docker API at unix:///Users/me/.docker/run/docker.sock; ' +
      'check if the path is correct and if the daemon is running: dial unix ' +
      '/Users/me/.docker/run/docker.sock: connect: no such file or directory';

    const probe = classifyDockerFailure(real, { exitCode: 1 });

    expect(probe.reason).toBe('daemon_not_running');
    expect(probe.suggestedFix).toContain('启动 Docker');
  });

  it('Linux 上 socket 权限不足归为权限问题并给出 docker 组建议', () => {
    const probe = classifyDockerFailure(
      'permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock',
      { exitCode: 1 }
    );

    expect(probe.reason).toBe('permission_denied');
    expect(probe.suggestedFix).toContain('usermod -aG docker');
  });

  it('探测超时单独成一类，提示等待冷启动', () => {
    const probe = classifyDockerFailure('', { timedOut: true });

    expect(probe.reason).toBe('probe_timeout');
    expect(probe.summary).toContain('没有响应');
  });

  it('无法归类时保留退出码并把报错原文放进 detail', () => {
    const probe = classifyDockerFailure('something entirely unexpected', { exitCode: 125 });

    expect(probe.reason).toBe('unknown');
    expect(probe.summary).toContain('125');
    expect(probe.detail).toContain('unexpected');
  });
});

describe('normalizeDockerProbe', () => {
  it('把 true 归一成可用', () => {
    expect(normalizeDockerProbe(true)).toEqual({ available: true });
  });

  it('把 false 归一成带修复建议的不可用结果', () => {
    const probe = normalizeDockerProbe(false);
    expect(probe.available).toBe(false);
    if (!probe.available) {
      expect(probe.suggestedFix).toContain('Docker');
      expect(probe.nextActions.length).toBeGreaterThan(0);
    }
  });

  it('原样透传结构化探测结果', () => {
    const original = {
      available: false as const,
      reason: 'permission_denied' as const,
      summary: 'x',
      suggestedFix: 'y',
      nextActions: ['z'],
    };
    expect(normalizeDockerProbe(original)).toBe(original);
  });
});

describe('amd64EmulationWarning', () => {
  it('x64 主机不产生警告', () => {
    expect(amd64EmulationWarning('x64')).toBeNull();
  });

  it('arm64 主机提示需要 amd64 模拟并给出自检命令', () => {
    const warning = amd64EmulationWarning('arm64');
    expect(warning).toContain('arm64');
    expect(warning).toContain('linux/amd64');
    expect(warning).toContain('docker run');
  });
});
