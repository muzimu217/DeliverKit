/** macOS DMG/PKG signing, notarization, and Gatekeeper verification capability. */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { contractIncludesArtifact, loadForgeContract } from './forge-contract.js';
import type { ErrorCode, ForgeKitResult } from './types.js';
import { sha256File } from './utils/checksum.js';
import { commandExists, runCommandWithLog, type CommandLogResult } from './utils/command.js';
import { assertSourceDir, PathValidationError, pathExists } from './utils/filesystem.js';

export interface PackMacosRequest {
  sourceDir: string;
  planPath: string;
  outputDir?: string;
  packageName?: string;
  artifact?: 'dmg' | 'pkg';
  platform?: NodeJS.Platform;
  environment?: NodeJS.ProcessEnv;
}

export interface MacosCommandOptions {
  cwd?: string;
  timeout?: number;
  logDir?: string;
  logFileName?: string;
  redactedArgs?: string[];
}

export type MacosCommandRunner = (command: string, args: string[], options: MacosCommandOptions) => CommandLogResult;

export function packMacos(
  request: PackMacosRequest,
  runner: MacosCommandRunner = runCommandWithLog,
  toolchainAvailable: () => boolean = hasMacosToolchain
): ForgeKitResult {
  try {
    assertSourceDir(request.sourceDir);
  } catch (error) {
    if (error instanceof PathValidationError) {return failure(error.code, error.message, '提供包含项目源码的有效目录');}
    throw error;
  }
  if (!pathExists(request.planPath)) {return failure('plan_not_found', `Forge.md 交付契约文件不存在: ${request.planPath}`, '先调用 generate_packaging_plan 生成计划');}
  const loaded = loadForgeContract(request.planPath, request.sourceDir);
  if (!loaded.ok) {return failure('plan_invalid', loaded.reason, '重新生成 Forge.md 并审查 Delivery Targets');}
  const artifact = request.artifact ?? (
    contractIncludesArtifact(loaded.contract, 'desktop/macos', 'dmg') ? 'dmg' : 'pkg'
  );
  if (!contractIncludesArtifact(loaded.contract, 'desktop/macos', artifact)) {
    return failure('plan_invalid', `Forge.md 未声明 desktop/macos 的 ${artifact} 交付目标`, '使用 goals 包含 macos-dmg 或 macos-pkg 重新生成 Forge.md 后再构建');
  }
  if ((request.platform ?? process.platform) !== 'darwin') {
    return failure('toolchain_not_available', `macOS ${artifact.toUpperCase()} 必须在 macos runner 上签名、公证并验证`, '使用 generate_ci_workflow 生成 macOS 工作流');
  }
  if (!toolchainAvailable()) {return failure('toolchain_not_available', 'macOS runner 缺少 xcodebuild/codesign/hdiutil/productbuild/productsign/xcrun/spctl 工具链', '安装 Xcode Command Line Tools 并确认 Apple 工具在 PATH');}

  const env = request.environment ?? process.env;
  const required = ['DELIVERKIT_APPLE_CERTIFICATE_BASE64', 'DELIVERKIT_APPLE_CERTIFICATE_PASSWORD', 'DELIVERKIT_APPLE_SIGNING_IDENTITY', 'DELIVERKIT_APPLE_TEAM_ID', 'DELIVERKIT_APPLE_ID', 'DELIVERKIT_APPLE_APP_PASSWORD'];
  if (artifact === 'pkg') {required.push('DELIVERKIT_APPLE_INSTALLER_IDENTITY');}
  const missing = required.filter((name) => !env[name]);
  if (missing.length > 0) {return failure('signing_material_missing', `缺少 Apple 签名/公证材料: ${missing.join(', ')}`, '配置 macOS CI secrets；不要把 P12、密码或 Apple ID 写入仓库');}

  const packageName = normalizePackageName(request.packageName ?? loaded.contract.project.name);
  if (!packageName) {return failure('build_config_invalid', '项目名无法转换为合法 macOS 包名', '传入 package_name（小写字母、数字和连字符）');}
  const appPath = findAppBundle(request.sourceDir);
  if (!appPath) {return failure('build_config_invalid', '项目目录中没有可签名的 .app bundle', '先在 Xcode 中构建 .app，或提供包含 .app 的 macOS 项目');}

  const outputDir = path.resolve(request.outputDir ?? path.join(request.sourceDir, '.deliverkit', 'artifacts'));
  const workDir = path.join(outputDir, `.macos-${artifact}`);
  const artifactPath = path.join(outputDir, `${packageName}-0.1.0.${artifact}`);
  const p12Path = path.join(workDir, `${packageName}.p12`);
  const logDir = path.join(outputDir, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });
  try {
    const p12 = Buffer.from(env.DELIVERKIT_APPLE_CERTIFICATE_BASE64!, 'base64');
    if (p12.length === 0) {return failure('signing_material_missing', 'Apple certificate base64 为空或无效', '重新导出 Developer ID P12 并写入 secret');}
    fs.writeFileSync(p12Path, p12);

    const importArgs = ['import', p12Path, '-P', env.DELIVERKIT_APPLE_CERTIFICATE_PASSWORD!, '-T', '/usr/bin/codesign', '-T', '/usr/bin/productsign'];
    const imported = runner('security', importArgs, { timeout: 60_000, logDir, logFileName: `${packageName}-certificate-import.log`, redactedArgs: importArgs.map((arg) => arg === env.DELIVERKIT_APPLE_CERTIFICATE_PASSWORD ? '<redacted>' : arg) });
    if (!imported.success) {return failure('build_failed', `Apple 证书导入失败（退出码 ${imported.exitCode}）`, '检查 P12 密码与证书用途', imported.logPath);}

    const sign = runner('codesign', ['--deep', '--force', '--options', 'runtime', '--timestamp', '--sign', env.DELIVERKIT_APPLE_SIGNING_IDENTITY!, appPath], { timeout: 5 * 60_000, logDir, logFileName: `${packageName}-codesign.log` });
    if (!sign.success) {return failure('verification_failed', `macOS codesign 失败（退出码 ${sign.exitCode}）`, '检查 Developer ID Application identity 与 bundle entitlements', sign.logPath);}

    const verifyCode = runner('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], { timeout: 2 * 60_000, logDir, logFileName: `${packageName}-codesign-verify.log` });
    if (!verifyCode.success) {return failure('verification_failed', `codesign 验证失败（退出码 ${verifyCode.exitCode}）`, '修正嵌套 bundle、签名身份或 entitlements', verifyCode.logPath);}

    const packageBuild = artifact === 'dmg'
      ? runner('hdiutil', ['create', '-volname', packageName, '-srcfolder', appPath, '-ov', '-format', 'UDZO', artifactPath], { timeout: 5 * 60_000, logDir, logFileName: `${packageName}-dmg-build.log` })
      : buildPkg(runner, appPath, artifactPath, workDir, env.DELIVERKIT_APPLE_INSTALLER_IDENTITY!, packageName, logDir);
    if (!packageBuild.success || !fs.existsSync(artifactPath)) {return failure('build_failed', `${artifact.toUpperCase()} 构建失败（退出码 ${packageBuild.exitCode}）`, `检查 ${artifact === 'dmg' ? 'hdiutil' : 'productbuild/productsign'} 输入、签名身份与输出目录`, packageBuild.logPath);}

    const notarizeArgs = ['notarytool', 'submit', artifactPath, '--apple-id', env.DELIVERKIT_APPLE_ID!, '--team-id', env.DELIVERKIT_APPLE_TEAM_ID!, '--password', env.DELIVERKIT_APPLE_APP_PASSWORD!, '--wait'];
    const notarize = runner('xcrun', notarizeArgs, { timeout: 20 * 60_000, logDir, logFileName: `${packageName}-notary.log`, redactedArgs: notarizeArgs.map((arg) => arg === env.DELIVERKIT_APPLE_APP_PASSWORD ? '<redacted>' : arg) });
    if (!notarize.success) {return failure('verification_failed', `Apple 公证失败（退出码 ${notarize.exitCode}）`, '检查 Apple ID、Team ID、App 专用密码与公证状态', notarize.logPath);}

    const stapler = runner('xcrun', ['stapler', 'validate', artifactPath], { timeout: 5 * 60_000, logDir, logFileName: `${packageName}-stapler.log` });
    if (!stapler.success) {return failure('verification_failed', `公证票据验证失败（退出码 ${stapler.exitCode}）`, '确认 notarytool accepted 后重新 stapler validate', stapler.logPath);}

    const spctlArgs = artifact === 'dmg'
      ? ['--assess', '--type', 'open', '--context', 'context:primary-signature', appPath]
      : ['--assess', '--type', 'install', '--context', 'context:primary-signature', artifactPath];
    const spctl = runner('spctl', spctlArgs, { timeout: 2 * 60_000, logDir, logFileName: `${packageName}-spctl.log` });
    if (!spctl.success) {return failure('verification_failed', `Gatekeeper spctl 验证失败（退出码 ${spctl.exitCode}）`, '确认 Developer ID 签名、公证票据与安装包内容完整', spctl.logPath);}

    const stat = fs.statSync(artifactPath);
    return {
      status: 'success',
      artifacts: [{ type: artifact, path: artifactPath, checksum: sha256File(artifactPath), size_bytes: stat.size, metadata: { package_name: packageName, signing_tool: artifact === 'dmg' ? 'codesign Developer ID' : 'productsign Developer ID Installer', notarization_tool: 'xcrun notarytool', verified_checks: ['codesign --verify --deep --strict', ...(artifact === 'dmg' ? ['hdiutil create'] : ['productbuild', 'productsign']), 'spctl --assess', 'notarytool accepted', 'stapler validate'] } }],
      logs: { path: packageBuild.logPath, summary: `macOS runner 中完成 ${artifact.toUpperCase()} 构建、签名、公证与票据验证`, full_available: true },
      decision_basis: { target_platform: 'macos', target_version: 'macOS 14+', build_method: artifact === 'dmg' ? 'codesign + hdiutil + xcrun notarytool + spctl' : 'codesign + productbuild + productsign + xcrun notarytool + spctl', risks_acknowledged: ['Apple credentials are injected from CI environment only'] },
    };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

function buildPkg(
  runner: MacosCommandRunner,
  appPath: string,
  artifactPath: string,
  workDir: string,
  installerIdentity: string,
  packageName: string,
  logDir: string
): CommandLogResult {
  const unsignedPath = path.join(workDir, `${packageName}-unsigned.pkg`);
  const productBuild = runner('productbuild', ['--component', appPath, '/Applications', unsignedPath], {
    timeout: 5 * 60_000,
    logDir,
    logFileName: `${packageName}-productbuild.log`,
  });
  if (!productBuild.success || !fs.existsSync(unsignedPath)) {return productBuild;}
  return runner('productsign', ['--sign', installerIdentity, unsignedPath, artifactPath], {
    timeout: 5 * 60_000,
    logDir,
    logFileName: `${packageName}-productsign.log`,
  });
}

function findAppBundle(sourceDir: string): string | null {
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  const direct = entries.find((entry) => entry.isDirectory() && entry.name.endsWith('.app'));
  return direct ? path.join(sourceDir, direct.name) : null;
}

function normalizePackageName(value: string): string | null {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized.length >= 2 && /^[a-z0-9][a-z0-9-]+$/.test(normalized) ? normalized : null;
}

function hasMacosToolchain(): boolean {
  return commandExists('xcodebuild') && commandExists('codesign') && commandExists('hdiutil') && commandExists('productbuild') && commandExists('productsign') && commandExists('xcrun') && commandExists('spctl');
}

function failure(code: ErrorCode, summary: string, suggestedFix: string, detailLog?: string): ForgeKitResult {
  return { status: 'failed', error: { code, summary, suggested_fix: suggestedFix, detail_log: detailLog } };
}
