/**
 * Machine-readable contract embedded in a generated Forge.md.
 *
 * Markdown stays reviewable for people; this compact payload is the stable
 * input for build capabilities. It prevents a builder from inferring an
 * artifact merely from prose that a user may have edited.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';

export const FORGE_CONTRACT_VERSION = 1;

export const ForgeContractSchema = z.object({
  schema_version: z.literal(FORGE_CONTRACT_VERSION),
  generated_at: z.string(),
  source_dir: z.string(),
  project: z.object({
    name: z.string(),
    language: z.string().optional(),
    runtime: z.string().optional(),
    entrypoints: z.array(z.string()),
  }),
  delivery_targets: z.array(
    z.object({
      ecosystem: z.string(),
      artifacts: z.array(z.string()).min(1),
    })
  ).min(1),
});

export type ForgeContract = z.infer<typeof ForgeContractSchema>;

export type ForgeContractLoadResult =
  | { ok: true; contract: ForgeContract }
  | { ok: false; reason: string };

const CONTRACT_PATTERN = /<!--\s*deliverkit-contract:([A-Za-z0-9_-]+)\s*-->/g;

export function renderForgeContract(contract: ForgeContract): string {
  const encoded = Buffer.from(JSON.stringify(contract), 'utf8').toString('base64url');
  return `<!-- deliverkit-contract:${encoded} -->`;
}

export function loadForgeContract(planPath: string, sourceDir: string): ForgeContractLoadResult {
  let content: string;
  try {
    content = fs.readFileSync(planPath, 'utf8');
  } catch (error) {
    return {
      ok: false,
      reason: `无法读取 Forge.md: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const matches = [...content.matchAll(CONTRACT_PATTERN)];
  const encoded = matches.at(-1)?.[1];
  if (!encoded) {
    return {
      ok: false,
      reason: 'Forge.md 缺少 DeliverKit 机器契约；请重新执行 generate_packaging_plan',
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'Forge.md 的 DeliverKit 机器契约无法解析' };
  }

  const parsed = ForgeContractSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      reason: `Forge.md 的 DeliverKit 机器契约无效: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
        .join('; ')}`,
    };
  }

  const planDirectory = path.dirname(path.resolve(planPath));
  const declaredSourceDir = path.isAbsolute(parsed.data.source_dir)
    ? path.resolve(parsed.data.source_dir)
    : path.resolve(planDirectory, parsed.data.source_dir);
  if (declaredSourceDir !== path.resolve(sourceDir)) {
    return {
      ok: false,
      reason: 'Forge.md 的 source_dir 与本次构建 source_dir 不一致；请为该项目重新生成计划',
    };
  }

  return { ok: true, contract: parsed.data };
}

export function contractIncludesArtifact(
  contract: ForgeContract,
  ecosystem: string,
  artifact: string
): boolean {
  return contract.delivery_targets.some(
    (target) => target.ecosystem === ecosystem && target.artifacts.includes(artifact)
  );
}
