/**
 * MCP Tool Schemas - Zod validation schemas
 *
 * DeliverKit 当前暴露两个规划类工具：
 * - inspect_project: 识别项目，给出跨生态交付目标建议
 * - generate_packaging_plan: 生成 Forge.md 交付契约（目标生态 / 产物 / 风险）
 *
 * 构建类工具（pack_* / build_*）按阶段逐步接入，届时在此登记 plan_path 强约束。
 */

import { z } from 'zod';

// ========== 通用输入 Schema ==========

const SourceDirSchema = z.string().describe('项目根目录路径');

export const PlanPathSchema = z.string().describe('Forge.md 交付契约文件路径（构建类工具必需）');

// ========== 通用输出 Schema ==========

const DecisionBasisSchema = z.object({
  target_platform: z.string().optional().describe('目标平台（如 ubuntu-22.04、windows、macos、harmonyos）'),
  target_version: z.string().optional().describe('目标版本'),
  build_method: z.string().optional().describe('构建/产出方式'),
  compatibility_notes: z.array(z.string()).optional().describe('兼容性说明'),
  risks_acknowledged: z.array(z.string()).optional().describe('已确认风险'),
});

const ArtifactSchema = z.object({
  type: z.enum([
    'docker-image', 'deb-package', 'rpm-package', 'appimage',
    'apk', 'ipa', 'hap', 'app', 'pwa',
    'exe', 'msi', 'dmg', 'pkg',
  ]).describe('产物类型'),
  path: z.string().describe('产物路径'),
  checksum: z.string().optional().describe('SHA256 校验和'),
  size_bytes: z.number().optional().describe('产物大小（字节）'),
});

const LogInfoSchema = z.object({
  path: z.string().describe('日志文件路径'),
  summary: z.string().describe('日志摘要'),
  full_available: z.boolean().describe('完整日志是否可用'),
});

const DeliverKitErrorSchema = z.object({
  code: z.enum([
    'plan_not_found',
    'plan_invalid',
    'adapter_not_supported',
    'adapter_rules_not_found',
    'adapter_rules_unreadable',
    'adapter_rules_invalid',
    'invalid_path',
    'path_not_found',
    'path_out_of_bounds',
    'language_not_supported',
    'entrypoint_not_found',
    'build_config_invalid',
    'invalid_input',
    'unknown_error',
  ]).describe('错误代码'),
  summary: z.string().describe('错误摘要'),
  detail_log: z.string().optional().describe('详细日志路径'),
  suggested_fix: z.string().optional().describe('修复建议'),
  plan_correction: z.string().optional().describe('计划修正建议'),
});

const DeliverKitResultSchema = z.object({
  status: z.enum(['success', 'failed']).describe('执行状态'),
  artifacts: z.array(ArtifactSchema).optional().describe('产物列表'),
  logs: LogInfoSchema.optional().describe('日志信息'),
  warnings: z.array(z.string()).optional().describe('非阻塞警告'),
  decision_basis: DecisionBasisSchema.optional().describe('决策依据'),
  next_actions: z.array(z.string()).optional().describe('后续建议'),
  error: DeliverKitErrorSchema.optional().describe('错误信息（仅失败时）'),
});

// ========== 工具特定 Schema ==========

// inspect_project
export const InspectProjectInputSchema = z.object({
  source_dir: SourceDirSchema,
});

export const InspectProjectOutputSchema = DeliverKitResultSchema.extend({
  language: z.string().optional().describe('项目语言'),
  runtime: z.string().optional().describe('运行时版本'),
  entrypoints: z.array(z.string()).optional().describe('可能入口'),
  existing_packaging: z.object({
    dockerfile: z.boolean().optional(),
    docker_compose: z.boolean().optional(),
    setup_py: z.boolean().optional(),
    pyproject_toml: z.boolean().optional(),
    requirements_txt: z.boolean().optional(),
    package_json: z.boolean().optional(),
    gradle_build: z.boolean().optional(),
    xcode_project: z.boolean().optional(),
  }).optional().describe('已有打包配置'),
  recommendations: z.array(z.string()).optional().describe('推荐交付目标'),
  runtime_hints: z.object({
    container_port: z.number().int().min(1).max(65535).optional(),
    healthcheck_path: z.string().startsWith('/').optional(),
    confidence: z.enum(['high', 'medium', 'low']),
    evidence: z.array(z.string()),
    conflicts: z.array(z.string()).optional(),
  }).optional().describe('从 Dockerfile 和常见入口保守推导的运行验证参数'),
});

// generate_packaging_plan
export const GeneratePackagingPlanInputSchema = z.object({
  source_dir: SourceDirSchema,
  goals: z.array(z.string()).describe('目标产物列表（如 ["deb", "rpm"] 或 ["windows-msi"]）'),
  target_environment: z.string().optional().describe('目标环境（如 ubuntu-22.04、windows、macos、harmonyos）'),
});

export const GeneratePackagingPlanOutputSchema = DeliverKitResultSchema.extend({
  plan_path: z.string().optional().describe('生成的 Forge.md 交付契约路径'),
  summary: z.string().optional().describe('交付计划摘要'),
});

// 构建类工具 schema 占位：pack_deb / pack_rpm / pack_appimage / pack_windows /
// pack_apple / pack_harmonyos 将在对应阶段加入 ToolInputSchemas，并复用 PlanPathSchema。

// ========== 导出类型（从 Schema 推导）==========

export type InspectProjectInput = z.infer<typeof InspectProjectInputSchema>;
export type InspectProjectOutput = z.infer<typeof InspectProjectOutputSchema>;

export type GeneratePackagingPlanInput = z.infer<typeof GeneratePackagingPlanInputSchema>;
export type GeneratePackagingPlanOutput = z.infer<typeof GeneratePackagingPlanOutputSchema>;

/**
 * Single source of truth for MCP tool input contracts.
 * The registry and executor both consume this map; do not duplicate schemas.
 */
export const ToolInputSchemas = {
  inspect_project: InspectProjectInputSchema,
  generate_packaging_plan: GeneratePackagingPlanInputSchema,
} as const;

export type ToolName = keyof typeof ToolInputSchemas;
