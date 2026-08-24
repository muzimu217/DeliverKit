/** Windows MSI build, Authenticode signing, and silent install verification. */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { contractIncludesArtifact, loadForgeContract } from './forge-contract.js';
import type { ErrorCode, ForgeKitResult } from './types.js';
import { sha256File } from './utils/checksum.js';
import { commandExists, runCommandWithLog, type CommandLogResult } from './utils/command.js';
import { assertSourceDir, PathValidationError, pathExists } from './utils/filesystem.js';

const WINDOWS_PLATFORM: NodeJS.Platform = 'win32';

export interface PackWindowsMsiRequest {
  sourceDir: string;
  planPath: string;
  outputDir?: string;
  packageName?: string;
  platform?: NodeJS.Platform;
  environment?: NodeJS.ProcessEnv;
}

export interface WindowsCommandOptions {
  cwd?: string;
  timeout?: number;
  logDir?: string;
  logFileName?: string;
  redactedArgs?: string[];
}

export type WindowsCommandRunner = (
  command: string,
  args: string[],
  options: WindowsCommandOptions
) => CommandLogResult;

export function packWindowsMsi(
  request: PackWindowsMsiRequest,
  runner: WindowsCommandRunner = runCommandWithLog,
  toolchainAvailable: () => boolean = hasWindowsToolchain
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
  const loaded = loadForgeContract(request.planPath, request.sourceDir);
  if (!loaded.ok) {
    return failure('plan_invalid', loaded.reason, '重新生成 Forge.md 并审查 Delivery Targets');
  }
  if (!contractIncludesArtifact(loaded.contract, 'desktop/windows', 'msi')) {
    return failure('plan_invalid', 'Forge.md 未声明 desktop/windows 的 msi 交付目标', '使用 goals 包含 windows-msi 重新生成 Forge.md 后再构建');
  }

  const platform = request.platform ?? process.platform;
  if (platform !== WINDOWS_PLATFORM) {
    return failure('toolchain_not_available', 'Windows MSI 必须在 Windows runner 上构建、签名并验证', '使用 generate_ci_workflow 生成 windows-latest 工作流');
  }
  if (!toolchainAvailable()) {
    return failure('toolchain_not_available', 'Windows runner 缺少 wix、signtool 或 msiexec 工具链', '安装 WiX Toolset v4，并确认 Visual Studio signtool 与 msiexec 已加入 PATH');
  }

  const environment = request.environment ?? process.env;
  const pfxBase64 = environment.DELIVERKIT_WINDOWS_PFX_BASE64;
  const pfxPassword = environment.DELIVERKIT_WINDOWS_PFX_PASSWORD;
  if (!pfxBase64 || !pfxPassword) {
    return failure('signing_material_missing', '缺少 Windows 代码签名材料', '配置 DELIVERKIT_WINDOWS_PFX_BASE64 与 DELIVERKIT_WINDOWS_PFX_PASSWORD secrets；私钥不得提交到仓库');
  }

  const packageName = normalizePackageName(request.packageName ?? loaded.contract.project.name);
  if (!packageName) {
    return failure('build_config_invalid', '项目名无法转换为合法 Windows MSI 名称', '传入 package_name（小写字母、数字和连字符）');
  }
  const files = collectSourceFiles(request.sourceDir, request.outputDir);
  if (files.length === 0) {
    return failure('build_config_invalid', '项目目录没有可安装的源文件', '在项目根目录提供应用源码后重试');
  }

  const outputDir = path.resolve(request.outputDir ?? path.join(request.sourceDir, '.deliverkit', 'artifacts'));
  fs.mkdirSync(outputDir, { recursive: true });
  const workDir = path.join(outputDir, '.windows-msi');
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });
  const sourcePath = path.join(workDir, `${packageName}.wxs`);
  const pfxPath = path.join(workDir, `${packageName}.pfx`);
  const artifactPath = path.join(outputDir, `${packageName}-0.1.0-x64.msi`);
  const installLogPath = path.join(outputDir, 'logs', `${packageName}-msi-install.log`);
  const logDir = path.join(outputDir, 'logs');
  fs.mkdirSync(logDir, { recursive: true });

  try {
    fs.writeFileSync(sourcePath, renderWixSource(request.sourceDir, packageName, files), 'utf8');
    const decodedPfx = Buffer.from(pfxBase64, 'base64');
    if (decodedPfx.length === 0) {
      return failure('signing_material_missing', 'DELIVERKIT_WINDOWS_PFX_BASE64 不是有效的非空 PFX', '重新导出 PFX 并以 base64 写入 GitHub Actions secret');
    }
    fs.writeFileSync(pfxPath, decodedPfx);

    const build = runner('wix', ['build', sourcePath, '-d', `SourceDir=${request.sourceDir}`, '-o', artifactPath], {
      timeout: 10 * 60_000, logDir, logFileName: `${packageName}-msi-build.log`,
    });
    if (!build.success || !fs.existsSync(artifactPath)) {
      return failure('build_failed', `MSI 构建失败（退出码 ${build.exitCode}）`, '查看 WiX 构建日志并修正项目源文件或 WiX 配置', build.logPath);
    }

    const signArgs = ['sign', '/fd', 'SHA256', '/td', 'SHA256', '/tr', 'http://timestamp.digicert.com', '/f', pfxPath, '/p', pfxPassword, artifactPath];
    const sign = runner('signtool', signArgs, {
      timeout: 2 * 60_000,
      logDir,
      logFileName: `${packageName}-msi-sign.log`,
      redactedArgs: signArgs.map((arg) => arg === pfxPassword ? '<redacted>' : arg),
    });
    if (!sign.success) {
      return failure('verification_failed', `MSI Authenticode 签名失败（退出码 ${sign.exitCode}）`, '检查 PFX、密码、证书用途与时间戳服务', sign.logPath);
    }

    const signature = runner('signtool', ['verify', '/pa', '/all', artifactPath], {
      timeout: 2 * 60_000, logDir, logFileName: `${packageName}-msi-signature-verify.log`,
    });
    if (!signature.success) {
      return failure('verification_failed', `MSI 签名验证失败（退出码 ${signature.exitCode}）`, '检查证书链、签名用途与时间戳', signature.logPath);
    }

    const install = runner('msiexec', ['/i', artifactPath, '/qn', '/norestart', '/L*v', installLogPath], {
      timeout: 5 * 60_000, logDir, logFileName: `${packageName}-msi-install-command.log`,
    });
    if (!acceptableMsiExit(install)) {
      return failure('verification_failed', `MSI 静默安装验证失败（退出码 ${install.exitCode}）`, '查看 msiexec 安装日志并修正 MSI 目录或组件配置', install.logPath);
    }

    const uninstall = runner('msiexec', ['/x', artifactPath, '/qn', '/norestart'], {
      timeout: 5 * 60_000, logDir, logFileName: `${packageName}-msi-uninstall-command.log`,
    });
    if (!acceptableMsiExit(uninstall)) {
      return failure('verification_failed', `MSI 卸载验证失败（退出码 ${uninstall.exitCode}）`, '查看 msiexec 卸载日志并修正 MSI 升级码', uninstall.logPath);
    }

    const stat = fs.statSync(artifactPath);
    return {
      status: 'success',
      artifacts: [{
        type: 'msi',
        path: artifactPath,
        checksum: sha256File(artifactPath),
        size_bytes: stat.size,
        metadata: {
          package_name: packageName,
          build_tool: 'WiX Toolset v4',
          signing_tool: 'signtool Authenticode SHA256',
          verification_tool: 'msiexec /qn',
          install_log: installLogPath,
          verified_checks: ['signtool verify /pa /all', 'msiexec silent install', 'msiexec silent uninstall'],
        },
      }],
      logs: { path: build.logPath, summary: 'Windows runner 中完成 MSI 构建、签名与静默安装/卸载验证', full_available: true },
      decision_basis: {
        target_platform: 'windows',
        target_version: 'Windows 10/11 x86_64',
        build_method: 'WiX v4 + Authenticode signing + msiexec verification',
        risks_acknowledged: ['签名材料只从 CI environment 注入，未写入仓库'],
      },
    };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

function renderWixSource(sourceDir: string, packageName: string, files: string[]): string {
  const root = makeDirectoryNode('root', 'INSTALLFOLDER');
  for (const file of files) {
    addFile(root, file, sourceDir);
  }
  const componentRefs: string[] = [];
  const directoryXml = renderDirectory(root, sourceDir, componentRefs, 4);
  const references = componentRefs.map((id) => `      <ComponentRef Id="${id}" />`).join('\n');
  return [
    '<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs">',
    `  <Package Name="${xmlEscape(packageName)}" Manufacturer="DeliverKit" Version="1.0.0.0" UpgradeCode="${packageGuid(packageName)}">`,
    '    <MajorUpgrade DowngradeErrorMessage="A newer version is already installed." />',
    '    <MediaTemplate EmbedCab="yes" />',
    '    <Feature Id="MainFeature" Title="Application" Level="1">',
    references,
    '    </Feature>',
    '  </Package>',
    '  <Fragment>',
    '    <StandardDirectory Id="ProgramFilesFolder">',
    `      <Directory Id="INSTALLFOLDER" Name="${xmlEscape(packageName)}" />`,
    '    </StandardDirectory>',
    '  </Fragment>',
    '  <Fragment>',
    '    <DirectoryRef Id="INSTALLFOLDER">',
    directoryXml,
    '    </DirectoryRef>',
    '  </Fragment>',
    '</Wix>',
    '',
  ].join('\n');
}

interface DirectoryNode {
  name: string;
  id: string;
  files: string[];
  children: Map<string, DirectoryNode>;
}

function makeDirectoryNode(name: string, id: string): DirectoryNode {
  return { name, id, files: [], children: new Map() };
}

function addFile(root: DirectoryNode, file: string, sourceDir: string): void {
  const parts = path.relative(sourceDir, file).split(path.sep);
  let node = root;
  for (const directoryName of parts.slice(0, -1)) {
    let child = node.children.get(directoryName);
    if (!child) {
      child = makeDirectoryNode(directoryName, `dir_${stableId(path.join(node.id, directoryName))}`);
      node.children.set(directoryName, child);
    }
    node = child;
  }
  node.files.push(file);
}

function renderDirectory(root: DirectoryNode, sourceDir: string, componentRefs: string[], indent: number): string {
  const lines: string[] = [];
  for (const file of root.files) {
    const componentId = `cmp_${stableId(file)}`;
    const fileId = `fil_${stableId(file)}`;
    componentRefs.push(componentId);
    const prefix = ' '.repeat(indent);
    lines.push(`${prefix}<Component Id="${componentId}" Guid="*">`);
    lines.push(`${prefix}  <File Id="${fileId}" Source="$(var.SourceDir)\\${xmlEscape(path.relative(sourceDir, file).split(path.sep).join('\\'))}" KeyPath="yes" />`);
    lines.push(`${prefix}</Component>`);
  }
  for (const child of root.children.values()) {
    const prefix = ' '.repeat(indent);
    lines.push(`${prefix}<Directory Id="${child.id}" Name="${xmlEscape(child.name)}">`);
    lines.push(renderDirectory(child, sourceDir, componentRefs, indent + 2));
    lines.push(`${prefix}</Directory>`);
  }
  return lines.join('\n');
}

function collectSourceFiles(sourceDir: string, outputDir?: string): string[] {
  const files: string[] = [];
  const root = path.resolve(sourceDir);
  const excluded = new Set([path.resolve(outputDir ?? path.join(sourceDir, '.deliverkit'))]);
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === '.deliverkit') { continue; }
      const full = path.join(dir, entry.name);
      if (excluded.has(full)) { continue; }
      if (entry.isDirectory()) { walk(full); }
      else if (entry.isFile()) { files.push(full); }
    }
  };
  walk(root);
  return files.sort();
}

function normalizePackageName(value: string): string | null {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized.length >= 2 && /^[a-z0-9][a-z0-9-]+$/.test(normalized) ? normalized : null;
}

function stableId(value: string): string {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 12);
}

function packageGuid(packageName: string): string {
  const hex = crypto.createHash('md5').update(`deliverkit:${packageName}`).digest('hex');
  return `{${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}}`;
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function acceptableMsiExit(result: CommandLogResult): boolean {
  return result.success || result.exitCode === 0 || result.exitCode === 3010;
}

function hasWindowsToolchain(): boolean {
  return commandExists('wix') && commandExists('signtool') && commandExists('msiexec');
}

function failure(code: ErrorCode, summary: string, suggestedFix: string, detailLog?: string): ForgeKitResult {
  return { status: 'failed', error: { code, summary, suggested_fix: suggestedFix, detail_log: detailLog } };
}
