/**
 * Debian package capability.
 *
 * The package is assembled in Ubuntu rather than on the host. A second fresh
 * container installs it and runs its launcher, so a successful result has
 * installation and runtime evidence instead of only a build exit code.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { contractIncludesArtifact, loadForgeContract, type ForgeContract } from './forge-contract.js';
import type { ErrorCode, ForgeKitResult } from './types.js';
import { sha256File } from './utils/checksum.js';
import { commandExists, runCommand, runCommandWithLog, type CommandLogResult } from './utils/command.js';
import { assertSourceDir, PathValidationError, pathExists } from './utils/filesystem.js';

const BUILD_IMAGE = 'ubuntu:22.04';
const NODE_BUILD_IMAGE = 'node:18-bookworm';
const VERIFY_IMAGE = 'ubuntu:22.04';

export interface PackDebRequest {
  sourceDir: string;
  planPath: string;
  outputDir?: string;
  packageName?: string;
}

export type DockerRunner = (
  command: string,
  args: string[],
  options: { cwd?: string; timeout?: number; logDir?: string; logFileName?: string }
) => CommandLogResult;

export function packDeb(
  request: PackDebRequest,
  runner: DockerRunner = runCommandWithLog,
  dockerAvailable: () => boolean = isDockerAvailable
): ForgeKitResult {
  try {
    assertSourceDir(request.sourceDir);
  } catch (error) {
    if (error instanceof PathValidationError) {
      return failure(error.code, error.message, '提供包含项目源码的有效目录');
    }
    throw error;
  }

  if (!pathExists(request.planPath)) {
    return failure('plan_not_found', `Forge.md 交付契约文件不存在: ${request.planPath}`, '先调用 generate_packaging_plan 生成计划');
  }

  const contractResult = loadForgeContract(request.planPath, request.sourceDir);
  if (!contractResult.ok) {
    return failure('plan_invalid', contractResult.reason, '重新生成 Forge.md 并审查 Delivery Targets');
  }
  if (!contractIncludesArtifact(contractResult.contract, 'linux/ubuntu', 'deb')) {
    return failure(
      'plan_invalid',
      'Forge.md 未声明 linux/ubuntu 的 deb 交付目标',
      '使用 goals 包含 deb 重新生成 Forge.md 后再构建'
    );
  }

  if (!dockerAvailable()) {
    return failure(
      'toolchain_not_available',
      'Docker CLI 或守护进程不可用；deb 的隔离构建与验证需要可用 Docker',
      '安装并启动 Docker，或在 Linux CI runner 上执行 pack_deb'
    );
  }

  const packageName = normalizePackageName(request.packageName ?? contractResult.contract.project.name);
  if (!packageName) {
    return failure('build_config_invalid', '项目名无法转换为合法 Debian 包名', '传入 package_name（小写字母、数字和连字符）');
  }

  const launch = resolveLinuxLauncher(contractResult.contract, packageName, request.sourceDir);
  if (!launch.ok) {
    return failure(launch.code, launch.reason, launch.suggestedFix);
  }

  const outputDir = path.resolve(request.outputDir ?? path.join(request.sourceDir, '.deliverkit', 'artifacts'));
  fs.mkdirSync(outputDir, { recursive: true });
  const architecture = launch.value.buildKind === 'go' ? debArchitecture() : 'all';
  const artifactName = `${packageName}_0.1.0_${architecture}.deb`;
  const buildImage = launch.value.buildKind === 'node' ? NODE_BUILD_IMAGE : BUILD_IMAGE;
  const artifactPath = path.join(outputDir, artifactName);
  const logDir = path.join(outputDir, 'logs');
  const build = runner(
    'docker',
    dockerRunArgs(buildImage, request.sourceDir, outputDir, createDebBuildScript(packageName, artifactName, launch.value, architecture)),
    { timeout: 10 * 60_000, logDir, logFileName: `${packageName}-deb-build.log` }
  );
  if (!build.success) {
    return failure('build_failed', `deb 构建失败（退出码 ${build.exitCode}）`, '查看构建日志并修正项目依赖或打包配置', build.logPath);
  }
  if (!fs.existsSync(artifactPath)) {
    return failure('artifact_not_found', `构建命令成功但未找到 deb 产物: ${artifactPath}`, '查看构建日志，确认 Docker 输出目录可写', build.logPath);
  }

  const verify = runner(
    'docker',
    dockerVerifyArgs(VERIFY_IMAGE, outputDir, artifactName, packageName, launch.value.runtimePackages),
    { timeout: 5 * 60_000, logDir, logFileName: `${packageName}-deb-verify.log` }
  );
  if (!verify.success) {
    return failure('verification_failed', `deb 安装或运行验证失败（退出码 ${verify.exitCode}）`, '查看验证日志，修正运行依赖或应用入口', verify.logPath);
  }

  const stat = fs.statSync(artifactPath);
  return {
    status: 'success',
    artifacts: [{
      type: 'deb-package',
      path: artifactPath,
      checksum: sha256File(artifactPath),
      size_bytes: stat.size,
      metadata: {
        package_name: packageName,
        build_image: buildImage,
        verification_image: VERIFY_IMAGE,
        verification_log: verify.logPath,
        verified_checks: ['dpkg -i', 'launcher executable', 'launcher runtime'],
      },
    }],
    logs: {
      path: build.logPath,
      summary: 'Ubuntu 隔离容器中完成 deb 构建；安装和运行验证日志见产物 metadata.verification_log',
      full_available: true,
    },
    decision_basis: {
      target_platform: 'linux/ubuntu',
      target_version: 'Ubuntu 22.04 LTS',
      base_image: buildImage,
      build_method: 'Docker 隔离 dpkg-deb 构建 + 干净 Ubuntu 容器安装运行验证',
    },
  };
}

function isDockerAvailable(): boolean {
  return commandExists('docker') && runCommand('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 10_000 }).success;
}

export interface LinuxLauncher {
  command: string;
  buildKind: 'python' | 'node' | 'go';
  buildPackages: string[];
  runtimePackages: string[];
}

export type LinuxLauncherResult =
  | { ok: true; value: LinuxLauncher }
  | { ok: false; code: 'language_not_supported' | 'entrypoint_not_found' | 'build_config_invalid'; reason: string; suggestedFix: string };

export function resolveLinuxLauncher(contract: ForgeContract, packageName: string, sourceDir: string): LinuxLauncherResult {
  const entry = contract.project.entrypoints[0];
  const language = contract.project.language;

  if (language === 'Python') {
    if (!isSafeRelativePath(entry) || !fs.existsSync(path.join(sourceDir, entry))) {
      return { ok: false, code: 'entrypoint_not_found', reason: 'Python 项目未找到可打包的入口文件', suggestedFix: '确认 app.py/main.py 存在后重新生成 Forge.md' };
    }
    return {
      ok: true,
      value: {
        command: `exec /opt/${packageName}/venv/bin/python /opt/${packageName}/${shellQuote(entry)}`,
        buildKind: 'python',
        buildPackages: ['python3', 'python3-venv', 'python3-pip'],
        runtimePackages: ['python3', 'python3-venv'],
      },
    };
  }

  if (language === 'JavaScript' || language === 'TypeScript') {
    if (entry === 'npm start') {
      return {
        ok: true,
        value: {
          command: `cd /opt/${packageName} && exec npm start`,
          buildKind: 'node',
          buildPackages: ['nodejs', 'npm'],
          runtimePackages: ['nodejs', 'npm'],
        },
      };
    }
    if (!isSafeRelativePath(entry) || !fs.existsSync(path.join(sourceDir, entry))) {
      const packageJson = readPackageJson(sourceDir);
      if (packageJson?.scripts?.start) {
        return {
          ok: true,
          value: {
            command: `cd /opt/${packageName} && exec npm start`,
            buildKind: 'node',
            buildPackages: ['nodejs', 'npm'],
            runtimePackages: ['nodejs', 'npm'],
          },
        };
      }
      return { ok: false, code: 'entrypoint_not_found', reason: 'Node.js 项目未找到可打包的入口文件', suggestedFix: '确认 package.json main 或入口文件存在后重新生成 Forge.md' };
    }
    return {
      ok: true,
      value: {
        command: `exec node /opt/${packageName}/${shellQuote(entry)}`,
        buildKind: 'node',
        buildPackages: ['nodejs', 'npm'],
        runtimePackages: ['nodejs'],
      },
    };
  }

  if (language === 'Go') {
    if (!isSafeRelativePath(entry) || !fs.existsSync(path.join(sourceDir, entry)) || !fs.existsSync(path.join(sourceDir, 'go.mod'))) {
      return { ok: false, code: 'entrypoint_not_found', reason: 'Go 项目未找到 main.go 或 go.mod', suggestedFix: '确认 go.mod 与 main.go 存在后重新生成 Forge.md' };
    }
    return {
      ok: true,
      value: {
        command: `exec /opt/${packageName}/bin/${packageName}`,
        buildKind: 'go',
        buildPackages: ['golang-go'],
        runtimePackages: ['libc6'],
      },
    };
  }

  return {
    ok: false,
    code: language ? 'language_not_supported' : 'build_config_invalid',
    reason: language ? `pack_deb 尚不支持 ${language} 的通用服务打包` : 'Forge.md 未识别项目语言',
    suggestedFix: '当前支持 Python、JavaScript、TypeScript 和 Go；请提供明确的打包配置或选择受支持项目',
  };
}

function createDebBuildScript(packageName: string, artifactName: string, launcher: LinuxLauncher, architecture: string): string {
  const dependencyInstall = launcher.buildKind === 'python'
    ? `if [ -f /package/opt/${packageName}/requirements.txt ]; then /package/opt/${packageName}/venv/bin/pip install --no-cache-dir -r /package/opt/${packageName}/requirements.txt; fi`
    : launcher.buildKind === 'node'
      ? `if [ -f /package/opt/${packageName}/package-lock.json ]; then cd /package/opt/${packageName} && npm ci --ignore-scripts; elif [ -f /package/opt/${packageName}/package.json ]; then cd /package/opt/${packageName} && npm install --ignore-scripts; fi`
      : `cd /package/opt/${packageName} && go mod download`;
  const buildCommand = launcher.buildKind === 'go'
    ? `cd /package/opt/${packageName} && mkdir -p bin && CGO_ENABLED=0 go build -trimpath -o /package/opt/${packageName}/bin/${packageName} .`
    : launcher.buildKind === 'node'
      ? `if [ -f /package/opt/${packageName}/package.json ]; then cd /package/opt/${packageName}; npm run build --if-present; npm prune --omit=dev; fi`
      : ':';
  const venvCommand = launcher.buildKind === 'python' ? `python3 -m venv /package/opt/${packageName}/venv` : ':';
  const installTools = launcher.buildKind === 'node'
    ? ':'
    : `apt-get update\napt-get install -y --no-install-recommends dpkg-dev ${launcher.buildPackages.join(' ')}`;

  return [
    'set -eu',
    'export DEBIAN_FRONTEND=noninteractive',
    installTools,
    'rm -rf /package',
    `/bin/mkdir -p /package/DEBIAN /package/opt/${packageName} /package/usr/bin`,
    'cp -a /workspace/. /package/opt/' + packageName,
    `rm -rf /package/opt/${packageName}/.git /package/opt/${packageName}/.deliverkit`,
    venvCommand,
    dependencyInstall,
    buildCommand,
    `printf '%s\\n' 'Package: ${packageName}' 'Version: 0.1.0' 'Section: utils' 'Priority: optional' 'Architecture: ${architecture}' 'Maintainer: DeliverKit <noreply@deliverkit.dev>' 'Depends: ${launcher.runtimePackages.join(', ')}' 'Description: ${packageName} application package built by DeliverKit' > /package/DEBIAN/control`,
    `printf '%s\\n' '#!/bin/sh' 'set -eu' ${shellQuote(launcher.command)} > /package/usr/bin/${packageName}`,
    `chmod 0755 /package/usr/bin/${packageName}`,
    `dpkg-deb --root-owner-group --build /package /output/${artifactName}`,
  ].join('\n');
}

function readPackageJson(sourceDir: string): { scripts?: { start?: string } } | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.join(sourceDir, 'package.json'), 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) {return null;}
    const scripts = (parsed as { scripts?: unknown }).scripts;
    return typeof scripts === 'object' && scripts !== null ? parsed as { scripts?: { start?: string } } : null;
  } catch {
    return null;
  }
}

function debArchitecture(): string {
  return process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'amd64' : process.arch;
}

function dockerRunArgs(image: string, sourceDir: string, outputDir: string, script: string): string[] {
  return [
    'run', '--rm',
    '--mount', `type=bind,src=${path.resolve(sourceDir)},dst=/workspace,readonly`,
    '--mount', `type=bind,src=${path.resolve(outputDir)},dst=/output`,
    image, 'bash', '-lc', script,
  ];
}

function dockerVerifyArgs(image: string, outputDir: string, artifactName: string, packageName: string, runtimePackages: string[]): string[] {
  const script = [
    'set -eu',
    'export DEBIAN_FRONTEND=noninteractive',
    'apt-get update',
    `apt-get install -y --no-install-recommends ${runtimePackages.join(' ')} coreutils`,
    `dpkg -i /packages/${artifactName}`,
    `test -x /usr/bin/${packageName}`,
    'set +e',
    `timeout 5s /usr/bin/${packageName}`,
    'status=$?',
    'set -e',
    'test "$status" -eq 0 -o "$status" -eq 124',
  ].join('\n');
  return [
    'run', '--rm',
    '--mount', `type=bind,src=${path.resolve(outputDir)},dst=/packages,readonly`,
    image, 'bash', '-lc', script,
  ];
}

function normalizePackageName(value: string): string | null {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized.length >= 2 && /^[a-z0-9][a-z0-9-]+$/.test(normalized) ? normalized : null;
}

function isSafeRelativePath(value: string | undefined): value is string {
  return Boolean(value) && !path.isAbsolute(value!) && !value!.split(/[\\/]/).includes('..') && !value!.includes('\n');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function failure(code: ErrorCode, summary: string, suggestedFix: string, detailLog?: string): ForgeKitResult {
  return { status: 'failed', error: { code, summary, suggested_fix: suggestedFix, detail_log: detailLog } };
}
