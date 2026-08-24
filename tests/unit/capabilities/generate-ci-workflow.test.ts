import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { generatePackagingPlan } from '../../../src/capabilities/generate-packaging-plan.js';
import { generateCiWorkflow } from '../../../src/capabilities/generate-ci-workflow.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) { fs.rmSync(dir, { recursive: true, force: true }); }
});

describe('generate_ci_workflow', () => {
  it('renders Linux and Windows jobs from one multi-target Forge contract', async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-ci-'));
    tempDirs.push(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'app.py'), 'print("ready")');
    const plan = await generatePackagingPlan(sourceDir, ['deb', 'rpm', 'appimage', 'windows-msi', 'macos-dmg', 'macos-pkg', 'harmonyos']);
    const outputPath = path.join(sourceDir, '.github', 'workflows', 'delivery.yml');

    const result = generateCiWorkflow({ sourceDir, planPath: plan.plan_path!, outputPath });

    expect(result.status).toBe('success');
    const workflow = fs.readFileSync(outputPath, 'utf8');
    expect(() => yaml.load(workflow)).not.toThrow();
    expect(workflow).toContain('runs-on: ubuntu-22.04');
    expect(workflow).toContain('runs-on: windows-latest');
    expect(workflow).toContain('runs-on: macos-14');
    expect(workflow).toContain('macos-package:');
    expect(workflow).toContain('harmonyos:');
    expect(workflow).toContain('runs-on: [self-hosted, linux]');
    expect(workflow).toContain('Check DevEco runner toolchain');
    expect(workflow).toContain('pack-deb . --plan Forge.md');
    expect(workflow).toContain('pack-rpm . --plan Forge.md');
    expect(workflow).toContain('pack-appimage . --plan Forge.md');
    expect(workflow).toContain('pack-windows-msi . --plan Forge.md');
    expect(workflow).toContain('pack-macos . --plan Forge.md');
    expect(workflow).toContain('pack-macos . --plan Forge.md --artifact dmg');
    expect(workflow).toContain('pack-macos . --plan Forge.md --artifact pkg');
    expect(workflow).toContain('secrets.DELIVERKIT_APPLE_INSTALLER_IDENTITY');
    expect(workflow).toContain('pack-harmonyos . --plan Forge.md');
    expect(workflow).toContain('secrets.DELIVERKIT_WINDOWS_PFX_BASE64');
    expect(workflow).toContain('secrets.DELIVERKIT_APPLE_APP_PASSWORD');
    expect(workflow).toContain('secrets.AGC_CERT_P12');
    expect(workflow).toContain('release-manifest:');
    expect(workflow).toContain('actions/download-artifact@v4');
    expect(workflow).toContain('generate-release-manifest . --plan Forge.md');
    expect(workflow).toContain('name: deliverkit-windows-artifacts');
    expect(workflow).toContain('name: deliverkit-macos-artifacts');
    expect(workflow).toContain('name: deliverkit-harmonyos-artifacts');
    expect(workflow).toContain('pattern: deliverkit-*-artifacts');
    expect(workflow).toContain('continue-on-error: true');
    expect(workflow).not.toContain('PFX_PASSWORD=');
  });

  it('does not overwrite a reviewed workflow unless explicitly requested', async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-ci-'));
    tempDirs.push(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'app.py'), 'print("ready")');
    const plan = await generatePackagingPlan(sourceDir, ['windows-msi']);
    const outputPath = path.join(sourceDir, 'delivery.yml');
    fs.writeFileSync(outputPath, 'reviewed: true\n');

    const result = generateCiWorkflow({ sourceDir, planPath: plan.plan_path!, outputPath });

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('build_config_invalid');
    expect(fs.readFileSync(outputPath, 'utf8')).toBe('reviewed: true\n');
  });
});
