/** Aggregate platform result JSON files into one evidence-bearing manifest. */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadForgeContract } from './forge-contract.js';
import type { Artifact, ErrorCode, ForgeKitResult } from './types.js';
import { sha256File } from './utils/checksum.js';
import { getGitInfo } from './utils/git-info.js';
import { assertSourceDir, assertWithinRoot, PathValidationError, pathExists } from './utils/filesystem.js';

export interface GenerateReleaseManifestRequest {
  sourceDir: string;
  planPath: string;
  resultsDir?: string;
  outputPath?: string;
}

interface ResultDocument {
  status?: 'success' | 'failed';
  artifacts?: Artifact[];
  error?: { summary?: string };
}

interface ManifestArtifact extends Artifact {
  verification: {
    status: 'verified' | 'unverified';
    evidence: string[];
    source_result: string;
  };
}

export function generateReleaseManifest(request: GenerateReleaseManifestRequest): ForgeKitResult {
  try {
    assertSourceDir(request.sourceDir);
  } catch (error) {
    if (error instanceof PathValidationError) {return failure(error.code, error.message, '提供包含项目源码的有效目录');}
    throw error;
  }
  if (!pathExists(request.planPath)) {return failure('plan_not_found', `Forge.md 交付契约文件不存在: ${request.planPath}`, '先调用 generate_packaging_plan 生成计划');}
  const loaded = loadForgeContract(request.planPath, request.sourceDir);
  if (!loaded.ok) {return failure('plan_invalid', loaded.reason, '重新生成 Forge.md 并审查 Delivery Targets');}

  const resultsDir = path.resolve(request.resultsDir ?? path.join(request.sourceDir, '.deliverkit', 'results'));
  const outputPath = path.resolve(request.outputPath ?? path.join(request.sourceDir, 'ReleaseManifest.json'));
  try {
    assertWithinRoot(resultsDir, request.sourceDir);
    assertWithinRoot(outputPath, request.sourceDir);
  } catch (error) {
    if (error instanceof PathValidationError) {return failure(error.code, error.message, '将 results_dir/output_path 放在项目根目录内');}
    throw error;
  }
  if (!pathExists(resultsDir)) {return failure('artifact_not_found', `没有找到平台结果目录: ${resultsDir}`, '在每个平台构建命令后保存 ForgeKit JSON 结果，再生成 ReleaseManifest.json');}

  const warnings: string[] = [];
  const manifestArtifacts: ManifestArtifact[] = [];
  const resultFiles = fs.readdirSync(resultsDir).filter((name) => name.endsWith('.json')).sort();
  for (const resultFile of resultFiles) {
    const resultPath = path.join(resultsDir, resultFile);
    let document: ResultDocument;
    try {
      document = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as ResultDocument;
    } catch (error) {
      warnings.push(`${resultFile}: 无法解析结果 JSON（${error instanceof Error ? error.message : String(error)}）`);
      continue;
    }
    if (document.status !== 'success') {
      warnings.push(`${resultFile}: 平台结果未成功${document.error?.summary ? `（${document.error.summary}）` : ''}`);
      continue;
    }
    for (const artifact of document.artifacts ?? []) {
      const artifactPath = resolveArtifactPath(artifact.path, request.sourceDir);
      if (!pathExists(artifactPath)) {
        warnings.push(`${resultFile}: 产物不存在 ${artifactPath}`);
        continue;
      }
      const checksum = sha256File(artifactPath);
      if (artifact.checksum && artifact.checksum !== checksum) {
        warnings.push(`${resultFile}: SHA256 不匹配 ${artifactPath}`);
        continue;
      }
      const metadata = artifact.metadata ?? {};
      const evidence = Array.isArray(metadata.verified_checks) ? metadata.verified_checks.filter((value): value is string => typeof value === 'string') : [];
      manifestArtifacts.push({
        ...artifact,
        path: artifactPath,
        checksum,
        size_bytes: fs.statSync(artifactPath).size,
        verification: { status: evidence.length > 0 ? 'verified' : 'unverified', evidence, source_result: resultPath },
      });
    }
  }

  const targets = loaded.contract.delivery_targets.map((target) => ({ ecosystem: target.ecosystem, artifacts: target.artifacts }));
  const expectedArtifacts = loaded.contract.delivery_targets.flatMap((target) =>
    target.artifacts.map((artifact) => ({ ecosystem: target.ecosystem, artifact }))
  );
  const observedArtifacts = new Set(manifestArtifacts.map((artifact) => artifactIdentity(artifact.type)));
  for (const expected of expectedArtifacts) {
    const identity = artifactIdentity(expected.artifact);
    if (!observedArtifacts.has(identity)) {
      warnings.push(`缺少 Forge.md 声明的产物: ${expected.ecosystem}/${expected.artifact}`);
    }
  }
  const unverified = manifestArtifacts.filter((artifact) => artifact.verification.status !== 'verified');
  const manifest = {
    schema_version: 1,
    status: manifestArtifacts.length > 0 && unverified.length === 0 && warnings.length === 0 ? 'verified' : 'incomplete',
    generated_at: new Date().toISOString(),
    source_dir: path.resolve(request.sourceDir),
    plan_path: path.resolve(request.planPath),
    git: getGitInfo(request.sourceDir),
    delivery_targets: targets,
    artifacts: manifestArtifacts,
    warnings,
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  if (manifest.status !== 'verified') {
    return failure('verification_failed', `Release Manifest 未达到 verified（${warnings.length} 个警告，${unverified.length} 个未验证产物）`, '修复失败结果、SHA256 或验证证据后重新生成', outputPath);
  }
  return {
    status: 'success',
    artifacts: [{ type: 'release-manifest', path: outputPath, checksum: sha256File(outputPath), size_bytes: fs.statSync(outputPath).size, metadata: { artifact_count: manifestArtifacts.length, target_count: targets.length } }],
    logs: { path: outputPath, summary: `Release Manifest 已汇总 ${manifestArtifacts.length} 个已验证产物`, full_available: true },
    decision_basis: { target_platform: 'multi-ecosystem', build_method: 'structured ForgeKit results + SHA256 + verification evidence', risks_acknowledged: ['Manifest is incomplete when any target lacks a successful evidence-bearing result'] },
  };
}

function artifactIdentity(type: string): string {
  switch (type) {
    case 'deb':
    case 'deb-package':
      return 'deb';
    case 'rpm':
    case 'rpm-package':
      return 'rpm';
    case 'msi':
      return 'msi';
    case 'dmg':
      return 'dmg';
    case 'hap':
      return 'hap';
    case 'app':
      return 'app';
    case 'appimage':
      return 'appimage';
    default:
      return type;
  }
}

function failure(code: ErrorCode, summary: string, suggestedFix: string, detailLog?: string): ForgeKitResult {
  return { status: 'failed', error: { code, summary, suggested_fix: suggestedFix, detail_log: detailLog } };
}

function resolveArtifactPath(artifactPath: string, sourceDir: string): string {
  const direct = path.isAbsolute(artifactPath) ? artifactPath : path.resolve(sourceDir, artifactPath);
  if (pathExists(direct)) {return direct;}
  const basename = path.basename(artifactPath);
  const artifactRoot = path.join(sourceDir, '.deliverkit', 'artifacts');
  let match: string | null = null;
  const walk = (dir: string): void => {
    if (match || !pathExists(dir)) {return;}
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {walk(full);}
      else if (entry.isFile() && entry.name === basename) { match = full; return; }
    }
  };
  walk(artifactRoot);
  return match ?? direct;
}
