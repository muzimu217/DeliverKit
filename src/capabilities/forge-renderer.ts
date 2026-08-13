import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTextFile } from './utils/filesystem.js';
import type { DecisionBasis, InspectProjectOutput } from './types.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_CANDIDATES = [
  path.resolve(currentDir, '../packaging/forge-template.md'),
  path.resolve(currentDir, '../../src/packaging/forge-template.md'),
  path.resolve(process.cwd(), 'src/packaging/forge-template.md'),
];

export interface ForgeRenderContext {
  sourceDir: string;
  inspectResult: InspectProjectOutput;
  goals: string[];
  decisions: DecisionBasis;
  risks: string[];
  platform?: string;
}

export function renderForgeMd(context: ForgeRenderContext): string {
  const { inspectResult: inspection, goals, decisions, risks } = context;
  const isHarmony = context.platform === 'harmonyos';
  const template = loadTemplate();
  const projectName = inferProjectName(context.sourceDir);
  const entry = inspection.entrypoints?.[0] || '（未检测到）';

  const decisionsSection = isHarmony
    ? [
        `- Why HarmonyOS: 鸿蒙原生应用，Stage 模型，脱离 AOSP`,
        `- 产物形态: ${hasGoal(goals, 'app') ? 'APP（上架）' : 'HAP（调试分发）'}`,
        `- Why API: ${decisions.target_version}`,
        `- 构建方式: ${decisions.build_method}`,
        `- 兼容性: ${(decisions.compatibility_notes || []).join('；') || '基于内置默认值'}`,
      ].join('\n')
    : [
        `- Why Docker: ${hasGoal(goals, 'docker') ? 'v0.1 硬闭环，容器隔离、部署简单' : '未选择 Docker'}`,
        `- Why deb: ${hasGoal(goals, 'deb') ? '目标为 Ubuntu + systemd，系统级安装' : '未选择 deb（可选）'}`,
        `- Why Ubuntu version: ${decisions.target_version}`,
        `- Why base image: 与项目语言（${inspection.language || '未知'}）匹配`,
        `- 兼容性: ${(decisions.compatibility_notes || []).join('；') || '基于内置默认值'}`,
      ].join('\n');

  const risksSection = risks.map((risk) => `- ${risk}`).join('\n');

  const nextActions = isHarmony
    ? [
        '- 审查上方 Decisions 和 Risks 段',
        `- 确认目标平台：${decisions.target_platform}`,
        '- 调用 pack_harmonyos_app 执行构建（携带本文件路径作为 plan_path）',
        '- 上架前在 AppGallery Connect 配置正式签名（.cer / .p12 / .p7b）',
        '- 发布 APP 上传 AGC 提交审核，处理驳回意见后发布',
      ]
    : [
        '- 审查上方 Decisions 和 Risks 段',
        `- 确认目标平台：${decisions.target_platform}`,
        '- 确认后调用 build_docker_image（携带本文件路径作为 plan_path）',
      ];
  if (!isHarmony && !inspection.existing_packaging?.dockerfile) {
    nextActions.push('- 项目缺少 Dockerfile，构建时将自动生成默认模板');
  }

  return template
    .replace(/{{generated_at}}/g, new Date().toISOString())
    .replace(/{{project_name}}/g, projectName)
    .replace(/{{project_type}}/g, isHarmony ? 'mobile' : 'servers')
    .replace(/{{language}}/g, inspection.language || (isHarmony ? 'ArkTS' : '未知'))
    .replace(/{{runtime}}/g, inspection.runtime || (isHarmony ? 'ArkUI / 方舟编译器' : '未知'))
    .replace(/{{entry}}/g, entry)
    .replace(/{{primary_artifact}}/g, goals[0] || (isHarmony ? 'HarmonyOS APP' : 'Docker image'))
    .replace(/{{secondary_artifact}}/g, goals[1] || '无')
    .replace(/{{target_platform}}/g, decisions.target_platform || 'linux/amd64')
    .replace(/{{target_users}}/g, isHarmony ? '鸿蒙开发者/独立开发者（上架分发）' : '社团成员/独立开发者（本地分发）')
    .replace(/{{docker_strategy}}/g, isHarmony ? '不适用（鸿蒙用 hvigorw 构建）' : hasGoal(goals, 'docker') ? 'build local linux/amd64 image' : '可选')
    .replace(/{{deb_strategy}}/g, isHarmony ? '不适用（鸿蒙用 APP/HAP）' : hasGoal(goals, 'deb') ? 'package app + systemd service（可选）' : '不构建')
    .replace(/{{base_image}}/g, decisions.base_image || 'python:3.10-slim')
    .replace(/{{system_target}}/g, decisions.target_version || 'ubuntu-22.04')
    .replace(/{{decisions_section}}/g, decisionsSection)
    .replace(/{{risks_section}}/g, risksSection)
    .replace(/{{verify_command}}/g, isHarmony ? 'hdc install <app>.app（已注册调试设备）' : inspection.language === 'Python' ? `docker run ${projectName}:latest` : 'docker run <image>:latest')
    .replace(/{{next_actions_section}}/g, nextActions.join('\n'));
}

function hasGoal(goals: string[], expected: string): boolean {
  return goals.some((goal) => goal.toLowerCase().includes(expected));
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

const FALLBACK_TEMPLATE = `# ForgeKit Packaging Plan

> 由 ForgeKit 自动生成。生成时间：{{generated_at}}

## Project
- Name: {{project_name}}
- Type: {{project_type}}
- Language: {{language}}
- Runtime: {{runtime}}
- Entry: {{entry}}

## Goals
- Primary artifact: {{primary_artifact}}
- Secondary artifact: {{secondary_artifact}}
- Target platform: {{target_platform}}

## Build Strategy
- Docker: {{docker_strategy}}
- Base image: {{base_image}}
- System target: {{system_target}}

## Decisions
{{decisions_section}}

## Risks
{{risks_section}}

## Verify
- {{verify_command}}

## Results
- Docker image: pending
- Deb artifact: pending

## Next Actions
{{next_actions_section}}
`;
