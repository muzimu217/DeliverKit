/** AppImage build and execution verification capability (Ubuntu 22.04 / x86_64). */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { contractIncludesArtifact, loadForgeContract } from './forge-contract.js';
import { resolveLinuxLauncher, logStamp, type DockerRunner, type LinuxLauncher } from './pack-deb.js';
import type { ErrorCode, ForgeKitResult } from './types.js';
import { sha256File } from './utils/checksum.js';
import { describeCommandFailure, logTail, runCommandWithLog } from './utils/command.js';
import { amd64EmulationWarning, normalizeDockerProbe, probeDocker, type DockerProbeFn } from './utils/docker.js';
import { assertSourceDir, PathValidationError, pathExists } from './utils/filesystem.js';
import { resolveArtifactVersion } from './utils/version.js';

// Pin 2026-09-05: appimage-builder 0.9.1（2021-07-08 构建，digest 固定）。
// recipe（opt/libc loader、focal 源）是针对 0.9.x 行为写的；1.1.0 的 apt 部署
// 路径不同，实测构建失败。同一契约必须产出同一结果，digest pin 才可复现。
// 升级到 1.1.x 需重写 python/node 依赖脚本（见 goal.md 技术债清单）。
const BUILD_IMAGE =
  'appimagecrafters/appimage-builder@sha256:0188548ac837d832666bcaeb6a7833d575eba8ef1fedb6cd7717a74775dce2c9';
const VERIFY_IMAGE = 'ubuntu:22.04';
const BUILD_TIMEOUT_MS = 15 * 60_000;
const VERIFY_TIMEOUT_MS = 5 * 60_000;

export interface PackAppImageRequest {
  sourceDir: string;
  planPath: string;
  outputDir?: string;
  packageName?: string;
  packageVersion?: string;
}

export function packAppImage(
  request: PackAppImageRequest,
  runner: DockerRunner = runCommandWithLog,
  dockerAvailable: DockerProbeFn = probeDocker
): ForgeKitResult {
  try {
    assertSourceDir(request.sourceDir);
  } catch (error) {
    if (error instanceof PathValidationError) {return failure(error.code, error.message, '提供包含项目源码的有效目录');}
    throw error;
  }
  if (!pathExists(request.planPath)) {
    return {
      ...failure('plan_not_found', `Forge.md 交付契约文件不存在: ${request.planPath}`, '先调用 generate_packaging_plan 生成计划'),
      next_actions: ['调用 generate_packaging_plan（goals 包含 appimage）生成 Forge.md，再重新执行 pack_appimage'],
    };
  }
  const plan = loadForgeContract(request.planPath, request.sourceDir);
  if (!plan.ok) {return failure('plan_invalid', plan.reason, '重新生成 Forge.md 并审查 Delivery Targets');}
  if (!contractIncludesArtifact(plan.contract, 'linux/appimage', 'appimage')) {
    return {
      ...failure('plan_invalid', 'Forge.md 未声明 linux/appimage 的 appimage 交付目标', '使用 goals 包含 appimage 重新生成 Forge.md 后再构建'),
      next_actions: ['调用 generate_packaging_plan 时在 goals 中加入 appimage'],
    };
  }

  // 项目侧检查排在 Docker 探测之前：语言不支持时不该让用户先白等一次守护进程探测。
  const packageName = normalizePackageName(request.packageName ?? plan.contract.project.name);
  if (!packageName) {return failure('build_config_invalid', '项目名无法转换为合法 AppImage 名称', '传入 package_name（小写字母、数字和连字符）');}
  const packageVersion = resolveArtifactVersion(request.packageVersion, plan.contract.project.version);
  const launcher = resolveLinuxLauncher(plan.contract, packageName, request.sourceDir);
  if (!launcher.ok) {return failure(launcher.code, launcher.reason, launcher.suggestedFix);}

  const docker = normalizeDockerProbe(dockerAvailable());
  if (!docker.available) {
    return {
      status: 'failed',
      error: {
        code: 'toolchain_not_available',
        summary: docker.summary,
        suggested_fix: docker.suggestedFix,
        log_excerpt: docker.detail,
      },
      next_actions: docker.nextActions,
    };
  }
  // AppImage 只产出 x86_64；arm64 主机靠模拟运行，先说清楚，别让它在容器深处炸。
  const archWarning = amd64EmulationWarning();

  const outputDir = path.resolve(request.outputDir ?? path.join(request.sourceDir, '.deliverkit', 'artifacts'));
  fs.mkdirSync(outputDir, { recursive: true });
  const artifactName = `${packageName}-${packageVersion}-x86_64.AppImage`;
  const artifactPath = path.join(outputDir, artifactName);
  const logDir = path.join(outputDir, 'logs');
  const runStamp = logStamp();
  const build = runner('docker', dockerBuildArgs(request.sourceDir, outputDir, createAppImageBuilderScript(packageName, packageVersion, artifactName, launcher.value, plan.contract.project.entrypoints[0])), {
    timeout: BUILD_TIMEOUT_MS, logDir, logFileName: `${packageName}-appimage-build-${runStamp}.log`,
  });
  if (!build.success) {
    return {
      status: 'failed',
      error: {
        code: 'build_failed',
        summary: `AppImage 构建失败（${describeCommandFailure(build, BUILD_TIMEOUT_MS)}）`,
        suggested_fix: build.timedOut
          ? `首次运行需要拉取 ${BUILD_IMAGE}（体积较大），网络慢时容易触顶；预先 docker pull 后重试`
          : '按下面的日志片段修正项目依赖或 AppImage recipe 后重试',
        detail_log: build.logPath,
        log_excerpt: logTail(build.stdout),
      },
      warnings: archWarning ? [archWarning] : undefined,
      next_actions: [`完整日志见 ${build.logPath}`],
    };
  }
  if (!fs.existsSync(artifactPath)) {
    return failure('artifact_not_found', `构建命令成功但未找到 AppImage 产物: ${artifactPath}`, '查看构建日志，确认 Docker 输出目录可写', build.logPath);
  }

  const verify = runner('docker', dockerVerifyArgs(outputDir, artifactName), { timeout: VERIFY_TIMEOUT_MS, logDir, logFileName: `${packageName}-appimage-verify-${runStamp}.log` });
  if (!verify.success) {
    return {
      status: 'failed',
      error: {
        code: 'verification_failed',
        summary: `AppImage 运行验证失败（${describeCommandFailure(verify, VERIFY_TIMEOUT_MS)}）`,
        suggested_fix: '产物已构建但跑不起来：按日志片段修正 AppRun 或应用入口',
        detail_log: verify.logPath,
        log_excerpt: logTail(verify.stdout),
      },
      warnings: archWarning ? [archWarning] : undefined,
      next_actions: [`产物保留在 ${artifactPath}，完整验证日志见 ${verify.logPath}`],
    };
  }

  const stat = fs.statSync(artifactPath);
  return {
    status: 'success',
    artifacts: [{ type: 'appimage', path: artifactPath, checksum: sha256File(artifactPath), size_bytes: stat.size, metadata: { package_name: packageName, architecture: 'x86_64', build_image: BUILD_IMAGE, verification_image: VERIFY_IMAGE, verification_log: verify.logPath, verified_checks: ['AppImage extract-and-run or extracted AppRun fallback', 'AppRun launcher runtime'] } }],
    logs: { path: build.logPath, summary: 'Ubuntu x86_64 容器中完成 AppImage 构建；验证日志见产物 metadata.verification_log', full_available: true },
    decision_basis: { target_platform: 'linux/appimage', target_version: 'Ubuntu 20.04 / x86_64', base_image: BUILD_IMAGE, build_method: 'appimage-builder recipe + 干净 Ubuntu 容器 extract-and-run 验证' },
    warnings: archWarning ? [archWarning] : undefined,
    next_actions: [
      `本机试跑（需 x86_64 或模拟）：chmod +x ${artifactPath} && ${artifactPath}`,
      '调用 generate_release_manifest 汇总各平台产物与验证证据',
    ],
  };
}

function createAppImageBuilderScript(packageName: string, packageVersion: string, artifactName: string, launcher: LinuxLauncher, entry: string | undefined): string {
  const isPython = launcher.buildKind === 'python';
  const isGo = launcher.buildKind === 'go';
  const isNode = launcher.buildKind === 'node';
  const isNpmStart = launcher.command.includes('npm start');
  const runtime = isPython ? 'python3, python3-pip' : isGo ? 'golang-go, coreutils' : 'nodejs';
  const executable = isPython ? 'usr/bin/python3' : isGo ? `usr/bin/${packageName}` : isNode ? 'usr/bin/node.real' : 'usr/bin/node';
  const targetLoader = '/work/AppDir/opt/libc/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2 --library-path /work/AppDir/opt/libc/lib/x86_64-linux-gnu:/work/AppDir/usr/lib';
  const nodeBinary = isNode ? '/work/AppDir/usr/bin/node.real' : '/work/AppDir/usr/bin/node';
  const npmCliPath = isNode ? '/work/AppDir/usr/lib/node_modules/npm/bin/npm-cli.js' : '/work/AppDir/usr/share/nodejs/npm/bin/npm-cli.js';
  const runtimeNpmCliPath = isNode ? '$APPDIR/usr/lib/node_modules/npm/bin/npm-cli.js' : '$APPDIR/usr/share/nodejs/npm/bin/npm-cli.js';
  const directNodeEntry = entry && entry !== 'npm start' ? `$APPDIR/usr/src/${entry} $@` : undefined;
  const args = isGo ? '$@' : isNpmStart ? (directNodeEntry ?? `${runtimeNpmCliPath} --prefix $APPDIR/usr/src start $@`) : `$APPDIR/usr/src/${entry ?? ''} $@`;
  const nodeBootstrap = isNode
    ? `    - mv /work/AppDir/usr/bin/node /work/AppDir/usr/bin/node.real\n    - printf '%s\\n' '#!/bin/sh' 'exec ${targetLoader} ${nodeBinary} "$@"' > /work/AppDir/usr/bin/node\n    - chmod 0755 /work/AppDir/usr/bin/node\n`
    : '';
  const dependencyScript = isPython
    ? '    - if [ -f /work/requirements.txt ]; then PYTHONHOME=/work/AppDir/usr PYTHONPATH=/work/AppDir/usr/lib/python3.8:/work/AppDir/usr/lib/python3/dist-packages /work/AppDir/opt/libc/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2 --library-path /work/AppDir/opt/libc/lib/x86_64-linux-gnu:/work/AppDir/usr/lib /work/AppDir/usr/bin/python3.8 -m pip install --no-cache-dir --upgrade "pip<25.1"; PYTHONHOME=/work/AppDir/usr PYTHONPATH=/work/AppDir/usr/lib/python3.8:/work/AppDir/usr/lib/python3/dist-packages /work/AppDir/opt/libc/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2 --library-path /work/AppDir/opt/libc/lib/x86_64-linux-gnu:/work/AppDir/usr/lib /work/AppDir/usr/bin/python3.8 -m pip install --no-cache-dir --target /work/AppDir/usr/src/python-packages -r /work/requirements.txt; fi'
    : isGo
      ? `    - cd /work/AppDir/usr/src && CGO_ENABLED=0 /work/AppDir/usr/bin/go build -trimpath -o /work/AppDir/usr/bin/${packageName} .\n    - rm -rf /work/AppDir/usr/share/go-* /work/AppDir/usr/lib/go* /work/AppDir/usr/lib/golang /work/AppDir/usr/src/go* /work/AppDir/usr/bin/go /work/AppDir/usr/bin/gofmt`
      : `${nodeBootstrap}    - export PATH=/work/AppDir/usr/bin:$PATH; if [ -f /work/package-lock.json ]; then cd /work/AppDir/usr/src && ${targetLoader} ${nodeBinary} ${npmCliPath} ci --ignore-scripts; elif [ -f /work/package.json ]; then cd /work/AppDir/usr/src && ${targetLoader} ${nodeBinary} ${npmCliPath} install --ignore-scripts; fi\n    - export PATH=/work/AppDir/usr/bin:$PATH; if [ -f /work/AppDir/usr/src/package.json ]; then cd /work/AppDir/usr/src; ${targetLoader} ${nodeBinary} ${npmCliPath} run build --if-present; ${targetLoader} ${nodeBinary} ${npmCliPath} prune --omit=dev; fi`;
  const env = isPython
    ? ['      PYTHONHOME: "$APPDIR/usr"', '      PYTHONPATH: "$APPDIR/usr/src/python-packages"'].join('\n')
    : isGo
      ? '      PATH: "$APPDIR/usr/bin:$PATH"'
      : ['      PATH: "$APPDIR/usr/bin:$PATH"', '      NODE_PATH: "$APPDIR/usr/src/node_modules"'].join('\n');
  return [
    'set -eu',
    'mkdir -p /work',
    'cp -a /workspace/. /work/',
    'rm -rf /work/.git /work/.deliverkit',
    'cat > /work/AppImageBuilder.yml <<\'RECIPE\'',
    'version: 1',
    'script:',
    '  - rm -rf /work/AppDir | true',
    '  - mkdir -p /work/AppDir/usr/src',
    '  - mkdir -p /work/AppDir/usr/share/icons/hicolor/64x64/apps',
    "  - printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9J3X0AAAAASUVORK5CYII=' | base64 --decode > /work/AppDir/usr/share/icons/hicolor/64x64/apps/deliverkit.png",
    '  - find /work -mindepth 1 -maxdepth 1 ! -name AppDir ! -name AppImageBuilder.yml -exec cp -a {} /work/AppDir/usr/src/ \\;',
    'AppDir:',
    '  path: /work/AppDir',
    '  app_info:',
    `    id: org.deliverkit.${packageName}`,
    `    name: ${packageName}`,
    '    icon: deliverkit',
    `    version: ${packageVersion}`,
    `    exec: "${executable}"`,
    `    exec_args: "${args}"`,
    '  apt:',
    '    arch: amd64',
    '    sources:',
    "      - sourceline: 'deb [arch=amd64] http://archive.ubuntu.com/ubuntu/ focal main restricted universe multiverse'",
    "        key_url: 'http://keyserver.ubuntu.com/pks/lookup?op=get&search=0x3b4fe6acc0b21f32'",
    ...(isNode ? [
      "      - sourceline: 'deb [arch=amd64] https://deb.nodesource.com/node_18.x nodistro main'",
      "        key_url: 'https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key'",
    ] : []),
    `    include: [${runtime}, coreutils]`,
    '    exclude: []',
    '  after_bundle:',
    dependencyScript,
    '  runtime:',
    '    env:',
    env,
    'AppImage:',
    '  arch: x86_64',
    'RECIPE',
    'cd /work',
    'appimage-builder --recipe /work/AppImageBuilder.yml --skip-tests',
    `artifact=$(find /work -maxdepth 1 -type f -name '*.AppImage' | head -n 1)`,
    'test -n "$artifact"',
    `cp "$artifact" /output/${artifactName}`,
    `chmod 0755 /output/${artifactName}`,
  ].join('\n');
}

function dockerBuildArgs(sourceDir: string, outputDir: string, script: string): string[] {
  return ['run', '--rm', '--platform', 'linux/amd64', '--entrypoint', '/bin/bash', '--mount', `type=bind,src=${path.resolve(sourceDir)},dst=/workspace,readonly`, '--mount', `type=bind,src=${path.resolve(outputDir)},dst=/output`, BUILD_IMAGE, '-lc', script];
}

function dockerVerifyArgs(outputDir: string, artifactName: string): string[] {
  const artifact = `/packages/${artifactName}`;
  const script = [
    'set -eu',
    'command -v timeout',
    `test -x ${artifact}`,
    'set +e',
    `timeout 5s ${artifact} --appimage-extract-and-run`,
    'status=$?',
    'set -e',
    'if [ "$status" -eq 0 ] || [ "$status" -eq 124 ]; then exit 0; fi',
    'export DEBIAN_FRONTEND=noninteractive',
    'apt-get update >/dev/null',
    'apt-get install -y --no-install-recommends squashfs-tools >/dev/null',
    `offset=; for candidate in $(LC_ALL=C grep -abo hsqs ${artifact} | cut -d: -f1); do if unsquashfs -l -offset "$candidate" ${artifact} >/dev/null 2>&1; then offset="$candidate"; break; fi; done`,
    'test -n "$offset"',
    `unsquashfs -q -offset "$offset" -d /tmp/deliverkit-appimage ${artifact}`,
    'set +e',
    'timeout 5s /tmp/deliverkit-appimage/AppRun',
    'extracted_status=$?',
    'set -e',
    'test "$extracted_status" -eq 0 -o "$extracted_status" -eq 124',
  ].join('\n');
  return ['run', '--rm', '--platform', 'linux/amd64', '--mount', `type=bind,src=${path.resolve(outputDir)},dst=/packages,readonly`, VERIFY_IMAGE, 'bash', '-lc', script];
}

function normalizePackageName(value: string): string | null {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized.length >= 2 && /^[a-z0-9][a-z0-9-]+$/.test(normalized) ? normalized : null;
}

function failure(code: ErrorCode, summary: string, suggestedFix: string, detailLog?: string): ForgeKitResult { return { status: 'failed', error: { code, summary, suggested_fix: suggestedFix, detail_log: detailLog } }; }
