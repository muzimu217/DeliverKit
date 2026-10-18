import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { generatePackagingPlan } from '../../../src/capabilities/generate-packaging-plan.js';
import { packRpm } from '../../../src/capabilities/pack-rpm.js';
import type { DockerRunner } from '../../../src/capabilities/pack-deb.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {fs.rmSync(dir, { recursive: true, force: true });}
});

async function makeProject(): Promise<{ sourceDir: string; planPath: string; outputDir: string }> {
  const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-rpm-sys-'));
  tempDirs.push(sourceDir);
  fs.writeFileSync(path.join(sourceDir, 'app.py'), 'print("ready")');
  const plan = await generatePackagingPlan(sourceDir, ['rpm']);
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
      const packageName = script.match(/Name: ([a-z0-9-]+)/)?.[1];
      if (!packageName) {throw new Error('build script did not declare an rpm package name');}
      fs.mkdirSync(project.outputDir, { recursive: true });
      fs.writeFileSync(path.join(project.outputDir, `${packageName}-0.1.0-1.el9.aarch64.rpm`), 'rpm');
    }
    return { success: true, exitCode: 0, stdout: '', stderr: '', logPath: path.join(project.outputDir, options.logFileName ?? 'build.log') };
  };
  return { runner, calls };
}

describe('pack_rpm systemd', () => {
  it('systemd=true 时 spec 安装 unit 到 /usr/lib/systemd/system，含 %post/%preun，验证做 systemd-analyze 校验', async () => {
    const project = await makeProject();
    const { runner, calls } = recordingRunner(project);

    const result = packRpm(
      { sourceDir: project.sourceDir, planPath: project.planPath, outputDir: project.outputDir, systemd: true },
      runner,
      () => true
    );

    expect(result.status).toBe('success');
    const spec = calls[0];
    const verify = calls[1];

    expect(spec).toContain('/usr/lib/systemd/system/');
    expect(spec).toContain("cat > %{buildroot}/usr/lib/systemd/system/deliverkit-rpm-sys-");
    expect(spec).toContain('%files');
    expect(spec).toContain('%post');
    expect(spec).toContain('systemctl enable --now');
    expect(spec).toContain('%preun');
    expect(spec).toContain('systemctl stop');
    expect(verify).toContain('systemd-analyze verify /usr/lib/systemd/system/');
    expect(verify).toContain('systemd');
    expect(result.artifacts?.[0].metadata?.verified_checks).toContain('systemd-analyze verify');
  });

  it('systemd 缺省时 spec 与验证脚本不含 systemd 内容（回归保护）', async () => {
    const project = await makeProject();
    const { runner, calls } = recordingRunner(project);

    const result = packRpm(
      { sourceDir: project.sourceDir, planPath: project.planPath, outputDir: project.outputDir },
      runner,
      () => true
    );

    expect(result.status).toBe('success');
    expect(calls[0]).not.toContain('%post');
    expect(calls[0]).not.toContain('/usr/lib/systemd/system/');
    expect(calls[1]).not.toContain('systemd-analyze');
    expect(result.artifacts?.[0].metadata?.verified_checks).not.toContain('systemd-analyze verify');
  });
});
