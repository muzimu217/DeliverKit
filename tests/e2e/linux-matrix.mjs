import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const cliPath = path.join(repoRoot, 'dist', 'cli', 'index.js');
// fixture -> expected artifact version（来自各自元数据；Go 无版本元数据，验证 0.1.0 回退）
const fixtureNames = [
  { name: 'sample-python-project', version: '1.0.0' },
  { name: 'sample-typescript-project', version: '1.0.0' },
  { name: 'sample-go-stdlib-project', version: '0.1.0' },
  // 不可识别语言项目：靠 --language/--entry 手动指定走完 plan → pack → verify
  { name: 'sample-plain-script-project', version: '0.1.0', overrides: ['--language', 'python', '--entry', 'wsgi.server'], goals: 'deb' },
];
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'deliverkit-linux-matrix-'));
const evidenceDir = process.env.DELIVERKIT_E2E_EVIDENCE_DIR
  ? path.resolve(process.env.DELIVERKIT_E2E_EVIDENCE_DIR)
  : null;
const summary = [];

function runCli(args) {
  const output = execFileSync(process.execPath, [cliPath, ...args, '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  return JSON.parse(output);
}

try {
  for (const fixture of fixtureNames) {
    const fixtureName = fixture.name;
    const sourceDir = path.join(tempRoot, fixtureName);
    fs.cpSync(path.join(repoRoot, 'tests', 'fixtures', fixtureName), sourceDir, { recursive: true });
    const planArgs = ['plan', sourceDir, '--goals', fixture.goals ?? 'deb,rpm,appimage'];
    if (fixture.overrides) {
      planArgs.push(...fixture.overrides);
    }
    const plan = runCli(planArgs);
    if (plan.status !== 'success' || !plan.plan_path) {
      throw new Error(`${fixtureName}: plan failed: ${JSON.stringify(plan)}`);
    }

    const artifacts = [];
    const commands = fixture.goals === 'deb' ? ['pack-deb'] : ['pack-deb', 'pack-rpm', 'pack-appimage'];
    for (const command of commands) {
      const result = runCli([command, sourceDir, '--plan', plan.plan_path]);
      if (result.status !== 'success') {
        throw new Error(`${fixtureName}/${command} failed: ${JSON.stringify(result)}`);
      }
      const artifactPath = result.artifacts?.[0]?.path;
      if (!artifactPath || !path.basename(artifactPath).includes(fixture.version)) {
        throw new Error(`${fixtureName}/${command}: artifact ${artifactPath ?? '(none)'} 不含期望版本 ${fixture.version}`);
      }
      const resultsDir = path.join(sourceDir, '.deliverkit', 'results');
      fs.mkdirSync(resultsDir, { recursive: true });
      fs.writeFileSync(path.join(resultsDir, `${command}.json`), `${JSON.stringify(result, null, 2)}\n`);
      artifacts.push({ command, path: artifactPath, checksum: result.artifacts?.[0]?.checksum });
    }
    const manifestResult = runCli(['generate-release-manifest', sourceDir, '--plan', plan.plan_path, '--results', path.join(sourceDir, '.deliverkit', 'results')]);
    if (manifestResult.status !== 'success') {
      throw new Error(`${fixtureName}/generate-release-manifest failed: ${JSON.stringify(manifestResult)}`);
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir, 'ReleaseManifest.json'), 'utf8'));
    const expectedCount = commands.length;
    if (manifest.status !== 'verified' || manifest.artifacts?.length !== expectedCount) {
      throw new Error(`${fixtureName}: ReleaseManifest is not verified: ${JSON.stringify(manifest)}`);
    }
    if (manifest.release_version !== fixture.version) {
      throw new Error(`${fixtureName}: ReleaseManifest release_version=${manifest.release_version}，期望 ${fixture.version}`);
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
        release_version: manifest.release_version,
        artifact_count: manifest.artifacts.length,
      },
    });
  }
  process.stdout.write(`${JSON.stringify({ status: 'success', projects: summary }, null, 2)}\n`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
