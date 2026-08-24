/** Generate a reviewable GitHub Actions workflow from a Forge contract. */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { contractIncludesArtifact, loadForgeContract } from './forge-contract.js';
import type { ErrorCode, ForgeKitResult } from './types.js';
import { assertSourceDir, assertWithinRoot, PathValidationError, pathExists } from './utils/filesystem.js';

export interface GenerateCiWorkflowRequest {
  sourceDir: string;
  planPath: string;
  outputPath?: string;
  overwrite?: boolean;
}

export function generateCiWorkflow(request: GenerateCiWorkflowRequest): ForgeKitResult {
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

  const linuxArtifacts = [
    ['deb', 'pack-deb'],
    ['rpm', 'pack-rpm'],
    ['appimage', 'pack-appimage'],
  ].filter(([artifact]) => loaded.contract.delivery_targets.some((target) => target.artifacts.includes(artifact)));
  const hasWindows = contractIncludesArtifact(loaded.contract, 'desktop/windows', 'msi');
  const macosArtifacts = ['dmg', 'pkg'].filter((artifact) => contractIncludesArtifact(loaded.contract, 'desktop/macos', artifact));
  const hasMacos = macosArtifacts.length > 0;
  const hasHarmony = loaded.contract.delivery_targets.some((target) => target.ecosystem === 'mobile/harmonyos' && target.artifacts.some((artifact) => artifact === 'hap' || artifact === 'app'));
  if (linuxArtifacts.length === 0 && !hasWindows && !hasMacos && !hasHarmony) {
    return failure('plan_invalid', 'Forge.md 没有可由当前 CI 编排器处理的 Linux、Windows、macOS 或 HarmonyOS 目标', '重新生成包含 Linux、windows-msi、macos-dmg、macos-pkg 或 harmonyos/hap 的 Forge.md');
  }

  const outputPath = path.resolve(request.outputPath ?? path.join(request.sourceDir, '.github', 'workflows', 'deliverkit.yml'));
  try {
    assertWithinRoot(outputPath, request.sourceDir);
  } catch (error) {
    if (error instanceof PathValidationError) {
      return failure(error.code, error.message, '将 output_path 放在项目根目录内');
    }
    throw error;
  }
  if (pathExists(outputPath) && !request.overwrite) {
    return failure('build_config_invalid', `GitHub Actions 工作流已存在: ${outputPath}`, '审查现有工作流后传入 overwrite=true，或指定新的 output_path');
  }

  const workflow = renderWorkflow(linuxArtifacts.map(([, command]) => command), hasWindows, macosArtifacts, hasHarmony);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, workflow, 'utf8');

  const jobs = [
    ...(linuxArtifacts.length > 0 ? ['linux-pack'] : []),
    ...(hasWindows ? ['windows-msi'] : []),
    ...(hasMacos ? ['macos-package'] : []),
    ...(hasHarmony ? ['harmonyos'] : []),
    'release-manifest',
  ];
  return {
    status: 'success',
    artifacts: [{
      type: 'github-actions-workflow',
      path: outputPath,
      size_bytes: Buffer.byteLength(workflow),
      metadata: { jobs, secrets: [...(hasWindows ? ['DELIVERKIT_WINDOWS_PFX_BASE64', 'DELIVERKIT_WINDOWS_PFX_PASSWORD'] : []), ...(hasMacos ? ['DELIVERKIT_APPLE_CERTIFICATE_BASE64', 'DELIVERKIT_APPLE_CERTIFICATE_PASSWORD', 'DELIVERKIT_APPLE_SIGNING_IDENTITY', 'DELIVERKIT_APPLE_TEAM_ID', 'DELIVERKIT_APPLE_ID', 'DELIVERKIT_APPLE_APP_PASSWORD', ...(macosArtifacts.includes('pkg') ? ['DELIVERKIT_APPLE_INSTALLER_IDENTITY'] : [])] : []), ...(hasHarmony ? ['AGC_CERT_P12', 'AGC_RELEASE_PROFILE_P7B'] : [])] },
    }],
    logs: { path: outputPath, summary: `已生成 GitHub Actions 多平台工作流（${jobs.join(', ')}）`, full_available: true },
    decision_basis: {
      target_platform: jobs.join(' + '),
      target_version: 'ubuntu-22.04 + windows-latest + macos-14 + self-hosted HarmonyOS runner',
      build_method: 'GitHub Actions workflow generated from Forge.md machine contract',
      compatibility_notes: ['Windows secrets are referenced by name and never embedded in the generated file'],
    },
    next_actions: [
      '审查生成的 .github/workflows/deliverkit.yml',
      ...(hasWindows ? ['在仓库 Settings/Secrets 中配置 DELIVERKIT_WINDOWS_PFX_BASE64 与 DELIVERKIT_WINDOWS_PFX_PASSWORD'] : []),
      ...(hasMacos ? ['在仓库 Settings/Secrets 中配置 Apple certificate、signing identity、Team ID 与 notarytool 凭据', ...(macosArtifacts.includes('pkg') ? ['以及 Developer ID Installer identity'] : [])] : []),
      ...(hasHarmony ? ['在仓库 Settings/Secrets 中配置 AGC_CERT_P12 与 AGC_RELEASE_PROFILE_P7B，并提供 hdc 设备/云手机'] : []),
      '推送分支后在 GitHub Actions 中执行 workflow_dispatch 或 tag 触发构建',
    ],
  };
}

function renderWorkflow(linuxCommands: string[], hasWindows: boolean, macosArtifacts: string[], hasHarmony: boolean): string {
  const lines = [
    'name: DeliverKit delivery',
    '',
    'on:',
    '  workflow_dispatch:',
    '  push:',
    '    tags: ["v*"]',
    '',
    'permissions:',
    '  contents: read',
    '',
    'jobs:',
  ];

  if (linuxCommands.length > 0) {
    lines.push(
      '  linux-pack:',
      '    runs-on: ubuntu-22.04',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-node@v4',
      '        with:',
      '          node-version: 20.x',
      '          cache: npm',
      '      - run: npm ci',
      '      - run: npm run build:clean',
      '      - run: mkdir -p .deliverkit/results',
      ...linuxCommands.map((command) => `      - run: set -o pipefail; node dist/cli/index.js ${command} . --plan Forge.md | tee .deliverkit/results/${command}.json`),
      '      - name: Upload Linux artifacts',
      '        uses: actions/upload-artifact@v4',
      '        with:',
      '          name: deliverkit-linux-artifacts',
      '          path: .deliverkit/artifacts/',
      '          if-no-files-found: error',
      '      - name: Upload Linux result JSON',
      '        uses: actions/upload-artifact@v4',
      '        with:',
      '          name: deliverkit-linux-results',
      '          path: .deliverkit/results/*.json',
      '          if-no-files-found: error',
      ''
    );
  }

  if (hasWindows) {
    lines.push(
      '  windows-msi:',
      '    runs-on: windows-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-node@v4',
      '        with:',
      '          node-version: 20.x',
      '          cache: npm',
      '      - run: npm ci',
      '      - run: npm run build:clean',
      '      - name: Install WiX Toolset',
      '        shell: pwsh',
      '        run: |',
      '          dotnet tool install --global wix --version 5.0.2',
      '          "$env:USERPROFILE\\.dotnet\\tools" | Out-File -FilePath $env:GITHUB_PATH -Encoding utf8 -Append',
      '      - name: Build, sign, and verify MSI',
      '        shell: pwsh',
      '        env:',
      '          DELIVERKIT_WINDOWS_PFX_BASE64: ${{ secrets.DELIVERKIT_WINDOWS_PFX_BASE64 }}',
      '          DELIVERKIT_WINDOWS_PFX_PASSWORD: ${{ secrets.DELIVERKIT_WINDOWS_PFX_PASSWORD }}',
      '        run: |',
          '          New-Item -ItemType Directory -Force .deliverkit/results | Out-Null',
          '          node dist/cli/index.js pack-windows-msi . --plan Forge.md | Tee-Object .deliverkit/results/pack-windows-msi.json',
      '          if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
      '      - name: Upload Windows artifact',
      '        uses: actions/upload-artifact@v4',
      '        with:',
      '          name: deliverkit-windows-artifacts',
      '          path: .deliverkit/artifacts/*.msi',
      '          if-no-files-found: error',
      '      - name: Upload Windows result JSON',
      '        uses: actions/upload-artifact@v4',
      '        with:',
      '          name: deliverkit-windows-results',
      '          path: .deliverkit/results/*.json',
      '          if-no-files-found: error',
      ''
    );
  }

  if (macosArtifacts.length > 0) {
    lines.push(
      '  macos-package:',
      '    runs-on: macos-14',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-node@v4',
      '        with:',
      '          node-version: 20.x',
      '          cache: npm',
      '      - run: npm ci',
      '      - run: npm run build:clean',
      `      - name: Build, sign, notarize, and verify ${macosArtifacts.map((artifact) => artifact.toUpperCase()).join(' and ')}`,
      '        env:',
      '          DELIVERKIT_APPLE_CERTIFICATE_BASE64: ${{ secrets.DELIVERKIT_APPLE_CERTIFICATE_BASE64 }}',
      '          DELIVERKIT_APPLE_CERTIFICATE_PASSWORD: ${{ secrets.DELIVERKIT_APPLE_CERTIFICATE_PASSWORD }}',
      '          DELIVERKIT_APPLE_SIGNING_IDENTITY: ${{ secrets.DELIVERKIT_APPLE_SIGNING_IDENTITY }}',
      '          DELIVERKIT_APPLE_TEAM_ID: ${{ secrets.DELIVERKIT_APPLE_TEAM_ID }}',
      '          DELIVERKIT_APPLE_ID: ${{ secrets.DELIVERKIT_APPLE_ID }}',
      '          DELIVERKIT_APPLE_APP_PASSWORD: ${{ secrets.DELIVERKIT_APPLE_APP_PASSWORD }}',
      ...(macosArtifacts.includes('pkg') ? ['          DELIVERKIT_APPLE_INSTALLER_IDENTITY: ${{ secrets.DELIVERKIT_APPLE_INSTALLER_IDENTITY }}'] : []),
      '        run: |',
      '          mkdir -p .deliverkit/results',
      ...macosArtifacts.map((artifact) => `          set -o pipefail; node dist/cli/index.js pack-macos . --plan Forge.md --artifact ${artifact} | tee .deliverkit/results/pack-macos-${artifact}.json`),
      '      - name: Upload macOS artifact',
      '        uses: actions/upload-artifact@v4',
      '        with:',
      '          name: deliverkit-macos-artifacts',
      '          path: |',
      '            .deliverkit/artifacts/*.dmg',
      '            .deliverkit/artifacts/*.pkg',
      '          if-no-files-found: error',
      '      - name: Upload macOS result JSON',
      '        uses: actions/upload-artifact@v4',
      '        with:',
      '          name: deliverkit-macos-results',
      '          path: .deliverkit/results/*.json',
      '          if-no-files-found: error',
      ''
    );
  }

  if (hasHarmony) {
    lines.push(
      '  harmonyos:',
      '    # Requires a registered self-hosted DevEco runner with hvigorw, ohpm, and hdc.',
      '    runs-on: [self-hosted, linux]',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - uses: actions/setup-node@v4',
      '        with:',
      '          node-version: 20.x',
      '          cache: npm',
      '      - run: npm ci',
      '      - run: npm run build:clean',
      '      - name: Check DevEco runner toolchain',
      '        run: command -v hvigorw && command -v ohpm && command -v hdc',
      '      - name: Build and install HAP',
      '        env:',
      '          AGC_CERT_P12: ${{ secrets.AGC_CERT_P12 }}',
      '          AGC_RELEASE_PROFILE_P7B: ${{ secrets.AGC_RELEASE_PROFILE_P7B }}',
      '        run: |',
      '          mkdir -p .deliverkit/results',
      '          set -o pipefail; node dist/cli/index.js pack-harmonyos . --plan Forge.md | tee .deliverkit/results/pack-harmonyos.json',
      '      - name: Upload HarmonyOS artifact',
      '        uses: actions/upload-artifact@v4',
      '        with:',
      '          name: deliverkit-harmonyos-artifacts',
      '          path: .deliverkit/artifacts/*.{hap,app}',
      '          if-no-files-found: error',
      '      - name: Upload HarmonyOS result JSON',
      '        uses: actions/upload-artifact@v4',
      '        with:',
      '          name: deliverkit-harmonyos-results',
      '          path: .deliverkit/results/*.json',
      '          if-no-files-found: error',
      ''
    );
  }

  const prerequisiteJobs = [
    ...(linuxCommands.length > 0 ? ['linux-pack'] : []),
    ...(hasWindows ? ['windows-msi'] : []),
    ...(macosArtifacts.length > 0 ? ['macos-package'] : []),
    ...(hasHarmony ? ['harmonyos'] : []),
  ];
  lines.push(
    '  release-manifest:',
    '    if: always()',
    `    needs: [${prerequisiteJobs.join(', ')}]`,
    '    runs-on: ubuntu-22.04',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - uses: actions/setup-node@v4',
    '        with:',
    '          node-version: 20.x',
    '          cache: npm',
    '      - run: npm ci',
    '      - run: npm run build:clean',
    '      - run: mkdir -p .deliverkit/results .deliverkit/artifacts',
    '      - name: Download platform results',
    '        uses: actions/download-artifact@v4',
    '        continue-on-error: true',
    '        with:',
    '          pattern: deliverkit-*-results',
    '          path: .deliverkit/results',
    '          merge-multiple: true',
    '      - name: Download platform artifacts',
    '        uses: actions/download-artifact@v4',
    '        continue-on-error: true',
    '        with:',
    '          pattern: deliverkit-*-artifacts',
    '          path: .deliverkit/artifacts',
    '          merge-multiple: true',
    '      - name: Generate Release Manifest',
    '        run: node dist/cli/index.js generate-release-manifest . --plan Forge.md --results .deliverkit/results',
    '      - name: Upload Release Manifest',
    '        if: always()',
    '        uses: actions/upload-artifact@v4',
    '        with:',
    '          name: deliverkit-release-manifest',
    '          path: ReleaseManifest.json',
    '          if-no-files-found: warn',
    ''
  );

  return `${lines.join('\n').trimEnd()}\n`;
}

function failure(code: ErrorCode, summary: string, suggestedFix: string): ForgeKitResult {
  return { status: 'failed', error: { code, summary, suggested_fix: suggestedFix } };
}
