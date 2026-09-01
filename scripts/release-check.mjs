import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const lockJson = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
const failures = [];

if (packageJson.name !== 'deliverkit-mcp') failures.push(`package name must be deliverkit-mcp (got ${packageJson.name})`);
if (lockJson.name !== packageJson.name || lockJson.version !== packageJson.version) failures.push('package-lock root identity does not match package.json');
for (const [name, target] of Object.entries({ 'deliverkit-mcp': 'dist/mcp-server/index.js', deliverkit: 'dist/cli/index.js' })) {
  if (packageJson.bin?.[name] !== target) failures.push(`bin ${name} must point to ${target}`);
}

for (const file of [
  'dist/mcp-server/index.js',
  'dist/cli/index.js',
  'dist/knowledge/ecosystems/linux-ubuntu.yaml',
  'dist/packaging/forge-template.md',
]) {
  if (!existsSync(resolve(root, file))) failures.push(`missing release asset: ${file}`);
}

if (failures.length) {
  console.error('Release check: BLOCKED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Release check: READY (${packageJson.name}@${packageJson.version})`);
console.log('Run npm pack --dry-run and npm run test:tarball before publishing.');
