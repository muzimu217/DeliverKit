import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { generatePackagingPlan } from '../../../src/capabilities/generate-packaging-plan.js';
import { packMacos, type MacosCommandRunner } from '../../../src/capabilities/pack-macos.js';
import { packHarmonyos, type HarmonyCommandRunner } from '../../../src/capabilities/pack-harmonyos.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) { fs.rmSync(dir, { recursive: true, force: true }); }
});

describe('platform-bound capabilities', () => {
  it('pack_macos rejects non-macOS hosts before reading signing secrets', async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-platform-'));
    tempDirs.push(sourceDir);
    fs.mkdirSync(path.join(sourceDir, 'Demo.app', 'Contents'), { recursive: true });
    const plan = await generatePackagingPlan(sourceDir, ['macos-dmg']);

    const result = packMacos({ sourceDir, planPath: plan.plan_path!, platform: 'linux', environment: {} }, () => { throw new Error('must not run'); }, () => true);

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('toolchain_not_available');
  });

  it('pack_harmonyos rejects macOS because DevEco target OS is Linux/Windows', async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-platform-'));
    tempDirs.push(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'module.json5'), '{}');
    const plan = await generatePackagingPlan(sourceDir, ['harmonyos']);

    const result = packHarmonyos({ sourceDir, planPath: plan.plan_path!, platform: 'darwin', environment: {} }, () => { throw new Error('must not run'); }, () => true);

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('toolchain_not_available');
  });

  it('uses the APP release task when the Forge contract requests an APP artifact', async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-platform-'));
    tempDirs.push(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'module.json5'), '{}');
    const plan = await generatePackagingPlan(sourceDir, ['harmonyos-app']);
    const calls: string[] = [];
    const runner: HarmonyCommandRunner = (command, args, options) => {
      calls.push(`${command} ${args.join(' ')}`);
      if (command === 'hvigorw') {
        fs.mkdirSync(path.join(sourceDir, 'build'), { recursive: true });
        fs.writeFileSync(path.join(sourceDir, 'build', 'release.app'), 'app');
      }
      return { success: true, exitCode: 0, stdout: '', stderr: '', logPath: path.join(options.logDir ?? sourceDir, options.logFileName ?? 'command.log') };
    };

    const result = packHarmonyos({
      sourceDir,
      planPath: plan.plan_path!,
      artifact: 'app',
      platform: 'linux',
      environment: { AGC_CERT_P12: Buffer.from('cert').toString('base64'), AGC_RELEASE_PROFILE_P7B: Buffer.from('profile').toString('base64') },
    }, runner, () => true);

    expect(result.status).toBe('success');
    expect(calls[0]).toContain('hvigorw assembleApp');
    expect(calls[1]).toContain('hdc install');
    expect(result.artifacts?.[0].type).toBe('app');
  });

  it('builds and verifies a signed PKG when the Forge contract requests it', async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-platform-'));
    tempDirs.push(sourceDir);
    fs.mkdirSync(path.join(sourceDir, 'Demo.app', 'Contents'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'Demo.app', 'Contents', 'Info.plist'), 'plist');
    const plan = await generatePackagingPlan(sourceDir, ['macos-pkg']);
    const outputDir = path.join(sourceDir, 'out');
    const calls: string[] = [];
    const runner: MacosCommandRunner = (command, args, options) => {
      calls.push(`${command} ${args.join(' ')}`);
      if (command === 'productbuild' || command === 'productsign') {
        fs.mkdirSync(path.dirname(args.at(-1)!), { recursive: true });
        fs.writeFileSync(args.at(-1)!, 'pkg');
      }
      return { success: true, exitCode: 0, stdout: '', stderr: '', logPath: path.join(outputDir, options.logFileName ?? 'command.log') };
    };

    const result = packMacos({
      sourceDir,
      planPath: plan.plan_path!,
      outputDir,
      artifact: 'pkg',
      platform: 'darwin',
      environment: {
        DELIVERKIT_APPLE_CERTIFICATE_BASE64: Buffer.from('p12').toString('base64'),
        DELIVERKIT_APPLE_CERTIFICATE_PASSWORD: 'certificate-secret',
        DELIVERKIT_APPLE_SIGNING_IDENTITY: 'Developer ID Application: Example',
        DELIVERKIT_APPLE_INSTALLER_IDENTITY: 'Developer ID Installer: Example',
        DELIVERKIT_APPLE_TEAM_ID: 'TEAM123',
        DELIVERKIT_APPLE_ID: 'ci@example.com',
        DELIVERKIT_APPLE_APP_PASSWORD: 'app-password',
      },
    }, runner, () => true);

    expect(result.status).toBe('success');
    expect(calls.some((call) => call.startsWith('productbuild '))).toBe(true);
    expect(calls.some((call) => call.startsWith('productsign '))).toBe(true);
    expect(calls.some((call) => call.includes('spctl --assess --type install'))).toBe(true);
    expect(result.artifacts?.[0].type).toBe('pkg');
  });
});
