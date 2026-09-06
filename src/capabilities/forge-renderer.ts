/**
 * Forge.md renderer — 由生态知识包驱动，支持多目标 delivery_targets。
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTextFile } from './utils/filesystem.js';
import { DEFAULT_ARTIFACT_VERSION, normalizeVersion } from './utils/version.js';
import type { InspectProjectOutput } from './types.js';
import type { DeliveryTargetPlan } from './plan-decision-engine.js';
import { renderForgeContract, type ForgeContract } from './forge-contract.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_CANDIDATES = [
  // npm tarball 的自包含运行时模板（由 build:release 复制）。
  path.resolve(currentDir, '../packaging/forge-template.md'),
  // 源码仓库开发态 fallback。
  path.resolve(currentDir, '../../src/packaging/forge-template.md'),
  path.resolve(process.cwd(), 'src/packaging/forge-template.md'),
];

export interface ForgeRenderContext {
  sourceDir: string;
  inspectResult: InspectProjectOutput;
  deliveryTargets: DeliveryTargetPlan[];
  risks: string[];
  nextActions: string[];
}

export interface ProjectVersionInference {
  value: string;
  source: 'package.json' | 'pyproject.toml' | 'app.json5' | 'default';
}

/**
 * 产物版本只信项目元数据（package.json / pyproject.toml / app.json5），
 * 不引入 git 依赖：构建环境里 git 元数据可能被剥离，版本必须可从源码本身推导。
 */
export function inferProjectVersion(sourceDir: string): ProjectVersionInference {
  const pyproject = readTextFile(path.join(sourceDir, 'pyproject.toml'));
  const pyprojectVersion = pyproject?.match(/version\s*=\s*["']([^"']+)["']/)?.[1];
  if (pyprojectVersion) {
    return { value: pyprojectVersion, source: 'pyproject.toml' };
  }

  const packageJson = readTextFile(path.join(sourceDir, 'package.json'));
  if (packageJson) {
    try {
      const parsed: unknown = JSON.parse(packageJson);
      if (isVersionedPackage(parsed)) {
        return { value: parsed.version, source: 'package.json' };
      }
    } catch {
      // Invalid package.json is reported by project inspection when relevant.
    }
  }

  const appJson5 = readTextFile(path.join(sourceDir, 'AppScope', 'app.json5'));
  const versionName = appJson5?.match(/["']versionName["']\s*:\s*["']([^"']+)["']/)?.[1];
  if (versionName) {
    return { value: versionName, source: 'app.json5' };
  }

  return { value: DEFAULT_ARTIFACT_VERSION, source: 'default' };
}

function isVersionedPackage(value: unknown): value is { version: string } {
  return typeof value === 'object' && value !== null &&
    'version' in value && typeof (value).version === 'string' &&
    (value as { version: string }).version.length > 0;
}

export function renderForgeMd(context: ForgeRenderContext): string {
  const { inspectResult: inspection, deliveryTargets, risks, nextActions } = context;
  const template = loadTemplate();
  const projectName = inferProjectName(context.sourceDir);
  const entry = inspection.entrypoints?.[0] || '（未检测到）';
  const projectType = inferProjectType(deliveryTargets);
  const projectVersion = normalizeVersion(inferProjectVersion(context.sourceDir).value) ?? DEFAULT_ARTIFACT_VERSION;

  const generatedAt = new Date().toISOString();
  const rendered = template
    .replace(/{{generated_at}}/g, generatedAt)
    .replace(/{{project_name}}/g, projectName)
    .replace(/{{project_version}}/g, projectVersion)
    .replace(/{{project_type}}/g, projectType)
    .replace(/{{language}}/g, inspection.language || (projectType === 'mobile' ? 'ArkTS' : '未知'))
    .replace(/{{runtime}}/g, inspection.runtime || (projectType === 'mobile' ? 'ArkUI / 方舟编译器' : '未知'))
    .replace(/{{entry}}/g, entry)
    .replace(/{{delivery_targets_section}}/g, renderDeliveryTargets(deliveryTargets))
    .replace(/{{decisions_section}}/g, renderDecisions(deliveryTargets))
    .replace(/{{risks_section}}/g, risks.length > 0 ? risks.map((r) => `- ${r}`).join('\n') : '- （无）')
    .replace(/{{verify_command}}/g, renderVerifyCommand(deliveryTargets))
    .replace(/{{results_section}}/g, renderResults(deliveryTargets))
    .replace(/{{next_actions_section}}/g, nextActions.map((a) => `- ${a}`).join('\n'));

  const contract: ForgeContract = {
    schema_version: 1,
    generated_at: generatedAt,
    // Keep committed Forge.md files portable across local and CI checkout paths.
    // The loader resolves this relative to the plan directory before validating it.
    source_dir: '.',
    project: {
      name: projectName,
      version: projectVersion,
      language: inspection.language,
      runtime: inspection.runtime,
      entrypoints: inspection.entrypoints ?? [],
    },
    delivery_targets: deliveryTargets.map((target) => ({
      ecosystem: target.id,
      artifacts: target.artifactIds,
    })),
  };

  return `${rendered.trimEnd()}\n\n${renderForgeContract(contract)}\n`;
}

function renderDeliveryTargets(targets: DeliveryTargetPlan[]): string {
  return targets
    .map((target) => {
      const k = target.knowledge;
      const artifacts = target.artifactIds
        .map((id) => {
          const artifact = k.artifacts.find((a) => a.id === id);
          return artifact ? `${artifact.id}${artifact.extension ? ` (${artifact.extension})` : ''}` : id;
        })
        .join('、');
      const signing = k.signing.required ? `required（${k.signing.type}）` : 'not required';
      const store = k.distribution.store ?? '无官方商店（本地分发）';
      return [
        `### ${k.name}（${k.id}）`,
        `- 生态: ${k.ecosystem}`,
        `- 产物: ${artifacts}`,
        `- 签名: ${signing}`,
        `- 上架/分发: ${store}`,
        `- 工具链: ${k.toolchain.build_os}（cross_buildable=${k.toolchain.cross_buildable}）→ ${k.toolchain.required.join('、')}`,
        `- 验证: ${k.verification.install}`,
      ].join('\n');
    })
    .join('\n\n');
}

function renderDecisions(targets: DeliveryTargetPlan[]): string {
  const lines: string[] = [];
  for (const target of targets) {
    const k = target.knowledge;
    lines.push(`- [${k.id}] 目标生态: ${k.name} — ${k.summary}`);
    const artifactNotes = target.artifactIds.map((id) => {
      const artifact = k.artifacts.find((a) => a.id === id);
      return artifact?.note ? `${id}（${artifact.note}）` : id;
    });
    lines.push(`- [${k.id}] 产物选择: ${artifactNotes.join('、')}`);
    lines.push(
      `- [${k.id}] 签名: ${
        k.signing.required
          ? `${k.signing.type}（${k.signing.how_to_get ?? '见知识包'}）`
          : '无需签名（本地分发）'
      }`
    );
    lines.push(
      `- [${k.id}] 工具链约束: 构建 OS=${k.toolchain.build_os}，cross_buildable=${k.toolchain.cross_buildable}`
    );
  }
  return lines.join('\n');
}

function renderVerifyCommand(targets: DeliveryTargetPlan[]): string {
  const commands = targets.map((t) => t.knowledge.verification.install);
  return commands.length === 1 ? commands[0] : commands.join(' ；或 ');
}

function renderResults(targets: DeliveryTargetPlan[]): string {
  return targets
    .flatMap((t) => t.artifactIds.map((a) => `- ${t.id}/${a}: pending`))
    .join('\n');
}

function inferProjectType(targets: DeliveryTargetPlan[]): string {
  const families = new Set(targets.map((t) => t.knowledge.ecosystem));
  if (families.size === 1) {
    return [...families][0] === 'harmonyos' ? 'mobile' : 'servers';
  }
  return 'multi-ecosystem';
}

function inferProjectName(sourceDir: string): string {
  const pyproject = readTextFile(path.join(sourceDir, 'pyproject.toml'));
  const pyprojectName = pyproject?.match(/name\s*=\s*["']([^"']+)["']/)?.[1];
  if (pyprojectName) {
    return pyprojectName;
  }

  const packageJson = readTextFile(path.join(sourceDir, 'package.json'));
  if (packageJson) {
    try {
      const parsed: unknown = JSON.parse(packageJson);
      if (isNamedPackage(parsed)) {
        return parsed.name;
      }
    } catch {
      // Invalid package.json is reported by project inspection when relevant.
    }
  }
  return path.basename(path.resolve(sourceDir));
}

function isNamedPackage(value: unknown): value is { name: string } {
  return typeof value === 'object' && value !== null &&
    'name' in value && typeof value.name === 'string' && value.name.length > 0;
}

function loadTemplate(): string {
  for (const candidate of TEMPLATE_CANDIDATES) {
    const template = readTextFile(candidate);
    if (template) {
      return template;
    }
  }
  return FALLBACK_TEMPLATE;
}

const FALLBACK_TEMPLATE = `# DeliverKit Delivery Plan

> 由 DeliverKit 自动生成。生成时间：{{generated_at}}

## Project
- Name: {{project_name}}
- Version: {{project_version}}
- Type: {{project_type}}
- Language: {{language}}
- Runtime: {{runtime}}
- Entry: {{entry}}

## Delivery Targets
{{delivery_targets_section}}

## Decisions
{{decisions_section}}

## Risks
{{risks_section}}

## Commands
- Inspect: deliverkit inspect .
- Verify: {{verify_command}}

## Results
{{results_section}}

## Next Actions
{{next_actions_section}}
`;
