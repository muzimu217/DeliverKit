import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const cliPath = path.join(repoRoot, 'dist', 'cli', 'index.js');
const fixtureNames = [
  'sample-python-project',
  'sample-typescript-project',
  'sample-go-stdlib-project',
];
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-linux-matrix-'));
const evidenceDir = process.env.DELIVERKIT_E2E_EVIDENCE_DIR
  ? path.resolve(process.env.DELIVERKIT_E2E_EVIDENCE_DIR)
  : null;
const summary = [];

function runCli(args) {
  const output = execFileSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  return JSON.parse(output);
}

try {
  for (const fixtureName of fixtureNames) {
    const sourceDir = path.join(tempRoot, fixtureName);
    fs.cpSync(path.join(repoRoot, 'tests', 'fixtures', fixtureName), sourceDir, { recursive: true });
    const plan = runCli(['plan', sourceDir, '--goals', 'deb,rpm,appimage']);
    if (plan.status !== 'success' || !plan.plan_path) {
      throw new Error(`${fixtureName}: plan failed: ${JSON.stringify(plan)}`);
    }

    const artifacts = [];
    for (const command of ['pack-deb', 'pack-rpm', 'pack-appimage']) {
      const result = runCli([command, sourceDir, '--plan', plan.plan_path]);
      if (result.status !== 'success') {
        throw new Error(`${fixtureName}/${command} failed: ${JSON.stringify(result)}`);
      }
      const resultsDir = path.join(sourceDir, '.deliverkit', 'results');
      fs.mkdirSync(resultsDir, { recursive: true });
      fs.writeFileSync(path.join(resultsDir, `${command}.json`), `${JSON.stringify(result, null, 2)}\n`);
      artifacts.push({ command, path: result.artifacts?.[0]?.path, checksum: result.artifacts?.[0]?.checksum });
    }
    const manifestResult = runCli(['generate-release-manifest', sourceDir, '--plan', plan.plan_path, '--results', path.join(sourceDir, '.deliverkit', 'results')]);
    if (manifestResult.status !== 'success') {
      throw new Error(`${fixtureName}/generate-release-manifest failed: ${JSON.stringify(manifestResult)}`);
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir, 'ReleaseManifest.json'), 'utf8'));
    if (manifest.status !== 'verified' || manifest.artifacts?.length !== 3) {
      throw new Error(`${fixtureName}: ReleaseManifest is not verified: ${JSON.stringify(manifest)}`);
    }
    if (evidenceDir) {
      fs.mkdirSync(evidenceDir, { recursive: true });
      fs.copyFileSync(path.join(sourceDir, 'ReleaseManifest.json'), path.join(evidenceDir, `${fixtureName}-ReleaseManifest.json`));
    }
    summary.push({
      fixture: fixtureName,
      plan: plan.plan_path,
      artifacts,
      release_manifest: {
        path: path.join(sourceDir, 'ReleaseManifest.json'),
        status: manifest.status,
        artifact_count: manifest.artifacts.length,
      },
    });
  }
  process.stdout.write(`${JSON.stringify({ status: 'success', projects: summary }, null, 2)}\n`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
