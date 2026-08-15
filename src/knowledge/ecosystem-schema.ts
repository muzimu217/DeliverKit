/**
 * Ecosystem Knowledge Pack schema.
 *
 * 这是"给 AI 用"的核心契约：把一个生态的产物形态、工具链、签名硬约束、
 * 上架规则与验证方法，收敛成 AI 可读、带版本溯源的结构化数据。
 *
 * - zod 为单一事实源（Single Source of Truth）
 * - 导出 JSON Schema 供 Agent / 文档离线参考
 * - 全英文 key，机器/AI 友好
 *
 * 字段语义见各 describe 注释。数据样例见 ./ecosystems/*.yaml。
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const ECOSYSTEM_SCHEMA_VERSION = 1;

export const EcosystemFamilySchema = z.enum([
  'linux',
  'windows',
  'apple',
  'harmonyos',
  'web',
]);

export const EcosystemStatusSchema = z.enum(['verified', 'experimental', 'planned']);

const ArtifactSchema = z.object({
  id: z.string().describe('产物 ID（如 deb、hap、app、exe、dmg、apk）'),
  extension: z.string().describe('文件扩展名（含点，如 .deb、.hap、.app）'),
  store_ready: z.boolean().describe('是否为可直接上架官方商店的产物形态'),
  note: z.string().optional().describe('产物用途说明'),
});

const ToolchainSchema = z.object({
  build_os: z
    .string()
    .describe('必须在哪个操作系统完成构建（硬约束：交叉产出能力有限时必须在该 OS 执行）'),
  cross_buildable: z
    .boolean()
    .describe('是否可在任意操作系统交叉产出（false 表示构建必须在 build_os 上进行）'),
  required: z.array(z.string()).describe('必需工具链'),
  install_hint: z.string().optional().describe('工具链安装说明'),
});

const SigningSchema = z.object({
  required: z.boolean().describe('签名/公证是否为硬性要求'),
  type: z.enum(['none', 'gpg', 'codesign', 'apple', 'agc']).describe('签名类型'),
  issuer: z.string().nullable().optional().describe('签发方 / 证书来源（无则 null）'),
  how_to_get: z.string().optional().describe('如何获取签名材料'),
  secret_ref: z.string().nullable().optional().describe('密钥引用（如 secret://...）'),
  risks: z.array(z.string()).default([]).describe('签名相关风险'),
});

const DistributionSchema = z.object({
  store: z.string().nullable().describe('官方商店名（无官方商店则 null）'),
  requirements: z.array(z.string()).default([]).describe('上架要求'),
});

const VerificationSchema = z.object({
  install: z.string().describe('安装命令'),
  run: z.string().describe('运行验证命令'),
  checks: z.array(z.string()).default([]).describe('额外质量检查'),
});

const KnownIssueSchema = z.object({
  id: z.string().describe('问题 ID'),
  severity: z.enum(['high', 'medium', 'low']).describe('严重程度'),
  symptom: z.string().describe('症状'),
  cause: z.string().optional().describe('根因'),
  fix: z.array(z.string()).default([]).describe('修复/规避方式'),
});

const CompatibilityRowSchema = z
  .object({
    target: z.string().describe('目标平台版本（如 Ubuntu 20.04 / API_17）'),
    remark: z.string().optional().describe('说明'),
  })
  .passthrough(); // 允许 glibc/python/node/os/stage_model/toolchain 等生态特有字段

export const EcosystemKnowledgeSchema = z.object({
  schema_version: z.literal(ECOSYSTEM_SCHEMA_VERSION).describe('schema 版本，用于溯源'),
  id: z.string().describe('唯一 ID（如 linux/ubuntu、mobile/harmonyos）'),
  ecosystem: EcosystemFamilySchema.describe('生态家族'),
  name: z.string().describe('生态展示名'),
  status: EcosystemStatusSchema.describe('接入状态'),
  updated_at: z.string().describe('最后更新日期（ISO 日期）'),
  summary: z.string().describe('一句话概述（给 AI 快速判断适用性）'),

  artifacts: z.array(ArtifactSchema).min(1).describe('产物形态'),
  toolchain: ToolchainSchema.describe('工具链与构建环境约束'),
  signing: SigningSchema.describe('签名/公证硬约束'),
  distribution: DistributionSchema.describe('分发/上架规则'),
  verification: VerificationSchema.describe('装得上、跑得起来的验证方法'),

  known_issues: z.array(KnownIssueSchema).default([]).describe('已知失败模式'),
  compatibility: z.array(CompatibilityRowSchema).default([]).describe('版本兼容矩阵'),
  decision_rules: z.record(z.unknown()).default({}).describe('自由决策规则（渐进迁移旧规则）'),
});

export type EcosystemKnowledge = z.infer<typeof EcosystemKnowledgeSchema>;
export type EcosystemFamily = z.infer<typeof EcosystemFamilySchema>;
export type EcosystemStatus = z.infer<typeof EcosystemStatusSchema>;

/**
 * JSON Schema 导出（供 Agent 理解知识包结构 / 离线文档参考）。
 * 与 MCP 工具 registry 相同的转换策略，保证一致性。
 */
export const ecosystemKnowledgeJsonSchema = zodToJsonSchema(EcosystemKnowledgeSchema, {
  target: 'jsonSchema7',
  $refStrategy: 'none',
});
