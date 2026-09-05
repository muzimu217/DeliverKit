/**
 * inspect_project - 项目识别能力
 *
 * 识别：语言、入口、已有打包配置、推荐打包目标
 * 符合 V0.1_IMPLEMENTATION M2 / DESIGN §5.1
 *
 * 性能优化（v0.1+）:
 * - 单次会话内缓存结果
 * - 基于顶层文件指纹自动失效
 */

import * as path from 'path';
import {
  assertSourceDir,
  PathValidationError,
  listFiles,
  readTextFile,
  pathExists,
  assertWithinRoot,
} from './utils/filesystem.js';
import { globalCache } from './utils/cache.js';
import { parseJson5 } from './utils/json5.js';
import type { InspectProjectOutput, ExistingPackaging } from './types.js';
import { detectRuntimeHints } from './utils/runtime-hints.js';

/** 自动识别失败或识别错误时，调用方可手动指定语言与入口继续流程。 */
export interface InspectOverrides {
  language?: string;
  entrypoints?: string[];
}

const CANONICAL_LANGUAGES: Record<string, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  go: 'Go',
  arkts: 'ArkTS',
};

export const SUPPORTED_LANGUAGE_INPUTS = Object.keys(CANONICAL_LANGUAGES);

/** 统一大小写与别名：'python' → 'Python'；未知值原样返回 undefined。 */
export function normalizeLanguageInput(value: string): string | undefined {
  return CANONICAL_LANGUAGES[value.trim().toLowerCase()];
}

export function hasOverrides(overrides?: InspectOverrides): boolean {
  return Boolean(
    overrides && ((overrides.language && overrides.language.length > 0) || (overrides.entrypoints && overrides.entrypoints.length > 0))
  );
}

export async function inspectProject(
  sourceDir: string,
  overrides?: InspectOverrides
): Promise<InspectProjectOutput> {
  // 缓存键只含 sourceDir；带手动覆盖时不读也不写，避免覆盖结果串味。
  if (!hasOverrides(overrides)) {
    const cached = globalCache.get(sourceDir);
    if (cached) {
      return cached;
    }
  }

  const result = inspectProjectImpl(sourceDir, overrides);

  if (result.status === 'success' && !hasOverrides(overrides)) {
    globalCache.set(sourceDir, result);
  }

  return result;
}

/**
 * 项目分析实现（内部函数）
 */
function inspectProjectImpl(sourceDir: string, overrides?: InspectOverrides): InspectProjectOutput {
  // 1. 校验源目录
  try {
    assertSourceDir(sourceDir);
  } catch (e) {
    if (e instanceof PathValidationError) {
      return {
        status: 'failed',
        error: {
          code: e.code,
          summary: e.message,
          suggested_fix: '请提供有效的项目根目录路径',
        },
      };
    }
    throw e;
  }

  // 2. 语言：手动指定优先；未指定或无法识别时走自动检测
  const manualLanguage = overrides?.language ? normalizeLanguageInput(overrides.language) : undefined;
  if (overrides?.language && !manualLanguage) {
    return {
      status: 'failed',
      error: {
        code: 'invalid_input',
        summary: `不支持的语言: ${overrides.language}`,
        suggested_fix: `language 支持 ${SUPPORTED_LANGUAGE_INPUTS.join(' / ')}（大小写不敏感）`,
      },
    };
  }

  // 2. 识别已有打包配置
  const existingPackaging = detectExistingPackaging(sourceDir);

  // 3. 识别语言
  const autoDetected = detectLanguage(sourceDir, existingPackaging);
  const language = manualLanguage ?? autoDetected.language;
  const runtime = manualLanguage ? runtimeForLanguage(manualLanguage, sourceDir) : autoDetected.runtime;

  // 4. 识别入口：手动指定的入口先校验，再进入结果
  let entrypoints: string[];
  if (overrides?.entrypoints && overrides.entrypoints.length > 0) {
    const invalid = overrides.entrypoints.find((entry) => !isAcceptableEntrypoint(entry, sourceDir));
    if (invalid) {
      return {
        status: 'failed',
        error: {
          code: 'invalid_input',
          summary: `入口不可用: ${invalid}`,
          suggested_fix:
            invalid === 'npm start' || isSafeRelativePath(invalid)
              ? '入口必须是项目内的相对路径且文件存在（npm start 除外）；请检查路径拼写'
              : '入口必须是项目内的相对路径（不能是绝对路径或包含 ..）；脚本型入口可使用 npm start',
        },
      };
    }
    entrypoints = [...overrides.entrypoints];
  } else {
    entrypoints = detectEntrypoints(sourceDir, language);
  }

  // 5. 生成推荐
  const recommendations = generateRecommendations(language, existingPackaging, entrypoints);
  const runtimeHints = detectRuntimeHints(sourceDir);

  // 6. 决策依据
  const decisionBasis = {
    build_method: manualLanguage
      ? `手动指定为 ${language} 项目${autoDetected.language && autoDetected.language !== language ? `（自动识别为 ${autoDetected.language}，已忽略）` : ''}`
      : language
        ? `识别为 ${language} 项目`
        : '未识别出已知语言（需手动指定）',
    compatibility_notes: runtime ? [`${language} 运行时: ${runtime}`] : [],
  };

  // 7. 风险提示
  const warnings: string[] = [];
  if (!language) {
    warnings.push('未识别出项目语言，可能需要手动指定');
  }
  if (entrypoints.length === 0) {
    warnings.push('未找到明确入口，构建时可能需要手动指定');
  }
  if (!existingPackaging.dockerfile && language && language !== 'ArkTS') {
    warnings.push('项目缺少 Dockerfile，生成计划时可选择自动生成');
  }

  return {
    status: 'success',
    language,
    runtime,
    entrypoints,
    existing_packaging: existingPackaging,
    recommendations,
    runtime_hints: runtimeHints,
    warnings,
    decision_basis: decisionBasis,
  };
}

/** 手动指定语言时仍尽量推导运行时版本，保持与自动识别同等信息量。 */
function runtimeForLanguage(language: string, sourceDir: string): string {
  switch (language) {
    case 'Python':
      return detectPythonRuntime(sourceDir);
    case 'ArkTS':
      return detectHarmonyRuntime(sourceDir);
    case 'Go':
      return 'Go';
    default:
      return 'Node.js';
  }
}

/**
 * 入口校验：'npm start' 原样放行；其余必须是安全相对路径且文件存在。
 * 构建阶段（resolveLinuxLauncher）还会再校验一次，这里把错误前置到规划阶段。
 */
function isAcceptableEntrypoint(entry: string, sourceDir: string): boolean {
  if (entry === 'npm start') {
    return true;
  }
  if (!isSafeRelativePath(entry)) {
    return false;
  }
  return pathExists(path.join(sourceDir, entry));
}

function isSafeRelativePath(entry: string): boolean {
  if (entry.length === 0 || path.isAbsolute(entry)) {
    return false;
  }
  const parts = entry.split(/[\\/]/);
  return !parts.some((part) => part === '..');
}

// ========== 已有打包配置检测 ==========

function detectExistingPackaging(sourceDir: string): ExistingPackaging {
  return {
    dockerfile: pathExists(path.join(sourceDir, 'Dockerfile')),
    docker_compose:
      pathExists(path.join(sourceDir, 'docker-compose.yml')) ||
      pathExists(path.join(sourceDir, 'docker-compose.yaml')),
    setup_py: pathExists(path.join(sourceDir, 'setup.py')),
    pyproject_toml: pathExists(path.join(sourceDir, 'pyproject.toml')),
    requirements_txt: pathExists(path.join(sourceDir, 'requirements.txt')),
    package_json: pathExists(path.join(sourceDir, 'package.json')),
    gradle_build:
      pathExists(path.join(sourceDir, 'build.gradle')) ||
      pathExists(path.join(sourceDir, 'build.gradle.kts')),
    xcode_project:
      listFiles(sourceDir).some((f) => f.endsWith('.xcodeproj')) ||
      pathExists(path.join(sourceDir, 'Package.swift')),
  };
}

// ========== 语言检测 ==========

function detectLanguage(
  sourceDir: string,
  packaging: ExistingPackaging
): { language?: string; runtime?: string } {
  if (isHarmonyOSProject(sourceDir)) {
    return { language: 'ArkTS', runtime: detectHarmonyRuntime(sourceDir) };
  }

  // Python
  if (
    packaging.setup_py ||
    packaging.pyproject_toml ||
    packaging.requirements_txt ||
    listFiles(sourceDir).some((f) => f.endsWith('.py'))
  ) {
    const runtime = detectPythonRuntime(sourceDir);
    return { language: 'Python', runtime };
  }

  // Node.js / TypeScript
  if (packaging.package_json) {
    const pkg = readTextFile(path.join(sourceDir, 'package.json'));
    const isTypeScript =
      pkg?.includes('"typescript"') || listFiles(sourceDir).some((f) => f.endsWith('.ts'));
    return {
      language: isTypeScript ? 'TypeScript' : 'JavaScript',
      runtime: 'Node.js',
    };
  }

  // Go
  if (
    listFiles(sourceDir).some((f) => f.endsWith('.go')) ||
    pathExists(path.join(sourceDir, 'go.mod'))
  ) {
    return { language: 'Go', runtime: 'Go' };
  }

  return {};
}

function detectPythonRuntime(sourceDir: string): string {
  const pyproject = readTextFile(path.join(sourceDir, 'pyproject.toml'));
  if (pyproject) {
    const match = pyproject.match(/python_requires\s*=\s*["']([^"']+)["']/);
    if (match) {
      return `Python ${match[1]}`;
    }
  }
  return 'Python 3.x';
}

function isHarmonyOSProject(sourceDir: string): boolean {
  return pathExists(path.join(sourceDir, 'AppScope', 'app.json5'))
    && pathExists(path.join(sourceDir, 'build-profile.json5'));
}

function detectHarmonyRuntime(sourceDir: string): string {
  const profile = asRecord(parseJson5(readTextFile(path.join(sourceDir, 'build-profile.json5'))));
  const app = asRecord(profile?.app);
  const products = app?.products;
  if (Array.isArray(products)) {
    for (const product of products) {
      const compatible = asRecord(product)?.compatibleSdkVersion;
      const api = extractHarmonyApi(compatible);
      if (api) {return `HarmonyOS API ${api}`;}
    }
  }
  return 'HarmonyOS';
}

function extractHarmonyApi(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) {return String(value);}
  if (typeof value !== 'string') {return undefined;}
  const parenthesized = value.match(/\((\d{1,2})\)\s*$/);
  if (parenthesized) {return parenthesized[1];}
  return /^\d{1,2}$/.test(value.trim()) ? value.trim() : undefined;
}

// ========== 入口检测 ==========

function detectEntrypoints(sourceDir: string, language?: string): string[] {
  const entries: string[] = [];

  if (language === 'Python') {
    const commonEntries = ['app.py', 'main.py', 'run.py', 'server.py', 'wsgi.py'];
    for (const entry of commonEntries) {
      if (pathExists(path.join(sourceDir, entry))) {
        entries.push(entry);
      }
    }
  } else if (language === 'JavaScript' || language === 'TypeScript') {
    const pkg = readTextFile(path.join(sourceDir, 'package.json'));
    if (pkg) {
      try {
        const parsed: unknown = JSON.parse(pkg);
        if (isPackageManifest(parsed) && parsed.main) {
          entries.push(parsed.main);
        }
        if (isPackageManifest(parsed) && parsed.scripts?.start) {
          entries.push('npm start');
        }
      } catch {
        // ignore parse error
      }
    }
    if (entries.length === 0) {
      const commonEntries = ['index.js', 'index.ts', 'server.js', 'app.js'];
      for (const entry of commonEntries) {
        if (pathExists(path.join(sourceDir, entry))) {
          entries.push(entry);
        }
      }
    }
  } else if (language === 'Go') {
    if (pathExists(path.join(sourceDir, 'main.go'))) {
      entries.push('main.go');
    }
  } else if (language === 'ArkTS') {
    entries.push(...detectHarmonyEntrypoints(sourceDir));
  }

  return entries;
}

function detectHarmonyEntrypoints(sourceDir: string): string[] {
  const profile = asRecord(parseJson5(readTextFile(path.join(sourceDir, 'build-profile.json5'))));
  const modules = profile?.modules;
  if (!Array.isArray(modules)) {return [];}
  const entries: string[] = [];
  for (const moduleValue of modules) {
    const module = asRecord(moduleValue);
    const srcPath = typeof module?.srcPath === 'string' ? module.srcPath : undefined;
    if (!srcPath) {continue;}
    const moduleJsonPath = path.resolve(sourceDir, srcPath, 'src', 'main', 'module.json5');
    try {
      assertWithinRoot(moduleJsonPath, sourceDir);
    } catch (error) {
      if (error instanceof PathValidationError) {continue;}
      throw error;
    }
    const moduleJson = asRecord(parseJson5(readTextFile(moduleJsonPath)));
    const moduleConfig = asRecord(moduleJson?.module);
    const mainElement = typeof moduleConfig?.mainElement === 'string'
      ? moduleConfig.mainElement
      : undefined;
    const abilities = moduleConfig?.abilities;
    if (!mainElement || !Array.isArray(abilities)) {continue;}
    const mainAbility = abilities
      .map(asRecord)
      .find((ability) => ability?.name === mainElement);
    const srcEntry = typeof mainAbility?.srcEntry === 'string' ? mainAbility.srcEntry : undefined;
    if (!srcEntry) {continue;}
    const entryPath = path.resolve(path.dirname(moduleJsonPath), srcEntry);
    try {
      assertWithinRoot(entryPath, sourceDir);
    } catch (error) {
      if (error instanceof PathValidationError) {continue;}
      throw error;
    }
    if (pathExists(entryPath)) {entries.push(path.relative(sourceDir, entryPath));}
  }
  return entries;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function isPackageManifest(value: unknown): value is {
  main?: string;
  scripts?: { start?: string };
} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const manifest = value as Record<string, unknown>;
  const scripts = manifest.scripts;
  return (
    (manifest.main === undefined || typeof manifest.main === 'string') &&
    (scripts === undefined ||
      (typeof scripts === 'object' && scripts !== null &&
        (!('start' in scripts) || typeof scripts.start === 'string')))
  );
}

// ========== 推荐生成 ==========

function generateRecommendations(
  language: string | undefined,
  packaging: ExistingPackaging,
  entrypoints: string[]
): string[] {
  const recs: string[] = [];

  if (language === 'Python') {
    recs.push('推荐打包目标：Docker 镜像（v0.1 硬闭环）');
    if (!packaging.dockerfile) {
      recs.push('建议生成 Dockerfile（基于 python:3.10-slim）');
    }
    recs.push('可选：Ubuntu deb 包（仅当目标为 Ubuntu + systemd）');
  } else if (language === 'JavaScript' || language === 'TypeScript') {
    recs.push('推荐打包目标：Docker 镜像（基于 node:18-alpine）');
  } else if (language === 'Go') {
    recs.push('推荐打包目标：Docker 镜像（多阶段构建，最终 scratch/distroless）');
  } else if (language === 'ArkTS') {
    recs.push('推荐打包目标：HarmonyOS HAP（调试）或 APP（发布）');
    recs.push('使用 hvigorw 构建，并在发布 APP 前完成 AGC 正式签名预检');
  } else {
    recs.push('未识别出已知语言，需用户手动指定打包目标');
  }

  if (entrypoints.length === 0) {
    recs.push('未检测到入口，构建前需确认启动命令');
  }

  return recs;
}
