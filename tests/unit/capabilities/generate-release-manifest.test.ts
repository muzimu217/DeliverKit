import { afterEach, describe, expect, it } from 'vitest';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { generatePackagingPlan } from '../../../src/capabilities/generate-packaging-plan.js';
import { generateReleaseManifest } from '../../../src/capabilities/generate-release-manifest.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) { fs.rmSync(dir, { recursive: true, force: true }); }
});

describe('generate_release_manifest', () => {
  it('rechecks checksums and preserves verification evidence', async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-manifest-'));
    tempDirs.push(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'app.py'), 'print("ready")');
    const plan = await generatePackagingPlan(sourceDir, ['deb']);
    const resultsDir = path.join(sourceDir, '.deliverkit', 'results');
    const artifactPath = path.join(sourceDir, 'demo.deb');
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(artifactPath, 'package');
    const checksum = crypto.createHash('sha256').update('package').digest('hex');
    fs.writeFileSync(path.join(resultsDir, 'pack-deb.json'), JSON.stringify({
      status: 'success',
      artifacts: [{ type: 'deb-package', path: artifactPath, checksum, metadata: { verified_checks: ['dpkg -i', 'launcher runtime'] } }],
    }));

    const result = generateReleaseManifest({ sourceDir, planPath: plan.plan_path!, resultsDir });

    expect(result.status).toBe('success');
    const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir, 'ReleaseManifest.json'), 'utf8'));
    expect(manifest.status).toBe('verified');
    expect(manifest.artifacts[0].verification.evidence).toContain('dpkg -i');
  });

  it('marks a report incomplete when a result has no verification evidence', async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-manifest-'));
    tempDirs.push(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'app.py'), 'print("ready")');
    const plan = await generatePackagingPlan(sourceDir, ['deb']);
    const resultsDir = path.join(sourceDir, 'results');
    const artifactPath = path.join(sourceDir, 'demo.deb');
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(artifactPath, 'package');
    fs.writeFileSync(path.join(resultsDir, 'pack-deb.json'), JSON.stringify({ status: 'success', artifacts: [{ type: 'deb-package', path: artifactPath }] }));

    const result = generateReleaseManifest({ sourceDir, planPath: plan.plan_path!, resultsDir });

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('verification_failed');
    expect(JSON.parse(fs.readFileSync(path.join(sourceDir, 'ReleaseManifest.json'), 'utf8')).status).toBe('incomplete');
  });

  it('marks a multi-target report incomplete when a declared target has no result', async () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-manifest-'));
    tempDirs.push(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'app.py'), 'print("ready")');
    const plan = await generatePackagingPlan(sourceDir, ['deb', 'windows-msi']);
    const resultsDir = path.join(sourceDir, 'results');
    const artifactPath = path.join(sourceDir, 'demo.deb');
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(artifactPath, 'package');
    const checksum = crypto.createHash('sha256').update('package').digest('hex');
    fs.writeFileSync(path.join(resultsDir, 'pack-deb.json'), JSON.stringify({
      status: 'success',
      artifacts: [{ type: 'deb-package', path: artifactPath, checksum, metadata: { verified_checks: ['dpkg -i'] } }],
    }));

    const result = generateReleaseManifest({ sourceDir, planPath: plan.plan_path!, resultsDir });

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('verification_failed');
    expect(JSON.parse(fs.readFileSync(path.join(sourceDir, 'ReleaseManifest.json'), 'utf8')).warnings)
      .toContain('缺少 Forge.md 声明的产物: desktop/windows/msi');
  });
});
