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

  it('把 Docker 不可用的具体原因与修复动作透出来', async () => {
    const project = await makeProject();
    const result = packDeb(
      { sourceDir: project.sourceDir, planPath: project.planPath },
      () => { throw new Error('builder must not run'); },
      () => ({
        available: false,
        reason: 'permission_denied',
        summary: '当前用户无权访问 Docker 守护进程 socket',
        suggestedFix: '把当前用户加入 docker 组',
        nextActions: ['usermod -aG docker "$USER" 后重新登录'],
        detail: 'permission denied while trying to connect',
      })
    );

    expect(result.error?.code).toBe('toolchain_not_available');
    expect(result.error?.summary).toContain('无权访问');
    expect(result.error?.suggested_fix).toContain('docker 组');
    expect(result.error?.log_excerpt).toContain('permission denied');
    expect(result.next_actions?.[0]).toContain('usermod');
  });

  it('语言不支持时先返回，不去探测 Docker', async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-deb-rust-'));
    tempDirs.push(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'Cargo.toml'), '[package]\nname = "demo"\nversion = "0.1.0"\n');
    fs.mkdirSync(path.join(sourceDir, 'src'));
    fs.writeFileSync(path.join(sourceDir, 'src', 'main.rs'), 'fn main() {}\n');
    const plan = await generatePackagingPlan(sourceDir, ['deb']);

    const result = packDeb(
      { sourceDir, planPath: plan.plan_path! },
      () => { throw new Error('builder must not run'); },
      () => { throw new Error('docker probe must not run before project checks'); }
    );

    expect(result.status).toBe('failed');
    expect(['language_not_supported', 'build_config_invalid', 'entrypoint_not_found']).toContain(result.error?.code);
  });

  it('构建失败时把日志尾部片段带回结果，而不是只给一个路径', async () => {
    const project = await makeProject();
    const runner: DockerRunner = (_command, _args, options) => ({
      success: false,
      exitCode: 100,
      stdout: 'Step 3/5\nE: Unable to locate package python3-venv\nThe command returned a non-zero code: 100',
      stderr: '',
      timedOut: false,
      signal: null,
      errorCode: null,
      logPath: path.join(project.outputDir, 'logs', options.logFileName ?? 'build.log'),
    });

    const result = packDeb(
      { sourceDir: project.sourceDir, planPath: project.planPath, outputDir: project.outputDir },
      runner,
      () => true
    );

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('build_failed');
    expect(result.error?.summary).toContain('退出码 100');
    expect(result.error?.log_excerpt).toContain('Unable to locate package python3-venv');
    expect(result.error?.detail_log).toBeDefined();
  });

  it('超时不被伪装成普通构建失败，并提示预拉镜像', async () => {
    const project = await makeProject();
    const runner: DockerRunner = (_command, _args, options) => ({
      success: false,
      exitCode: 1,
      stdout: 'Pulling from library/ubuntu',
      stderr: '',
      timedOut: true,
      signal: 'SIGTERM',
      errorCode: 'ETIMEDOUT',
      logPath: path.join(project.outputDir, 'logs', options.logFileName ?? 'build.log'),
    });

    const result = packDeb(
      { sourceDir: project.sourceDir, planPath: project.planPath, outputDir: project.outputDir },
      runner,
      () => true
    );

    expect(result.error?.summary).toContain('超时');
    expect(result.error?.suggested_fix).toContain('docker pull');
  });

  it('日志文件名带时间戳，重跑不覆盖上一次失败证据', async () => {
    const project = await makeProject();
    const logNames: string[] = [];
    const runner: DockerRunner = (_command, _args, options) => {
      logNames.push(options.logFileName ?? '');
      return {
        success: false,
        exitCode: 1,
        stdout: 'failure',
        stderr: '',
        timedOut: false,
        signal: null,
        errorCode: null,
        logPath: path.join(project.outputDir, 'logs', options.logFileName ?? 'build.log'),
      };
    };

    packDeb({ sourceDir: project.sourceDir, planPath: project.planPath, outputDir: project.outputDir }, runner, () => true);

    expect(logNames[0]).toMatch(/-deb-build-\d{4}-\d{2}-\d{2}T/);
  });

  it('成功后给出可执行的下一步', async () => {
    const project = await makeProject();
    const runner: DockerRunner = (_command, args, options) => {
      const script = args.at(-1) ?? '';
      const artifactName = script.match(/\/output\/([^\s]+\.deb)/)?.[1];
      if (artifactName) {
        fs.mkdirSync(project.outputDir, { recursive: true });
        fs.writeFileSync(path.join(project.outputDir, artifactName), 'package');
      }
      return {
        success: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
        timedOut: false,
        signal: null,
        errorCode: null,
        logPath: path.join(project.outputDir, 'logs', options.logFileName ?? 'build.log'),
      };
    };

    const result = packDeb(
      { sourceDir: project.sourceDir, planPath: project.planPath, outputDir: project.outputDir },
      runner,
      () => true
    );

    expect(result.status).toBe('success');
    expect(result.next_actions?.some((action) => action.includes('dpkg -i'))).toBe(true);
    expect(result.next_actions?.some((action) => action.includes('generate_release_manifest'))).toBe(true);
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

describe('pack_deb 版本推导', () => {
  it('构建脚本与产物文件名使用契约中的项目版本', async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-deb-ver-'));
    tempDirs.push(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'app.py'), 'print("healthy")\n');
    fs.writeFileSync(path.join(sourceDir, 'pyproject.toml'), '[project]\nname = "demo"\nversion = "2.3.4"\n');
    const plan = await generatePackagingPlan(sourceDir, ['deb']);
    if (plan.status !== 'success' || !plan.plan_path) {
      throw new Error('failed to create test plan');
    }
    const outputDir = path.join(sourceDir, 'out');
    let buildScript = '';
    const runner: DockerRunner = (_command, args, options) => {
      if (!buildScript) {
        buildScript = args.at(-1) ?? '';
        fs.mkdirSync(outputDir, { recursive: true });
        const artifactName = buildScript.match(/\/output\/([^\s]+\.deb)/)?.[1];
        if (!artifactName) {
          throw new Error('build script did not declare a deb artifact');
        }
        fs.writeFileSync(path.join(outputDir, artifactName), 'package');
      }
      return {
        success: true, exitCode: 0, stdout: '', stderr: '',
        logPath: path.join(outputDir, 'logs', options.logFileName ?? 'command.log'),
      };
    };

    const result = packDeb({ sourceDir, planPath: plan.plan_path, outputDir }, runner, () => true);

    expect(result.status).toBe('success');
    expect(buildScript).toContain("'Version: 2.3.4'");
    expect(result.artifacts?.[0]?.path).toMatch(/demo_2\.3\.4_all\.deb$/);
  });

  it('请求级 package_version 覆盖契约版本', async () => {
    const project = await makeProject();
    let buildScript = '';
    const runner: DockerRunner = (_command, args, options) => {
      if (!buildScript) {
        buildScript = args.at(-1) ?? '';
        fs.mkdirSync(project.outputDir, { recursive: true });
        const artifactName = buildScript.match(/\/output\/([^\s]+\.deb)/)?.[1];
        if (artifactName) {
          fs.writeFileSync(path.join(project.outputDir, artifactName), 'package');
        }
      }
      return {
        success: true, exitCode: 0, stdout: '', stderr: '',
        logPath: path.join(project.outputDir, 'logs', options.logFileName ?? 'command.log'),
      };
    };

    const result = packDeb(
      { sourceDir: project.sourceDir, planPath: project.planPath, outputDir: project.outputDir, packageVersion: '9.9.9' },
      runner,
      () => true
    );

    expect(result.status).toBe('success');
    expect(buildScript).toContain("'Version: 9.9.9'");
    expect(result.artifacts?.[0]?.path).toMatch(/_9\.9\.9_all\.deb$/);
  });
});
