import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { generatePackagingPlan } from '../../../src/capabilities/generate-packaging-plan.js';
import { packDeb, type DockerRunner } from '../../../src/capabilities/pack-deb.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

async function makeProject(goals: string[] = ['deb']): Promise<{ sourceDir: string; planPath: string; outputDir: string }> {
  const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-deb-'));
  tempDirs.push(sourceDir);
  fs.writeFileSync(path.join(sourceDir, 'app.py'), 'print("healthy")\n');
  const plan = await generatePackagingPlan(sourceDir, goals);
  if (plan.status !== 'success' || !plan.plan_path) {
    throw new Error('failed to create test plan');
  }
  return { sourceDir, planPath: plan.plan_path, outputDir: path.join(sourceDir, 'out') };
}

describe('pack_deb', () => {
  it('requires a deb target in the generated Forge contract', async () => {
    const project = await makeProject(['docker']);
    const result = packDeb(
      { sourceDir: project.sourceDir, planPath: project.planPath },
      () => { throw new Error('builder must not run'); },
      () => true
    );

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('plan_invalid');
  });

  it('builds then validates an artifact through separate Docker invocations', async () => {
    const project = await makeProject();
    const calls: { args: string[]; logFileName?: string }[] = [];
    const runner: DockerRunner = (_command, args, options) => {
      calls.push({ args, logFileName: options.logFileName });
      if (calls.length === 1) {
        fs.mkdirSync(project.outputDir, { recursive: true });
        const script = args.at(-1) ?? '';
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

    const result = packDeb(
      { sourceDir: project.sourceDir, planPath: project.planPath, outputDir: project.outputDir },
      runner,
      () => true
    );

    expect(result.status).toBe('success');
    expect(result.artifacts?.[0]).toEqual(expect.objectContaining({ type: 'deb-package' }));
    expect(calls).toHaveLength(2);
    expect(calls[0].args.at(-1)).toContain('dpkg-deb --root-owner-group --build');
    expect(calls[1].args.at(-1)).toContain('dpkg -i');
    expect(calls[1].args.at(-1)).toContain('timeout 5s');
  });

  it('reports an unavailable Docker daemon before attempting a build', async () => {
    const project = await makeProject();
    const result = packDeb(
      { sourceDir: project.sourceDir, planPath: project.planPath },
      () => { throw new Error('builder must not run'); },
      () => false
    );

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('toolchain_not_available');
  });

  it('supports Go projects with an architecture-specific binary package', async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-deb-go-'));
    tempDirs.push(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'go.mod'), 'module example.test/app\n\ngo 1.21\n');
    fs.writeFileSync(path.join(sourceDir, 'main.go'), 'package main\nfunc main() {}\n');
    const plan = await generatePackagingPlan(sourceDir, ['deb']);
    const outputDir = path.join(sourceDir, 'out');
    const scripts: string[] = [];
    const runner: DockerRunner = (_command, args, options) => {
      const script = args.at(-1) ?? '';
      scripts.push(script);
      if (scripts.length === 1) {
        fs.mkdirSync(outputDir, { recursive: true });
        const artifactName = script.match(/\/output\/([^\s]+\.deb)/)?.[1];
        if (!artifactName) {throw new Error('build script did not declare a deb artifact');}
        fs.writeFileSync(path.join(outputDir, artifactName), 'go-package');
      }
      return { success: true, exitCode: 0, stdout: '', stderr: '', logPath: path.join(outputDir, options.logFileName ?? 'build.log') };
    };

    const result = packDeb({ sourceDir, planPath: plan.plan_path!, outputDir }, runner, () => true);

    expect(result.status).toBe('success');
    expect(result.artifacts?.[0]?.path).toMatch(/_amd64\.deb$|_arm64\.deb$/);
    expect(scripts[0]).toContain('golang-go');
    expect(scripts[0]).toContain('go build -trimpath');
    expect(scripts[1]).toContain('dpkg -i');
  });

  it('builds a TypeScript package before launching a missing dist entry', async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-deb-ts-'));
    tempDirs.push(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'package.json'), JSON.stringify({
      name: 'ts-service',
      main: 'dist/index.js',
      scripts: { build: 'tsc', start: 'node dist/index.js' },
      devDependencies: { typescript: '^5.0.0' },
    }));
    fs.writeFileSync(path.join(sourceDir, 'tsconfig.json'), '{}');
    fs.writeFileSync(path.join(sourceDir, 'index.ts'), 'console.log("ready")\n');
    const plan = await generatePackagingPlan(sourceDir, ['deb']);
    const outputDir = path.join(sourceDir, 'out');
    const scripts: string[] = [];
    const runner: DockerRunner = (_command, args, options) => {
      const script = args.at(-1) ?? '';
      scripts.push(script);
      if (scripts.length === 1) {
        fs.mkdirSync(outputDir, { recursive: true });
        const artifactName = script.match(/\/output\/([^\s]+\.deb)/)?.[1];
        if (!artifactName) {throw new Error('build script did not declare a deb artifact');}
        fs.writeFileSync(path.join(outputDir, artifactName), 'ts-package');
      }
      return { success: true, exitCode: 0, stdout: '', stderr: '', logPath: path.join(outputDir, options.logFileName ?? 'build.log') };
    };

    const result = packDeb({ sourceDir, planPath: plan.plan_path!, outputDir }, runner, () => true);

    expect(result.status).toBe('success');
    expect(scripts[0]).toContain('npm run build --if-present');
    expect(scripts[0]).toContain('npm run build --if-present; npm prune --omit=dev');
    expect(scripts[0]).toContain('npm start');
  });
});
