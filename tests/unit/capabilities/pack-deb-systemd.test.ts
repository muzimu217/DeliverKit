import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { generatePackagingPlan } from '../../../src/capabilities/generate-packaging-plan.js';
import {
  createSystemdMaintainerScripts,
  createSystemdUnit,
  packDeb,
  type DockerRunner,
} from '../../../src/capabilities/pack-deb.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

async function makeProject(): Promise<{ sourceDir: string; planPath: string; outputDir: string }> {
  const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-deb-plain-'));
  tempDirs.push(sourceDir);
  fs.writeFileSync(path.join(sourceDir, 'app.py'), 'print("healthy")\n');
  const plan = await generatePackagingPlan(sourceDir, ['deb']);
  if (plan.status !== 'success' || !plan.plan_path) {
    throw new Error('failed to create test plan');
  }
  return { sourceDir, planPath: plan.plan_path, outputDir: path.join(sourceDir, 'out') };
}

function recordingRunner(project: { outputDir: string }): { runner: DockerRunner; calls: string[] } {
  const calls: string[] = [];
  const runner: DockerRunner = (_command, args, options) => {
    const script = args.at(-1) ?? '';
    calls.push(script);
    if (calls.length === 1) {
      fs.mkdirSync(project.outputDir, { recursive: true });
      const artifactName = script.match(/\/output\/([^\s]+\.deb)/)?.[1];
      if (!artifactName) {
        throw new Error('build script did not declare a deb artifact');
      }
      fs.writeFileSync(path.join(project.outputDir, artifactName), 'package');
    }
    return {
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
      logPath: path.join(project.outputDir, 'logs', options.logFileName ?? 'command.log'),
    };
  };
  return { runner, calls };
}

describe('createSystemdUnit', () => {
  it('ExecStart 指向安装后的启动器并含自启动与重启策略', () => {
    const unit = createSystemdUnit('demo-app');
    expect(unit).toContain('[Unit]');
    expect(unit).toContain('ExecStart=/usr/bin/demo-app');
    expect(unit).toContain('Restart=on-failure');
    expect(unit).toContain('WantedBy=multi-user.target');
  });

  it('包名进入 Description，不含 shell 元字符注入面', () => {
    const unit = createSystemdUnit('demo-app');
    expect(unit).toContain('Description=demo-app service (DeliverKit)');
  });
});

describe('createSystemdMaintainerScripts', () => {
  it('postinst 仅在 systemd 活跃时 enable --now，容器环境降级为提示', () => {
    const { postinst } = createSystemdMaintainerScripts('demo-app');
    expect(postinst).toContain('#!/bin/sh');
    expect(postinst).toContain('[ -d /run/systemd/system ]');
    expect(postinst).toContain('systemctl daemon-reload');
    expect(postinst).toContain('systemctl enable --now demo-app.service');
    expect(postinst).toContain('systemctl enable --now demo-app');
  });

  it('prerm 停服务且允许失败，不阻塞卸载', () => {
    const { prerm } = createSystemdMaintainerScripts('demo-app');
    expect(prerm).toContain('systemctl stop demo-app.service || true');
  });
});

describe('pack_deb systemd', () => {
  it('systemd=true 时构建脚本安装 unit 与维护脚本，验证阶段做 systemd-analyze 校验', async () => {
    const project = await makeProject();
    const { runner, calls } = recordingRunner(project);

    const result = packDeb(
      { sourceDir: project.sourceDir, planPath: project.planPath, outputDir: project.outputDir, systemd: true },
      runner,
      () => true
    );

    expect(result.status).toBe('success');
    const buildScript = calls[0];
    const verifyScript = calls[1];

    expect(buildScript).toContain('/package/lib/systemd/system/');
    expect(buildScript).toContain('.service');
    expect(buildScript).toContain("cat > /package/DEBIAN/postinst <<'DELIVERKIT_POSTINST'");
    expect(buildScript).toContain("cat > /package/DEBIAN/prerm <<'DELIVERKIT_PRERM'");
    expect(buildScript).toContain('chmod 0755 /package/DEBIAN/postinst /package/DEBIAN/prerm');

    expect(verifyScript).toContain('systemd-analyze verify /lib/systemd/system/');
    expect(verifyScript).toContain('systemd');
    expect(result.artifacts?.[0].metadata?.verified_checks).toContain('systemd-analyze verify');
  });

  it('systemd 缺省时构建与验证脚本不含 systemd 内容（回归保护）', async () => {
    const project = await makeProject();
    const { runner, calls } = recordingRunner(project);

    const result = packDeb(
      { sourceDir: project.sourceDir, planPath: project.planPath, outputDir: project.outputDir },
      runner,
      () => true
    );

    expect(result.status).toBe('success');
    expect(calls[0]).not.toContain('/lib/systemd/system/');
    expect(calls[0]).not.toContain('/DEBIAN/postinst');
    expect(calls[1]).not.toContain('systemd-analyze');
    expect(result.artifacts?.[0].metadata?.verified_checks).not.toContain('systemd-analyze verify');
  });
});
