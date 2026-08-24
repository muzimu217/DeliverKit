/** HarmonyOS HAP/APP build and hdc installation verification. */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { contractIncludesArtifact, loadForgeContract } from './forge-contract.js';
import type { ErrorCode, ForgeKitResult } from './types.js';
import { sha256File } from './utils/checksum.js';
import { commandExists, runCommandWithLog, type CommandLogResult } from './utils/command.js';
import { assertSourceDir, PathValidationError, pathExists } from './utils/filesystem.js';

export interface PackHarmonyosRequest {
  sourceDir: string;
  planPath: string;
  outputDir?: string;
  artifact?: 'hap' | 'app';
  platform?: NodeJS.Platform;
  environment?: NodeJS.ProcessEnv;
}

export type HarmonyCommandRunner = (command: string, args: string[], options: { timeout?: number; logDir?: string; logFileName?: string; env?: NodeJS.ProcessEnv }) => CommandLogResult;

export function packHarmonyos(
  request: PackHarmonyosRequest,
  runner: HarmonyCommandRunner = runCommandWithLog,
  toolchainAvailable: () => boolean = hasHarmonyToolchain
): ForgeKitResult {
  try {
    assertSourceDir(request.sourceDir);
  } catch (error) {
    if (error instanceof PathValidationError) {return failure(error.code, error.message, '提供包含 HarmonyOS 工程的有效目录');}
    throw error;
  }
  if (!pathExists(request.planPath)) {return failure('plan_not_found', `Forge.md 交付契约文件不存在: ${request.planPath}`, '先调用 generate_packaging_plan 生成计划');}
  const loaded = loadForgeContract(request.planPath, request.sourceDir);
  if (!loaded.ok) {return failure('plan_invalid', loaded.reason, '重新生成 Forge.md 并审查 Delivery Targets');}
  const artifact = request.artifact ?? (contractIncludesArtifact(loaded.contract, 'mobile/harmonyos', 'app') ? 'app' : 'hap');
  if (!contractIncludesArtifact(loaded.contract, 'mobile/harmonyos', artifact)) {return failure('plan_invalid', `Forge.md 未声明 mobile/harmonyos 的 ${artifact} 交付目标`, '使用 goals 包含 harmonyos/hap 或 harmonyos/app 重新生成 Forge.md');}
  const platform = request.platform ?? process.platform;
  if (platform !== 'linux' && platform !== 'win32') {return failure('toolchain_not_available', 'HarmonyOS 构建当前要求 Linux 或 Windows DevEco runner', '使用 generate_ci_workflow 生成 Linux/Windows HarmonyOS job');}
  if (!toolchainAvailable()) {return failure('toolchain_not_available', 'HarmonyOS runner 缺少 hvigorw、ohpm 或 hdc 工具链', '安装 DevEco Command Line Tools 并确认 hvigorw、ohpm、hdc 在 PATH');}
  const env = request.environment ?? process.env;
  const missing = ['AGC_CERT_P12', 'AGC_RELEASE_PROFILE_P7B'].filter((name) => !env[name]);
  if (missing.length > 0) {return failure('signing_material_missing', `缺少 HarmonyOS AGC 正式签名材料: ${missing.join(', ')}`, '配置 AGC_CERT_P12 与 AGC_RELEASE_PROFILE_P7B secrets；不要将证书提交到仓库');}

  const outputDir = path.resolve(request.outputDir ?? path.join(request.sourceDir, '.deliverkit', 'artifacts'));
  const logDir = path.join(outputDir, 'logs');
  const signingDir = path.join(outputDir, '.harmonyos-signing');
  fs.mkdirSync(logDir, { recursive: true });
  fs.rmSync(signingDir, { recursive: true, force: true });
  fs.mkdirSync(signingDir, { recursive: true });
  const certPath = materializeSecret(env.AGC_CERT_P12, path.join(signingDir, 'release.p12'));
  const profilePath = materializeSecret(env.AGC_RELEASE_PROFILE_P7B, path.join(signingDir, 'release.p7b'));
  if (!certPath || !profilePath) {
    fs.rmSync(signingDir, { recursive: true, force: true });
    return failure('signing_material_missing', 'HarmonyOS AGC 签名材料不是有效的路径或 base64 内容', '将 AGC_CERT_P12 与 AGC_RELEASE_PROFILE_P7B 配置为文件路径或 base64 secrets');
  }
  const signingEnv = { ...env, AGC_CERT_P12_PATH: certPath, AGC_RELEASE_PROFILE_P7B_PATH: profilePath, DELIVERKIT_AGC_CERT_P12_PATH: certPath, DELIVERKIT_AGC_RELEASE_PROFILE_P7B_PATH: profilePath };
  try {
    const buildTask = artifact === 'app' ? 'assembleApp' : 'assembleHap';
    const build = runner('hvigorw', [buildTask, '--mode', 'module', '-p', 'product=default'], { timeout: 15 * 60_000, logDir, logFileName: 'harmonyos-build.log', env: signingEnv });
    if (!build.success) {return failure('build_failed', `HarmonyOS ${artifact} 构建失败（退出码 ${build.exitCode}）`, '查看 hvigorw 日志并修正签名配置或 SDK 版本', build.logPath);}
    const built = findArtifact(request.sourceDir, artifact);
    if (!built) {return failure('artifact_not_found', `构建成功但没有找到 .${artifact} 产物`, '检查 hvigorw 输出目录与模块产物配置', build.logPath);}
    fs.mkdirSync(outputDir, { recursive: true });
    const artifactPath = path.join(outputDir, path.basename(built));
    fs.copyFileSync(built, artifactPath);

    const install = runner('hdc', ['install', artifactPath], { timeout: 5 * 60_000, logDir, logFileName: 'harmonyos-install.log', env: signingEnv });
    if (!install.success) {return failure('verification_failed', `hdc 安装验证失败（退出码 ${install.exitCode}）`, '连接已授权 HarmonyOS 真机/云手机并检查包签名', install.logPath);}
    const stat = fs.statSync(artifactPath);
    return {
      status: 'success',
      artifacts: [{ type: artifact, path: artifactPath, checksum: sha256File(artifactPath), size_bytes: stat.size, metadata: { verification_log: install.logPath, verified_checks: ['hvigorw release build', 'AGC signing material injected', 'hdc install'] } }],
      logs: { path: build.logPath, summary: `HarmonyOS ${artifact} 构建与 hdc 安装验证完成`, full_available: true },
      decision_basis: { target_platform: 'harmonyos', target_version: 'API_17+', build_method: 'hvigorw + AGC signing + hdc install', risks_acknowledged: ['Real-device/cloud-phone runtime evidence is required before AppGallery release'] },
    };
  } finally {
    fs.rmSync(signingDir, { recursive: true, force: true });
  }
}

function materializeSecret(value: string | undefined, targetPath: string): string | null {
  if (!value) {return null;}
  if (pathExists(value)) {
    fs.copyFileSync(value, targetPath);
    return targetPath;
  }
  try {
    const decoded = Buffer.from(value, 'base64');
    if (decoded.length === 0) {return null;}
    fs.writeFileSync(targetPath, decoded);
    return targetPath;
  } catch {
    return null;
  }
}

function findArtifact(sourceDir: string, artifact: 'hap' | 'app'): string | null {
  const suffix = `.${artifact}`;
  let found: string | null = null;
  const walk = (dir: string): void => {
    if (found) {return;}
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === '.deliverkit') {continue;}
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {walk(full);}
      else if (entry.isFile() && entry.name.endsWith(suffix)) { found = full; return; }
    }
  };
  walk(sourceDir);
  return found;
}

function hasHarmonyToolchain(): boolean {
  return commandExists('hvigorw') && commandExists('ohpm') && commandExists('hdc');
}

function failure(code: ErrorCode, summary: string, suggestedFix: string, detailLog?: string): ForgeKitResult {
  return { status: 'failed', error: { code, summary, suggested_fix: suggestedFix, detail_log: detailLog } };
}
