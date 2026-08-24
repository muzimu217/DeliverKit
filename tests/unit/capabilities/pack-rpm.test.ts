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

describe('pack_rpm', () => {
  it('requires an rpm target in the generated Forge contract', async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-rpm-'));
    tempDirs.push(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'app.py'), 'print("ready")');
    const plan = await generatePackagingPlan(sourceDir, ['deb']);
    const result = packRpm({ sourceDir, planPath: plan.plan_path! }, () => { throw new Error('must not run'); }, () => true);

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('plan_invalid');
  });

  it('builds and verifies an rpm in separate containers', async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-rpm-'));
    tempDirs.push(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'app.py'), 'print("ready")');
    const plan = await generatePackagingPlan(sourceDir, ['rpm']);
    const outputDir = path.join(sourceDir, 'out');
    const calls: string[][] = [];
    const runner: DockerRunner = (_command, args, options) => {
      calls.push(args);
      if (calls.length === 1) {
        const packageName = (args.at(-1) ?? '').match(/Name: ([a-z0-9-]+)/)?.[1];
        if (!packageName) {throw new Error('build script did not declare an rpm package name');}
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(path.join(outputDir, `${packageName}-0.1.0-1.el9.aarch64.rpm`), 'rpm');
      }
      return { success: true, exitCode: 0, stdout: '', stderr: '', logPath: path.join(outputDir, options.logFileName ?? 'build.log') };
    };

    const result = packRpm({ sourceDir, planPath: plan.plan_path!, outputDir }, runner, () => true);

    expect(result.status).toBe('success');
    expect(result.artifacts?.[0]).toEqual(expect.objectContaining({ type: 'rpm-package' }));
    expect(calls).toHaveLength(2);
    expect(calls[0].at(-1)).toContain('rpmbuild -bb');
    expect(calls[1].at(-1)).toContain('rpm -Uvh --nosignature');
  });
});
