/**
 * Ecosystem knowledge pack loader.
 *
 * 这是知识包的运行时入口：按 id 加载、校验、列出全部已注册生态。
 * 校验失败返回可行动错误（path + message），供 Agent 修复数据。
 *
 * 与 systems/adapter-loader.ts 对齐的模式（js-yaml + zod safeParse），
 * 但知识包采用英文 key + 版本溯源，逐步取代中文 key 的 decision-rules。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { fileURLToPath } from 'node:url';
import {
  EcosystemKnowledgeSchema,
  type EcosystemKnowledge,
} from './ecosystem-schema.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

const ECOSYSTEMS_DIR_CANDIDATES = [
  path.resolve(moduleDir, 'ecosystems'),
  // 编译产物 dist/knowledge → 仓库 src/knowledge/ecosystems（tsc 不复制 .yaml）
  path.resolve(moduleDir, '../../src/knowledge/ecosystems'),
  path.resolve(process.cwd(), 'src/knowledge/ecosystems'),
];

export type EcosystemLoadErrorCode =
  | 'ecosystem_not_found'
  | 'ecosystem_knowledge_unreadable'
  | 'ecosystem_knowledge_invalid';

export type EcosystemLoadResult =
  | { ok: true; knowledge: EcosystemKnowledge }
  | {
      ok: false;
      error: {
        code: EcosystemLoadErrorCode;
        summary: string;
        details?: string[];
      };
    };

function ecosystemsDir(): string {
  const dir = ECOSYSTEMS_DIR_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  return dir ?? ECOSYSTEMS_DIR_CANDIDATES[0];
}

function listEcosystemFiles(): string[] {
  try {
    return fs
      .readdirSync(ecosystemsDir())
      .filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'))
      .map((name) => path.join(ecosystemsDir(), name))
      .sort();
  } catch {
    return [];
  }
}

function readYamlId(filePath: string): string | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed = yaml.load(raw) as { id?: unknown } | null;
    return typeof parsed?.id === 'string' ? parsed.id : null;
  } catch {
    return null;
  }
}

/** 列出全部已注册生态的 id（来自各知识包的 id 字段，单一事实源）。 */
export function listEcosystemIds(): string[] {
  return listEcosystemFiles()
    .map(readYamlId)
    .filter((id): id is string => id !== null)
    .sort();
}

function findEcosystemFile(id: string): string | null {
  const normalized = id.trim();
  return listEcosystemFiles().find((file) => readYamlId(file) === normalized) ?? null;
}

/** 加载单个知识包，校验失败时返回可行动错误。 */
export function loadEcosystemResult(id: string): EcosystemLoadResult {
  const filePath = findEcosystemFile(id);
  if (!filePath) {
    return {
      ok: false,
      error: {
        code: 'ecosystem_not_found',
        summary: `未注册生态知识包: ${id}`,
        details: [`可用生态: ${listEcosystemIds().join(', ') || '（无）'}`],
      },
    };
  }

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'ecosystem_knowledge_unreadable',
        summary: `无法读取生态知识包: ${id}`,
        details: [error instanceof Error ? error.message : String(error)],
      },
    };
  }

  let parsedYaml: unknown;
  try {
    parsedYaml = yaml.load(raw);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'ecosystem_knowledge_invalid',
        summary: `生态知识包 YAML 解析失败: ${id}`,
        details: [error instanceof Error ? error.message : String(error)],
      },
    };
  }

  const parsed = EcosystemKnowledgeSchema.safeParse(parsedYaml);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'ecosystem_knowledge_invalid',
        summary: `生态知识包结构无效: ${id}`,
        details: parsed.error.issues.map(
          (issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`
        ),
      },
    };
  }

  return { ok: true, knowledge: parsed.data };
}

/** 加载单个知识包，不可用时返回 null。 */
export function loadEcosystem(id: string): EcosystemKnowledge | null {
  const result = loadEcosystemResult(id);
  return result.ok ? result.knowledge : null;
}

/** 加载全部已注册生态知识包（跳过错文件，由调用方决定是否暴露错误）。 */
export function loadAllEcosystems(): EcosystemKnowledge[] {
  return listEcosystemIds()
    .map(loadEcosystem)
    .filter((knowledge): knowledge is EcosystemKnowledge => knowledge !== null);
}

/**
 * 把用户/Agent 传入的目标环境或产物目标，解析为已注册生态 id。
 * 未显式指定时默认 linux/ubuntu（与旧 resolveSystemAdapterId 行为一致）。
 */
export function resolveEcosystemId(target?: string): string | null {
  const normalized = (target ?? '').toLowerCase();
  if (!normalized.trim()) {
    return 'linux/ubuntu';
  }
  if (/ubuntu|debian|linux|deb|docker|rpm|appimage/.test(normalized)) {
    return 'linux/ubuntu';
  }
  if (/harmony|鸿蒙|openharmony|hap|\bapp\b/.test(normalized)) {
    return 'mobile/harmonyos';
  }
  return null;
}

/**
 * 根据目标描述，在某个生态知识包内选出产物 id。
 * 未显式命名产物时回退到该生态的第一个产物。
 */
export function selectArtifactIds(target: string, knowledge: EcosystemKnowledge): string[] {
  const normalized = target.toLowerCase();
  const artifactIds = knowledge.artifacts.map((artifact) => artifact.id);
  const wanted = new Set<string>();

  if (/docker/.test(normalized)) {
    wanted.add('docker-image');
  }
  if (/deb/.test(normalized)) {
    wanted.add('deb');
  }
  if (/\bapp\b/.test(normalized)) {
    wanted.add('app');
  }
  if (/hap/.test(normalized)) {
    wanted.add('hap');
  }

  const selected = [...wanted].filter((id) => artifactIds.includes(id));
  return selected.length > 0 ? selected : [artifactIds[0]];
}
