/**
 * `deliverkit doctor` —— 交付环境自检。
 *
 * 各生态的门槛（签名、官方工具链、账号）决定了「这台机器现在能产出哪些包」。
 * 与其让用户在一次 15 分钟的构建后才撞上缺失的工具链，不如先把这张表摊开。
 * 判定逻辑与各 pack_* 工具的 preflight 保持一致，避免自检说能而构建说不能。
 */

import { commandExists } from '../capabilities/utils/command.js';
import { amd64EmulationWarning, probeDocker, type DockerProbe } from '../capabilities/utils/docker.js';

export interface DoctorCheck {
  target: string;
  ready: boolean;
  detail: string;
  fix?: string;
}

export interface DoctorReport {
  platform: string;
  arch: string;
  nodeVersion: string;
  docker: DockerProbe;
  checks: DoctorCheck[];
}

export function runDoctor(probe: () => DockerProbe = probeDocker): DoctorReport {
  const docker = probe();
  const platform = process.platform;
  const arch = process.arch;
  const dockerReady = docker.available;
  const dockerFix = docker.available ? undefined : docker.suggestedFix;
  const archWarning = amd64EmulationWarning(arch);

  const checks: DoctorCheck[] = [
    {
      target: 'deb（Debian/Ubuntu）',
      ready: dockerReady,
      detail: dockerReady ? 'Docker 可用，可在隔离容器内构建并验证' : docker.available ? '' : docker.summary,
      fix: dockerFix,
    },
    {
      target: 'rpm（Rocky/RHEL 系）',
      ready: dockerReady,
      detail: dockerReady ? 'Docker 可用，可在隔离容器内构建并验证' : docker.available ? '' : docker.summary,
      fix: dockerFix,
    },
    {
      target: 'AppImage（x86_64）',
      ready: dockerReady,
      detail: dockerReady
        ? archWarning
          ? `Docker 可用，但当前架构为 ${arch}，需要 amd64 模拟`
          : 'Docker 可用，架构匹配 x86_64'
        : docker.available
          ? ''
          : docker.summary,
      fix: dockerReady ? (archWarning ?? undefined) : dockerFix,
    },
    windowsCheck(platform),
    macosCheck(platform),
    harmonyCheck(),
  ];

  return { platform, arch, nodeVersion: process.version, docker, checks };
}

function windowsCheck(platform: string): DoctorCheck {
  if (platform !== 'win32') {
    return {
      target: 'Windows MSI',
      ready: false,
      detail: `MSI 的 WiX 构建与 Authenticode 签名只能在 Windows 上完成（当前 ${platform}）`,
      fix: '用 generate_ci_workflow 生成工作流，在 GitHub Actions 的 windows runner 上构建',
    };
  }
  const missing = ['wix', 'signtool', 'msiexec'].filter((tool) => !commandExists(tool));
  return {
    target: 'Windows MSI',
    ready: missing.length === 0,
    detail: missing.length === 0 ? 'wix / signtool / msiexec 均在 PATH' : `缺少工具：${missing.join('、')}`,
    fix: missing.length === 0 ? undefined : '安装 WiX Toolset 与 Windows SDK（signtool），并确认它们在 PATH',
  };
}

function macosCheck(platform: string): DoctorCheck {
  if (platform !== 'darwin') {
    return {
      target: 'macOS DMG/PKG',
      ready: false,
      detail: `签名与公证只能在 macOS + Xcode 上完成（当前 ${platform}）`,
      fix: '用 generate_ci_workflow 生成工作流，在 GitHub Actions 的 macos runner 上构建',
    };
  }
  const required = ['xcodebuild', 'codesign', 'hdiutil', 'productbuild', 'productsign', 'xcrun', 'spctl'];
  const missing = required.filter((tool) => !commandExists(tool));
  return {
    target: 'macOS DMG/PKG',
    ready: missing.length === 0,
    detail: missing.length === 0 ? 'Apple 工具链完整（签名/公证仍需开发者账号与证书）' : `缺少工具：${missing.join('、')}`,
    fix: missing.length === 0
      ? undefined
      : '安装 Xcode 与 Command Line Tools（xcode-select --install），确认 Apple 工具在 PATH',
  };
}

function harmonyCheck(): DoctorCheck {
  const missing = ['hvigorw', 'ohpm', 'hdc'].filter((tool) => !commandExists(tool));
  return {
    target: 'HarmonyOS HAP/APP',
    ready: missing.length === 0,
    detail: missing.length === 0 ? 'DevEco 工具链完整（上架仍需 AGC 签名材料）' : `缺少工具：${missing.join('、')}`,
    fix: missing.length === 0 ? undefined : '安装华为 DevEco Command Line Tools，确认 hvigorw、ohpm、hdc 在 PATH',
  };
}

export function renderDoctorReport(report: DoctorReport): string {
  const lines: string[] = [
    `DeliverKit 交付环境自检  ·  ${report.platform}/${report.arch}  ·  Node ${report.nodeVersion}`,
    '',
  ];
  for (const check of report.checks) {
    lines.push(`${check.ready ? '✅' : '❌'} ${check.target}`);
    if (check.detail) {
      lines.push(`     ${check.detail}`);
    }
    if (check.fix) {
      lines.push(`     → ${check.fix}`);
    }
  }
  const readyCount = report.checks.filter((c) => c.ready).length;
  lines.push(
    '',
    `本机现在可交付 ${readyCount}/${report.checks.length} 个目标。不可交付的目标不是缺陷：`,
    '各生态用签名与官方工具链锁定了产出位置，DeliverKit 的做法是把它们规划到正确的 runner 上，',
    '而不是在本机伪造产物。生成 CI 矩阵：deliverkit generate-ci-workflow . --plan Forge.md',
  );
  return lines.join('\n');
}
