import type { DecisionBasis, InspectProjectOutput } from './types.js';
import type { DecisionRules } from '../systems/adapter-loader.js';

export function deriveDecisions(
  goals: string[],
  inspect: InspectProjectOutput,
  rules: DecisionRules | null,
  targetEnvironment?: string
): DecisionBasis {
  // 鸿蒙（HarmonyOS NEXT）分支
  if (rules?.平台 === 'harmonyos') {
    const api = parseHarmonyApi(targetEnvironment, inspect.runtime);
    const isApp = goals.some((g) => g.toLowerCase().includes('app'));
    return {
      target_platform: `harmonyos/${api}`,
      target_version: `HarmonyOS NEXT API ${api}`,
      base_image: '不适用（方舟编译器 AOT，非容器镜像）',
      build_method: isApp
        ? 'hvigorw assembleApp（发布上架）'
        : 'hvigorw assembleHap（调试分发）',
      compatibility_notes: [
        `HarmonyOS NEXT（API ${api}），Stage 模型，脱离 AOSP`,
        '调试 HAP 可装已注册设备；发布 APP 需 AGC 正式签名',
      ],
      risks_acknowledged: [],
    };
  }

  const isDocker = goals.some((goal) => goal.toLowerCase().includes('docker'));
  const isDeb = goals.some((goal) => goal.toLowerCase().includes('deb'));
  const ubuntuVersion = selectUbuntuVersion(targetEnvironment);
  const baseImage = selectBaseImage(inspect.language);
  const compatibilityNotes = getCompatibilityNotes(rules, ubuntuVersion);
  const buildMethodParts: string[] = [];

  if (isDocker) {
    buildMethodParts.push('Docker 镜像构建（v0.1 硬闭环）');
  }
  if (isDeb) {
    buildMethodParts.push('Ubuntu deb 包（可选，仅 systemd 目标）');
  }

  return {
    target_platform: `ubuntu-${ubuntuVersion}`,
    target_version: `Ubuntu ${ubuntuVersion} LTS`,
    base_image: baseImage,
    build_method: buildMethodParts.join(' + ') || 'Docker 镜像（默认硬闭环）',
    compatibility_notes: compatibilityNotes,
    risks_acknowledged: [],
  };
}

export function deriveRisks(rules: DecisionRules | null, goals: string[]): string[] {
  const risks = rules?.风险提示 ? [...rules.风险提示] : [
    'glibc 版本不兼容：高版本构建的产物无法在低版本运行',
    '原生依赖缺失：目标系统需预装所需原生库',
    'Docker daemon 不可用：本地构建需 Docker 运行',
  ];

  if (rules?.平台 === 'harmonyos') {
    if (goals.some((g) => g.toLowerCase().includes('app'))) {
      risks.push('发布 APP 需 AGC 正式签名与 Profile，调试证书将被审核拒绝');
    }
  } else if (goals.some((goal) => goal.toLowerCase().includes('deb'))) {
    risks.push('deb 仅适用于 Ubuntu + systemd 环境，其他发行版需用 Docker');
  }
  return risks;
}

export function deriveNextActions(
  goals: string[],
  inspect: InspectProjectOutput,
  rules?: DecisionRules | null
): string[] {
  const actions = ['审查生成的 Forge.md（Decisions / Risks 段）'];
  if (rules?.平台 === 'harmonyos') {
    actions.push('调用 pack_harmonyos_app 执行构建（需携带 plan_path）');
    actions.push('上架前在 AppGallery Connect 配置正式签名（.cer / .p12 / .p7b）');
    return actions;
  }
  if (goals.some((goal) => goal.toLowerCase().includes('docker'))) {
    actions.push('调用 build_docker_image 执行构建（需携带 plan_path）');
  }
  if (goals.some((goal) => goal.toLowerCase().includes('deb'))) {
    actions.push('（可选）调用 pack_deb 构建 deb 包');
  }
  if (!inspect.existing_packaging?.dockerfile) {
    actions.push('项目无 Dockerfile，构建时自动生成');
  }
  return actions;
}

function selectUbuntuVersion(targetEnvironment?: string): string {
  if (targetEnvironment?.includes('20.04')) {
    return '20.04';
  }
  if (targetEnvironment?.includes('24.04')) {
    return '24.04';
  }
  return '22.04';
}

function selectBaseImage(language?: string): string {
  if (language === 'Python') {
    return 'python:3.10-slim';
  }
  if (language === 'TypeScript' || language === 'JavaScript') {
    return 'node:18-alpine';
  }
  if (language === 'Go') {
    return 'golang:1.21-alpine';
  }
  return 'ubuntu:22.04';
}

function getCompatibilityNotes(rules: DecisionRules | null, version: string): string[] {
  const row = rules?.兼容性对照表?.[`Ubuntu_${version.replace('.', '_')}`];
  if (!row) {
    return [];
  }
  return [
    `Ubuntu ${version}: glibc ${row.glibc}, Python ${row.python}, Node ${row.node}`,
    `兼容性：${row.remark}`,
  ];
}

/** 从 targetEnvironment（如 harmonyos-17）解析 API 版本，默认 17。 */
function parseHarmonyApi(targetEnvironment?: string, detectedRuntime?: string): string {
  const match = targetEnvironment?.match(/(\d{1,2})/);
  if (match) {
    const api = parseInt(match[1], 10);
    if (api >= 9 && api <= 24) {
      return String(api);
    }
  }
  const detected = detectedRuntime?.match(/API\s+(\d{1,2})/i);
  if (detected) {
    const api = parseInt(detected[1], 10);
    if (api >= 9 && api <= 24) {return String(api);}
  }
  return '17';
}
