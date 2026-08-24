/**
 * MCP Tool Schemas - Zod validation schemas
 *
 * DeliverKit 当前暴露规划、编排与构建工具：
 * - inspect_project: 识别项目，给出跨生态交付目标建议
 * - generate_packaging_plan: 生成 Forge.md 交付契约（目标生态 / 产物 / 风险）
 *
 * 构建与编排工具统一登记 plan_path 强约束。
 */

import { z } from 'zod';
import { EcosystemKnowledgeSchema } from '../../knowledge/ecosystem-schema.js';

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
    'exe', 'msi', 'dmg', 'pkg', 'github-actions-workflow', 'release-manifest',
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
    'ecosystem_not_found',
    'ecosystem_knowledge_unreadable',
    'ecosystem_knowledge_invalid',
    'invalid_path',
    'path_not_found',
    'path_out_of_bounds',
    'language_not_supported',
    'entrypoint_not_found',
    'build_config_invalid',
    'toolchain_not_available',
    'build_failed',
    'verification_failed',
    'artifact_not_found',
    'signing_material_missing',
    'invalid_input',
    'unknown_error',
  ]).describe('错误代码'),
  summary: z.string().describe('错误摘要'),
  detail_log: z.string().optional().describe('详细日志路径'),
  log_excerpt: z.string().optional().describe('失败日志尾部片段（无需打开日志文件即可定位原因）'),
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
  delivery_targets: z
    .array(
      z.object({
        ecosystem: z.string().describe('生态 id（如 linux/ubuntu、mobile/harmonyos）'),
        name: z.string().describe('生态展示名'),
        artifacts: z.array(z.string()).describe('选定产物'),
        store: z.string().nullable().describe('官方商店名（无则 null）'),
        signing_required: z.boolean().describe('签名是否为硬性要求'),
      })
    )
    .optional()
    .describe('多目标交付摘要'),
});

// get_ecosystem_knowledge
export const GetEcosystemKnowledgeInputSchema = z.object({
  ecosystem: z
    .string()
    .optional()
    .describe('生态 id（如 linux/ubuntu、mobile/harmonyos）；缺省返回全部已注册生态'),
});

export const GetEcosystemKnowledgeOutputSchema = DeliverKitResultSchema.extend({
  ecosystems: z.array(EcosystemKnowledgeSchema).optional().describe('生态知识包列表'),
  total: z.number().int().nonnegative().optional().describe('返回的生态知识包数量'),
});

// pack_deb
export const PackDebInputSchema = z.object({
  source_dir: SourceDirSchema,
  plan_path: PlanPathSchema,
  output_dir: z.string().optional().describe('产物输出目录，默认 <source_dir>/.deliverkit/artifacts'),
  package_name: z.string().optional().describe('Debian 包名；缺省时使用项目名'),
});

export const PackDebOutputSchema = DeliverKitResultSchema;

// pack_rpm
export const PackRpmInputSchema = z.object({
  source_dir: SourceDirSchema,
  plan_path: PlanPathSchema,
  output_dir: z.string().optional().describe('产物输出目录，默认 <source_dir>/.deliverkit/artifacts'),
  package_name: z.string().optional().describe('RPM 包名；缺省时使用项目名'),
});

export const PackRpmOutputSchema = DeliverKitResultSchema;

// pack_appimage
export const PackAppImageInputSchema = z.object({
  source_dir: SourceDirSchema,
  plan_path: PlanPathSchema,
  output_dir: z.string().optional().describe('产物输出目录，默认 <source_dir>/.deliverkit/artifacts'),
  package_name: z.string().optional().describe('AppImage 名称；缺省时使用项目名'),
});

export const PackAppImageOutputSchema = DeliverKitResultSchema;

// generate_ci_workflow
export const GenerateCiWorkflowInputSchema = z.object({
  source_dir: SourceDirSchema,
  plan_path: PlanPathSchema,
  output_path: z.string().optional().describe('工作流输出路径，默认 <source_dir>/.github/workflows/deliverkit.yml'),
  overwrite: z.boolean().optional().describe('是否允许覆盖已存在的工作流文件，默认 false'),
});

export const GenerateCiWorkflowOutputSchema = DeliverKitResultSchema;

// pack_windows_msi
export const PackWindowsMsiInputSchema = z.object({
  source_dir: SourceDirSchema,
  plan_path: PlanPathSchema,
  output_dir: z.string().optional().describe('产物输出目录，默认 <source_dir>/.deliverkit/artifacts'),
  package_name: z.string().optional().describe('MSI 名称；缺省时使用项目名'),
});

export const PackWindowsMsiOutputSchema = DeliverKitResultSchema;

// pack_macos
export const PackMacosInputSchema = z.object({
  source_dir: SourceDirSchema,
  plan_path: PlanPathSchema,
  output_dir: z.string().optional().describe('产物输出目录，默认 <source_dir>/.deliverkit/artifacts'),
  package_name: z.string().optional().describe('DMG/PKG 名称；缺省时使用项目名'),
  artifact: z.enum(['dmg', 'pkg']).optional().describe('构建 DMG 或签名 PKG，默认按计划选择'),
});

export const PackMacosOutputSchema = DeliverKitResultSchema;

// pack_harmonyos
export const PackHarmonyosInputSchema = z.object({
  source_dir: SourceDirSchema,
  plan_path: PlanPathSchema,
  output_dir: z.string().optional().describe('产物输出目录，默认 <source_dir>/.deliverkit/artifacts'),
  artifact: z.enum(['hap', 'app']).optional().describe('构建 HAP 或正式 APP，默认按计划选择'),
});

export const PackHarmonyosOutputSchema = DeliverKitResultSchema;

// generate_release_manifest
export const GenerateReleaseManifestInputSchema = z.object({
  source_dir: SourceDirSchema,
  plan_path: PlanPathSchema,
  results_dir: z.string().optional().describe('平台结果 JSON 目录，默认 <source_dir>/.deliverkit/results'),
  output_path: z.string().optional().describe('报告输出路径，默认 <source_dir>/ReleaseManifest.json'),
});

export const GenerateReleaseManifestOutputSchema = DeliverKitResultSchema;

// ========== 导出类型（从 Schema 推导）==========

export type InspectProjectInput = z.infer<typeof InspectProjectInputSchema>;
export type InspectProjectOutput = z.infer<typeof InspectProjectOutputSchema>;

export type GeneratePackagingPlanInput = z.infer<typeof GeneratePackagingPlanInputSchema>;
export type GeneratePackagingPlanOutput = z.infer<typeof GeneratePackagingPlanOutputSchema>;

export type GetEcosystemKnowledgeInput = z.infer<typeof GetEcosystemKnowledgeInputSchema>;
export type GetEcosystemKnowledgeOutput = z.infer<typeof GetEcosystemKnowledgeOutputSchema>;
export type PackDebInput = z.infer<typeof PackDebInputSchema>;
export type PackDebOutput = z.infer<typeof PackDebOutputSchema>;
export type PackRpmInput = z.infer<typeof PackRpmInputSchema>;
export type PackRpmOutput = z.infer<typeof PackRpmOutputSchema>;
export type PackAppImageInput = z.infer<typeof PackAppImageInputSchema>;
export type PackAppImageOutput = z.infer<typeof PackAppImageOutputSchema>;
export type GenerateCiWorkflowInput = z.infer<typeof GenerateCiWorkflowInputSchema>;
export type GenerateCiWorkflowOutput = z.infer<typeof GenerateCiWorkflowOutputSchema>;
export type PackWindowsMsiInput = z.infer<typeof PackWindowsMsiInputSchema>;
export type PackWindowsMsiOutput = z.infer<typeof PackWindowsMsiOutputSchema>;
export type PackMacosInput = z.infer<typeof PackMacosInputSchema>;
export type PackMacosOutput = z.infer<typeof PackMacosOutputSchema>;
export type PackHarmonyosInput = z.infer<typeof PackHarmonyosInputSchema>;
export type PackHarmonyosOutput = z.infer<typeof PackHarmonyosOutputSchema>;
export type GenerateReleaseManifestInput = z.infer<typeof GenerateReleaseManifestInputSchema>;
export type GenerateReleaseManifestOutput = z.infer<typeof GenerateReleaseManifestOutputSchema>;

/**
 * Single source of truth for MCP tool input contracts.
 * The registry and executor both consume this map; do not duplicate schemas.
 */
export const ToolInputSchemas = {
  inspect_project: InspectProjectInputSchema,
  generate_packaging_plan: GeneratePackagingPlanInputSchema,
  get_ecosystem_knowledge: GetEcosystemKnowledgeInputSchema,
  pack_deb: PackDebInputSchema,
  pack_rpm: PackRpmInputSchema,
  pack_appimage: PackAppImageInputSchema,
  generate_ci_workflow: GenerateCiWorkflowInputSchema,
  pack_windows_msi: PackWindowsMsiInputSchema,
  pack_macos: PackMacosInputSchema,
  pack_harmonyos: PackHarmonyosInputSchema,
  generate_release_manifest: GenerateReleaseManifestInputSchema,
} as const;

export type ToolName = keyof typeof ToolInputSchemas;
