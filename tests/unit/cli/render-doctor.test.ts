import { describe, expect, it } from 'vitest';
import { renderResult } from '../../../src/cli/render.js';
import { renderDoctorReport, runDoctor } from '../../../src/cli/doctor.js';

describe('renderResult', () => {
  it('成功时展示产物、验证项与下一步', () => {
    const text = renderResult({
      status: 'success',
      artifacts: [{
        type: 'deb-package',
        path: '/tmp/out/demo_0.1.0_all.deb',
        checksum: 'abcdef0123456789',
        size_bytes: 2 * 1024 * 1024,
        metadata: { verified_checks: ['dpkg -i', 'launcher runtime'] },
      }],
      decision_basis: { target_platform: 'linux/ubuntu', target_version: 'Ubuntu 22.04 LTS' },
      next_actions: ['sudo dpkg -i /tmp/out/demo_0.1.0_all.deb'],
    });

    expect(text).toContain('✅ 成功');
    expect(text).toContain('demo_0.1.0_all.deb');
    expect(text).toContain('2.0 MB');
    expect(text).toContain('dpkg -i / launcher runtime');
    expect(text).toContain('linux/ubuntu');
    expect(text).toContain('下一步');
  });

  it('失败时把原因、建议与日志片段直接摊在终端里', () => {
    const text = renderResult({
      status: 'failed',
      error: {
        code: 'build_failed',
        summary: 'deb 构建失败（退出码 100）',
        suggested_fix: '按日志片段修正依赖',
        log_excerpt: 'E: Unable to locate package python3-venv',
        detail_log: '/tmp/out/logs/demo-deb-build.log',
      },
      next_actions: ['完整日志见 /tmp/out/logs/demo-deb-build.log'],
    });

    expect(text).toContain('❌ 失败 · build_failed');
    expect(text).toContain('退出码 100');
    expect(text).toContain('| E: Unable to locate package python3-venv');
    expect(text).toContain('/tmp/out/logs/demo-deb-build.log');
  });

  it('警告单独成行，不被淹没在 JSON 里', () => {
    const text = renderResult({ status: 'success', warnings: ['当前主机架构为 arm64'] });
    expect(text).toContain('⚠️  当前主机架构为 arm64');
  });
});

describe('doctor', () => {
  it('Docker 可用时 Linux 三目标都判定为可交付', () => {
    const report = runDoctor(() => ({ available: true, serverVersion: '27.0.0' }));
    const linux = report.checks.filter((check) => /deb|rpm|AppImage/.test(check.target));

    expect(linux).toHaveLength(3);
    expect(linux.every((check) => check.ready)).toBe(true);
  });

  it('Docker 不可用时把同一个修复建议挂到三个 Linux 目标上', () => {
    const report = runDoctor(() => ({
      available: false,
      reason: 'daemon_not_running',
      summary: '连不上守护进程',
      suggestedFix: '启动 Docker 守护进程',
      nextActions: ['启动 Docker'],
    }));
    const linux = report.checks.filter((check) => /deb|rpm|AppImage/.test(check.target));

    expect(linux.every((check) => !check.ready)).toBe(true);
    expect(linux.every((check) => check.fix === '启动 Docker 守护进程')).toBe(true);
  });

  it('渲染结果解释了不可交付目标不是缺陷，并给出 CI 出路', () => {
    const text = renderDoctorReport(runDoctor(() => ({ available: true })));

    expect(text).toContain('DeliverKit 交付环境自检');
    expect(text).toContain('generate-ci-workflow');
  });
});
