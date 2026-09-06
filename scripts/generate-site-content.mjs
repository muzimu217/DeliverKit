/**
 * Generate site/ecosystems.generated.js from the ecosystem knowledge packs.
 *
 * The knowledge YAMLs are the single source of truth for facts (status,
 * artifacts, toolchain, links); presentation-only fields (icon, accent,
 * order, summary copy) live in the lookup tables below so the zod schema
 * stays clean. Run via `npm run gen:site`; the generated file is committed
 * and deploy-pages guards against drift with git diff --exit-code.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packDir = resolve(root, 'src/knowledge/ecosystems');
const GITHUB_BASE = 'https://github.com/muzimu217/DeliverKit/blob/main/src/knowledge/ecosystems';

// Curated card order on the site.
const PACK_FILES = [
  'linux-ubuntu.yaml',
  'linux-rpm.yaml',
  'linux-appimage.yaml',
  'windows.yaml',
  'macos.yaml',
  'harmonyos.yaml',
];

// Presentation-only mappings keyed by pack id.
const PRESENTATION = {
  'linux/ubuntu': { icon: 'package', accent: 'mint', label: 'Ubuntu / Debian', summary: '系统级安装包，适合 Ubuntu LTS 与 systemd 服务。' },
  'linux/rpm': { icon: 'boxes', accent: 'mint', label: 'RPM Linux', summary: '面向 Rocky、RHEL、Fedora 的系统级交付。' },
  'linux/appimage': { icon: 'file-box', accent: 'mint', label: 'Linux AppImage', summary: '把运行时和应用封装成单文件，适合便携分发。' },
  'desktop/windows': { icon: 'monitor-down', accent: 'blue', label: 'Windows MSI', summary: 'WiX 构建、Authenticode 签名，再做静默安装/卸载验证。' },
  'desktop/macos': { icon: 'apple', accent: 'coral', label: 'macOS DMG / PKG', summary: 'codesign、notarytool、公证票据与 Gatekeeper 验证。' },
  'mobile/harmonyos': { icon: 'smartphone', accent: 'gold', label: 'HarmonyOS HAP / APP', summary: 'DevEco 构建，AGC 正式签名，并通过 hdc 设备验证。' },
};

// site family ↔ knowledge ecosystem enums are not the same set.
const FAMILY_BY_ECOSYSTEM = {
  linux: 'linux',
  windows: 'desktop',
  apple: 'desktop',
  harmonyos: 'mobile',
  web: 'web',
};

// Facts derive from status + signing; the label keeps the site's tone.
function statusLabel(pack) {
  if (pack.status === 'verified') {return 'VERIFIED / LOCAL + CI';}
  if (pack.id === 'desktop/windows') {return 'CI / USER CERTIFICATE';}
  if (pack.id === 'desktop/macos') {return 'CI / APPLE ACCOUNT';}
  if (pack.id === 'mobile/harmonyos') {return 'DEVECO / AGC ACCOUNT';}
  return 'EXPERIMENTAL / MATRIX';
}

function toCard(file) {
  const pack = loadYaml(readFileSync(resolve(packDir, file), 'utf8'));
  const view = PRESENTATION[pack.id];
  if (!view) {
    throw new Error(`no presentation mapping for ${pack.id}（新增知识包时请在脚本里补一条）`);
  }
  const family = FAMILY_BY_ECOSYSTEM[pack.ecosystem];
  if (!family) {
    throw new Error(`unknown ecosystem ${pack.ecosystem} in ${file}`);
  }
  const artifacts = pack.artifacts
    .filter((a) => a.extension && a.id !== 'docker-image')
    .map((a) => a.extension);
  if (artifacts.length === 0) {
    throw new Error(`${file}: no artifact extensions to display`);
  }
  return {
    family,
    icon: view.icon,
    accent: view.accent,
    status: statusLabel(pack),
    name: view.label,
    artifact: artifacts.map((extension) => extension.replace(/^\./, '')).join(' · '),
    summary: view.summary ?? pack.summary,
    tags: pack.toolchain.required.slice(0, 3),
    link: `${GITHUB_BASE}/${file}`,
    // 生成来源与事实字段，方便漂移排查
    source: { id: pack.id, status: pack.status, updated_at: pack.updated_at },
  };
}

const cards = PACK_FILES.map(toCard);
const body = `// AUTO-GENERATED from src/knowledge/ecosystems/*.yaml by scripts/generate-site-content.mjs — do not edit.
// 事实字段（status/artifact/tags/link）派生自知识包；展示字段见脚本内映射表。
export const ecosystems = ${JSON.stringify(cards, null, 2)};
`;
writeFileSync(resolve(root, 'site/ecosystems.generated.js'), body, 'utf8');
console.log(`generated site/ecosystems.generated.js with ${cards.length} ecosystem cards`);
