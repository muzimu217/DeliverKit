/**
 * Typed loader for platform decision rules.
 *
 * Only adapters listed in SUPPORTED_SYSTEM_ADAPTERS are runtime-connected.
 * Other files under src/systems remain reference/planning assets until they
 * have a capability, tests, and an explicit registration here.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const SUPPORTED_SYSTEM_ADAPTERS = ['servers/ubuntu', 'mobile/harmonyos'] as const;
export type SupportedSystemAdapterId = (typeof SUPPORTED_SYSTEM_ADAPTERS)[number];
export type SystemAdapterStatus = 'verified' | 'experimental' | 'planned';

export interface SystemAdapterDescriptor {
  id: SupportedSystemAdapterId;
  family: 'servers' | 'mobile';
  platform: 'ubuntu' | 'harmonyos';
  status: SystemAdapterStatus;
  toolNames: readonly string[];
  artifactTypes: readonly string[];
  requiredToolchain: readonly string[];
  verificationCommands: readonly string[];
}

export const SYSTEM_ADAPTER_DESCRIPTORS: Record<
  SupportedSystemAdapterId,
  SystemAdapterDescriptor
> = {
  'servers/ubuntu': {
    id: 'servers/ubuntu',
    family: 'servers',
    platform: 'ubuntu',
    status: 'verified',
    toolNames: ['build_docker_image', 'pack_deb'],
    artifactTypes: ['docker-image', 'deb-package'],
    requiredToolchain: ['docker', 'dpkg-deb (deb only)'],
    verificationCommands: ['npm run verify', 'node scripts/verify-remote.cjs'],
  },
  'mobile/harmonyos': {
    id: 'mobile/harmonyos',
    family: 'mobile',
    platform: 'harmonyos',
    status: 'experimental',
    toolNames: ['pack_harmonyos_app'],
    artifactTypes: ['hap', 'app'],
    requiredToolchain: ['Node.js >=18', 'DevEco Studio or CLI Tools', 'ohpm', 'hvigorw', 'hdc'],
    verificationCommands: ['hvigorw assembleHap', 'hdc install <artifact.hap>'],
  },
};

const CompatibilityRowSchema = z.object({
  glibc: z.string().optional(),
  python: z.string().optional(),
  node: z.string().optional(),
  remark: z.string().optional(),
});

const DecisionRulesSchema = z.object({
  端类型: z.string(),
  平台: z.string(),
  产物格式: z.string(),
  风险提示: z.array(z.string()).optional(),
  兼容性对照表: z.record(CompatibilityRowSchema).optional(),
}).passthrough();

export type DecisionRules = z.infer<typeof DecisionRulesSchema>;

export interface SystemAdapter {
  id: SupportedSystemAdapterId;
  family: string;
  platform: string;
  rulesPath: string;
  rules: DecisionRules;
  descriptor: SystemAdapterDescriptor;
}

export type SystemAdapterLoadErrorCode =
  | 'adapter_not_supported'
  | 'adapter_rules_not_found'
  | 'adapter_rules_unreadable'
  | 'adapter_rules_invalid';

export type SystemAdapterLoadResult =
  | { ok: true; adapter: SystemAdapter }
  | {
      ok: false;
      error: {
        code: SystemAdapterLoadErrorCode;
        summary: string;
        details?: string[];
      };
    };

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Load one explicitly supported adapter, or return null when unavailable. */
export function loadSystemAdapter(id: string): SystemAdapter | null {
  const result = loadSystemAdapterResult(id);
  return result.ok ? result.adapter : null;
}

export function loadSystemAdapterResult(id: string): SystemAdapterLoadResult {
  if (!isSupportedSystemAdapter(id)) {
    return {
      ok: false,
      error: { code: 'adapter_not_supported', summary: `未注册系统适配器: ${id}` },
    };
  }

  const rulesPath = findRulesPath(id);
  if (!rulesPath) {
    return {
      ok: false,
      error: { code: 'adapter_rules_not_found', summary: `适配器规则文件不存在: ${id}` },
    };
  }

  let parsedYaml: unknown;
  try {
    parsedYaml = yaml.load(fs.readFileSync(rulesPath, 'utf8'));
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'adapter_rules_unreadable',
        summary: `无法读取适配器规则: ${id}`,
        details: [error instanceof Error ? error.message : String(error)],
      },
    };
  }

  const parsedRules = DecisionRulesSchema.safeParse(parsedYaml);
  if (!parsedRules.success) {
    return {
      ok: false,
      error: {
        code: 'adapter_rules_invalid',
        summary: `适配器规则结构无效: ${id}`,
        details: parsedRules.error.issues.map(
          (issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`
        ),
      },
    };
  }

  return {
    ok: true,
    adapter: {
      id,
      family: SYSTEM_ADAPTER_DESCRIPTORS[id].family,
      platform: SYSTEM_ADAPTER_DESCRIPTORS[id].platform,
      rulesPath,
      rules: parsedRules.data,
      descriptor: SYSTEM_ADAPTER_DESCRIPTORS[id],
    },
  };
}

export function isSupportedSystemAdapter(id: string): id is SupportedSystemAdapterId {
  return (SUPPORTED_SYSTEM_ADAPTERS as readonly string[]).includes(id);
}

/** Map a user-facing target environment to an explicitly supported adapter. */
export function resolveSystemAdapterId(
  targetEnvironment?: string
): SupportedSystemAdapterId | null {
  if (!targetEnvironment?.trim()) {
    return 'servers/ubuntu';
  }

  const normalized = targetEnvironment.toLowerCase();
  if (normalized.includes('ubuntu')) {
    return 'servers/ubuntu';
  }
  if (
    normalized.includes('harmony') ||
    normalized.includes('鸿蒙') ||
    normalized.includes('harmonyos') ||
    normalized.includes('openharmony')
  ) {
    return 'mobile/harmonyos';
  }
  return null;
}

function findRulesPath(id: SupportedSystemAdapterId): string | null {
  const candidates = [
    path.resolve(moduleDir, id, 'decision-rules.yaml'),
    path.resolve(moduleDir, '../../src/systems', id, 'decision-rules.yaml'),
    path.resolve(process.cwd(), 'src/systems', id, 'decision-rules.yaml'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}
