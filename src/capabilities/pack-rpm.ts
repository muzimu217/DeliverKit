/** RPM build and clean-container verification capability. */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { contractIncludesArtifact, loadForgeContract } from './forge-contract.js';
import { resolveLinuxLauncher, type DockerRunner, type LinuxLauncher } from './pack-deb.js';
import type { ErrorCode, ForgeKitResult } from './types.js';
import { sha256File } from './utils/checksum.js';
import { commandExists, runCommand, runCommandWithLog } from './utils/command.js';
import { assertSourceDir, PathValidationError, pathExists } from './utils/filesystem.js';

const IMAGE = 'rockylinux:9';

export interface PackRpmRequest {
  sourceDir: string;
  planPath: string;
  outputDir?: string;
  packageName?: string;
}

export function packRpm(
  request: PackRpmRequest,
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
  const plan = loadForgeContract(request.planPath, request.sourceDir);
  if (!plan.ok) {
    return failure('plan_invalid', plan.reason, '重新生成 Forge.md 并审查 Delivery Targets');
  }
  if (!contractIncludesArtifact(plan.contract, 'linux/rpm', 'rpm')) {
    return failure('plan_invalid', 'Forge.md 未声明 linux/rpm 的 rpm 交付目标', '使用 goals 包含 rpm 重新生成 Forge.md 后再构建');
  }
  if (!dockerAvailable()) {
    return failure('toolchain_not_available', 'Docker CLI 或守护进程不可用；rpm 的隔离构建与验证需要可用 Docker', '安装并启动 Docker，或在 Linux CI runner 上执行 pack_rpm');
  }

  const packageName = normalizePackageName(request.packageName ?? plan.contract.project.name);
  if (!packageName) {
    return failure('build_config_invalid', '项目名无法转换为合法 RPM 包名', '传入 package_name（小写字母、数字和连字符）');
  }
  const launcher = resolveLinuxLauncher(plan.contract, packageName, request.sourceDir);
  if (!launcher.ok) {
    return failure(launcher.code, launcher.reason, launcher.suggestedFix);
  }

  const outputDir = path.resolve(request.outputDir ?? path.join(request.sourceDir, '.deliverkit', 'artifacts'));
  fs.mkdirSync(outputDir, { recursive: true });
  const architecture = rpmArchitecture();
  const logDir = path.join(outputDir, 'logs');
  const sourceOutputPath = relativePathWithin(request.sourceDir, outputDir);
  const build = runner('docker', dockerBuildArgs(request.sourceDir, outputDir, createRpmBuildScript(packageName, architecture, launcher.value, sourceOutputPath)), {
    timeout: 10 * 60_000, logDir, logFileName: `${packageName}-rpm-build.log`,
  });
  if (!build.success) {
    return failure('build_failed', `rpm 构建失败（退出码 ${build.exitCode}）`, '查看构建日志并修正项目依赖或打包配置', build.logPath);
  }
  const artifactPath = findRpmArtifact(outputDir, packageName);
  if (!artifactPath) {
    return failure('artifact_not_found', `构建命令成功但未找到 ${packageName} 的 rpm 产物`, '查看构建日志，确认 Docker 输出目录可写', build.logPath);
  }
  const artifactName = path.basename(artifactPath);

  const verify = runner('docker', dockerVerifyArgs(outputDir, artifactName, packageName, launcher.value.runtimePackages), {
    timeout: 5 * 60_000, logDir, logFileName: `${packageName}-rpm-verify.log`,
  });
  if (!verify.success) {
    return failure('verification_failed', `rpm 安装或运行验证失败（退出码 ${verify.exitCode}）`, '查看验证日志，修正运行依赖或应用入口', verify.logPath);
  }

  const stat = fs.statSync(artifactPath);
  return {
    status: 'success',
    artifacts: [{
      type: 'rpm-package', path: artifactPath, checksum: sha256File(artifactPath), size_bytes: stat.size,
      metadata: { package_name: packageName, build_image: IMAGE, verification_image: IMAGE, verification_log: verify.logPath, verified_checks: ['rpm -Uvh', 'launcher executable', 'launcher runtime'] },
    }],
    logs: { path: build.logPath, summary: 'Rocky Linux 隔离容器中完成 rpm 构建；验证日志见产物 metadata.verification_log', full_available: true },
    decision_basis: { target_platform: 'linux/rpm', target_version: 'Rocky Linux 9', base_image: IMAGE, build_method: 'Docker 隔离 rpmbuild + 干净 Rocky Linux 容器安装运行验证' },
  };
}

function createRpmBuildScript(
  packageName: string,
  architecture: string,
  launcher: LinuxLauncher,
  sourceOutputPath: string | null
): string {
  const buildPackages = rpmBuildPackages(launcher);
  const runtimePackages = rpmRuntimePackages(launcher);
  const dependencyInstall = launcher.buildKind === 'python'
    ? `mkdir -p /root/rpmbuild/SOURCES/app/python-packages && if [ -f /root/rpmbuild/SOURCES/app/requirements.txt ]; then python3 -m pip install --no-cache-dir --target /root/rpmbuild/SOURCES/app/python-packages -r /root/rpmbuild/SOURCES/app/requirements.txt; fi`
    : launcher.buildKind === 'node'
      ? `if [ -f /root/rpmbuild/SOURCES/app/package-lock.json ]; then cd /root/rpmbuild/SOURCES/app && npm ci --ignore-scripts; elif [ -f /root/rpmbuild/SOURCES/app/package.json ]; then cd /root/rpmbuild/SOURCES/app && npm install --ignore-scripts; fi`
      : `cd /root/rpmbuild/SOURCES/app && go mod download`;
  const buildCommand = launcher.buildKind === 'go'
    ? `mkdir -p /root/rpmbuild/SOURCES/app/bin && cd /root/rpmbuild/SOURCES/app && CGO_ENABLED=0 go build -trimpath -o /root/rpmbuild/SOURCES/app/bin/${packageName} .`
    : launcher.buildKind === 'node'
      ? 'if [ -f /root/rpmbuild/SOURCES/app/package.json ]; then cd /root/rpmbuild/SOURCES/app; npm run build --if-present; npm prune --omit=dev; fi'
      : ':';
  const rpmLauncher = launcher.buildKind === 'python'
    ? {
        ...launcher,
        command: launcher.command.replace(
          `exec /opt/${packageName}/venv/bin/python`,
          `export PYTHONPATH=/opt/${packageName}/python-packages\${PYTHONPATH:+:$PYTHONPATH}\nexec /usr/bin/python3`
        ),
      }
    : launcher;
  const specLines = [
    `Name: ${packageName}`, 'Version: 0.1.0', 'Release: 1%{?dist}', 'Summary: DeliverKit application package', 'License: MIT', `BuildArch: ${architecture}`, `Requires: ${runtimePackages.join(', ')}`, '', '%description', `${packageName} application package built by DeliverKit.`, '', '%prep', '', '%build', buildCommand, '', '%install', 'rm -rf %{buildroot}', `mkdir -p %{buildroot}/opt/${packageName} %{buildroot}/usr/bin`, `cp -a %{_sourcedir}/app/. %{buildroot}/opt/${packageName}/`, `rm -rf %{buildroot}/opt/${packageName}/.git %{buildroot}/opt/${packageName}/.deliverkit`, `printf '%s\\n' '#!/bin/sh' 'set -eu' ${shellQuote(rpmLauncher.command)} > %{buildroot}/usr/bin/${packageName}`, `chmod 0755 %{buildroot}/usr/bin/${packageName}`, '', '%files', `/opt/${packageName}`, `/usr/bin/${packageName}`,
  ];
  return [
    'set -eu',
    'dnf -y install rpm-build ' + buildPackages.join(' '),
    'rm -rf /root/rpmbuild',
    'mkdir -p /root/rpmbuild/SOURCES/app /root/rpmbuild/SPECS',
    'cp -a /workspace/. /root/rpmbuild/SOURCES/app/',
    `rm -rf /root/rpmbuild/SOURCES/app/.git /root/rpmbuild/SOURCES/app/.deliverkit`,
    sourceOutputPath ? `rm -rf /root/rpmbuild/SOURCES/app/${shellQuote(sourceOutputPath)}` : ':',
    dependencyInstall,
    `printf '%s\\n' ${specLines.map(shellQuote).join(' ')} > /root/rpmbuild/SPECS/${packageName}.spec`,
    `rpmbuild -bb /root/rpmbuild/SPECS/${packageName}.spec`,
    `cp /root/rpmbuild/RPMS/${architecture}/*.rpm /output/`,
  ].join('\n');
}

function dockerBuildArgs(sourceDir: string, outputDir: string, script: string): string[] {
  return ['run', '--rm', '--mount', `type=bind,src=${path.resolve(sourceDir)},dst=/workspace,readonly`, '--mount', `type=bind,src=${path.resolve(outputDir)},dst=/output`, IMAGE, 'bash', '-lc', script];
}

function dockerVerifyArgs(outputDir: string, artifactName: string, packageName: string, runtimePackages: string[]): string[] {
  const script = ['set -eu', `dnf -y install ${rpmRuntimePackages({ runtimePackages } as LinuxLauncher).join(' ')}`, 'command -v timeout', `rpm -Uvh --nosignature /packages/${artifactName}`, `test -x /usr/bin/${packageName}`, 'set +e', `timeout 5s /usr/bin/${packageName}`, 'status=$?', 'set -e', 'test "$status" -eq 0 -o "$status" -eq 124'].join('\n');
  return ['run', '--rm', '--mount', `type=bind,src=${path.resolve(outputDir)},dst=/packages,readonly`, IMAGE, 'bash', '-lc', script];
}

function rpmBuildPackages(launcher: LinuxLauncher): string[] {
  if (launcher.buildKind === 'python') {return ['python3', 'python3-pip'];}
  if (launcher.buildKind === 'go') {return ['golang'];}
  return ['nodejs', 'npm'];
}

function rpmRuntimePackages(launcher: Pick<LinuxLauncher, 'runtimePackages'>): string[] {
  if (launcher.runtimePackages.includes('python3')) {return ['python3'];}
  if (launcher.runtimePackages.includes('libc6')) {return ['glibc'];}
  return launcher.runtimePackages;
}

function normalizePackageName(value: string): string | null {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized.length >= 2 && /^[a-z0-9][a-z0-9-]+$/.test(normalized) ? normalized : null;
}

function rpmArchitecture(): string {
  return process.arch === 'arm64' ? 'aarch64' : process.arch === 'x64' ? 'x86_64' : process.arch;
}

function relativePathWithin(sourceDir: string, targetDir: string): string | null {
  const relative = path.relative(path.resolve(sourceDir), path.resolve(targetDir));
  return relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
    ? relative
    : null;
}

function findRpmArtifact(outputDir: string, packageName: string): string | null {
  try {
    const matches = fs.readdirSync(outputDir)
      .filter((name) => name.startsWith(`${packageName}-`) && name.endsWith('.rpm'))
      .sort();
    return matches.length === 1 ? path.join(outputDir, matches[0]) : null;
  } catch {
    return null;
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function isDockerAvailable(): boolean {
  return commandExists('docker') && runCommand('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 10_000 }).success;
}

function failure(code: ErrorCode, summary: string, suggestedFix: string, detailLog?: string): ForgeKitResult {
  return { status: 'failed', error: { code, summary, suggested_fix: suggestedFix, detail_log: detailLog } };
}
