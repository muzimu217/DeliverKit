import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(root, 'dist');
const ecosystems = resolve(destination, 'knowledge', 'ecosystems');
const packaging = resolve(destination, 'packaging');

mkdirSync(ecosystems, { recursive: true });
mkdirSync(packaging, { recursive: true });

for (const file of ['harmonyos.yaml', 'linux-appimage.yaml', 'linux-rpm.yaml', 'linux-ubuntu.yaml', 'macos.yaml', 'windows.yaml']) {
  cpSync(resolve(root, 'src', 'knowledge', 'ecosystems', file), resolve(ecosystems, file));
}
cpSync(resolve(root, 'src', 'packaging', 'forge-template.md'), resolve(packaging, 'forge-template.md'));

for (const legacy of [resolve(destination, 'knowledge', 'README.md'), resolve(destination, 'packaging', 'README.md')]) {
  rmSync(legacy, { force: true });
}

console.log(`Copied runtime knowledge and Forge template into ${destination}`);
