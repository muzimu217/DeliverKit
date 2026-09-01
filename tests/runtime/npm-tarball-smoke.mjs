import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tempDir = mkdtempSync(path.join(os.tmpdir(), 'deliverkit-tarball-'));
const fixtureDir = path.join(tempDir, 'fixture');
const packDir = path.join(tempDir, 'pack');
const packageJson = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
let client;
let tarballPath;

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

try {
  mkdirSync(fixtureDir, { recursive: true });
  writeFileSync(path.join(fixtureDir, 'app.py'), 'print("tarball smoke")\n');
  writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ private: true }));

  // pack-destination + deterministic filename: npm pack stdout mixes lifecycle
  // script output with the --json payload, so never parse it for the path.
  mkdirSync(packDir, { recursive: true });
  run('npm', ['pack', `--pack-destination=${packDir}`], projectRoot);
  tarballPath = path.join(packDir, `${packageJson.name}-${packageJson.version}.tgz`);
  assert.ok(existsSync(tarballPath), `expected tarball at ${tarballPath}`);
  run('npm', ['install', '--ignore-scripts', tarballPath], tempDir);

  const installedRoot = path.join(tempDir, 'node_modules', packageJson.name);
  assert.ok(readFileSync(path.join(installedRoot, 'dist', 'knowledge', 'ecosystems', 'linux-ubuntu.yaml'), 'utf8').includes('linux/ubuntu'));
  assert.ok(readFileSync(path.join(installedRoot, 'dist', 'packaging', 'forge-template.md'), 'utf8').includes('{{project_name}}'));

  const serverEntry = path.join(installedRoot, 'dist', 'mcp-server', 'index.js');
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverEntry], cwd: fixtureDir, stderr: 'pipe' });
  let stderr = '';
  transport.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
  client = new Client({ name: 'deliverkit-tarball-smoke', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);

  const tools = await client.listTools();
  assert.ok(tools.tools.some((tool) => tool.name === 'get_ecosystem_knowledge'));
  const knowledgeResponse = await client.callTool({ name: 'get_ecosystem_knowledge', arguments: { ecosystem: 'linux/ubuntu' } });
  const knowledge = JSON.parse(knowledgeResponse.content[0].text);
  assert.equal(knowledge.status, 'success');
  assert.equal(knowledge.total, 1);
  assert.equal(knowledge.ecosystems[0].id, 'linux/ubuntu');

  const planResponse = await client.callTool({ name: 'generate_packaging_plan', arguments: { source_dir: fixtureDir, goals: ['deb'] } });
  const plan = JSON.parse(planResponse.content[0].text);
  assert.equal(plan.status, 'success');
  const generatedPlan = readFileSync(path.join(fixtureDir, 'Forge.md'), 'utf8');
  assert.ok(generatedPlan.includes('# DeliverKit Delivery Plan'));
  assert.match(generatedPlan, /<!-- deliverkit-contract:[A-Za-z0-9_-]+ -->/);
  assert.ok(stderr.includes(`deliverkit-mcp-server v${packageJson.version} started`));

  console.log('npm tarball smoke test passed');
} finally {
  if (client) {
    await client.close();
  }
  if (tarballPath) {
    rmSync(tarballPath, { force: true });
  }
  rmSync(tempDir, { recursive: true, force: true });
}
