/**
 * Forge.md renderer — 由生态知识包驱动，支持多目标 delivery_targets。
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTextFile } from './utils/filesystem.js';
import type { InspectProjectOutput } from './types.js';
import type { DeliveryTargetPlan } from './plan-decision-engine.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_CANDIDATES = [
  path.resolve(currentDir, '../packaging/forge-template.md'),
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

export function renderForgeMd(context: ForgeRenderContext): string {
  const { inspectResult: inspection, deliveryTargets, risks, nextActions } = context;
  const template = loadTemplate();
  const projectName = inferProjectName(context.sourceDir);
  const entry = inspection.entrypoints?.[0] || '（未检测到）';
  const projectType = inferProjectType(deliveryTargets);

  return template
    .replace(/{{generated_at}}/g, new Date().toISOString())
    .replace(/{{project_name}}/g, projectName)
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
