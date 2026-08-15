/**
 * DeliverKit 统一结果与错误结构
 * 所有 MCP 工具必须遵循此契约
 *
 * 注：内部类型名 ForgeKitResult/ForgeKitError 沿用自 ForgeKit 骨架，
 * 后续阶段会统一改为 DeliverKit 命名。功能无影响。
 */

// ========== 结果结构 ==========

export interface ForgeKitResult {
  status: 'success' | 'failed';
  artifacts?: Artifact[];
  logs?: LogInfo;
  warnings?: string[];
  decision_basis?: DecisionBasis;
  next_actions?: string[];
  error?: ForgeKitError;
}

export interface Artifact {
  type:
    | 'docker-image'
    | 'deb-package'
    | 'rpm-package'
    | 'appimage'
    | 'apk'
    | 'ipa'
    | 'hap'
    | 'app'
    | 'pwa'
    | 'exe'
    | 'msi'
    | 'dmg'
    | 'pkg';
  path: string;
  checksum?: string;
  size_bytes?: number;
  metadata?: Record<string, unknown>;
}

export interface LogInfo {
  path: string;
  summary: string;
  full_available: boolean;
}

export interface DecisionBasis {
  target_platform?: string;
  target_version?: string;
  base_image?: string;
  build_method?: string;
  compatibility_notes?: string[];
  risks_acknowledged?: string[];
}

// ========== 错误结构 ==========

export interface ForgeKitError {
  code: ErrorCode;
  summary: string;
  detail_log?: string;
  suggested_fix?: string;
  plan_correction?: string;
}

export type ErrorCode =
  // 计划相关
  | 'plan_not_found'
  | 'plan_invalid'
  | 'adapter_not_supported'
  | 'adapter_rules_not_found'
  | 'adapter_rules_unreadable'
  | 'adapter_rules_invalid'
  // 生态知识包相关
  | 'ecosystem_not_found'
  | 'ecosystem_knowledge_unreadable'
  | 'ecosystem_knowledge_invalid'
  // 路径相关
  | 'invalid_path'
  | 'path_not_found'
  | 'path_out_of_bounds'
  // 项目相关
  | 'language_not_supported'
  | 'entrypoint_not_found'
  | 'build_config_invalid'
  | 'invalid_input'
  // 通用
  | 'unknown_error';

// ========== 工具特定输出 ==========

export interface InspectProjectOutput extends ForgeKitResult {
  language?: string;
  runtime?: string;
  entrypoints?: string[];
  existing_packaging?: ExistingPackaging;
  recommendations?: string[];
  runtime_hints?: {
    container_port?: number;
    healthcheck_path?: string;
    confidence: 'high' | 'medium' | 'low';
    evidence: string[];
    conflicts?: string[];
  };
}

export interface ExistingPackaging {
  dockerfile?: boolean;
  docker_compose?: boolean;
  setup_py?: boolean;
  pyproject_toml?: boolean;
  requirements_txt?: boolean;
  package_json?: boolean;
  gradle_build?: boolean;
  xcode_project?: boolean;
}

export interface GeneratePackagingPlanOutput extends ForgeKitResult {
  plan_path?: string;
  summary?: string;
  warnings?: string[];
  next_actions?: string[];
  delivery_targets?: DeliveryTargetSummary[];
}

/** 一个交付目标在计划中的摘要（对应一个生态 + 选定产物）。 */
export interface DeliveryTargetSummary {
  ecosystem: string;
  name: string;
  artifacts: string[];
  store: string | null;
  signing_required: boolean;
}

// ========== Plan-before-build 强制约束 ==========

/**
 * 所有构建类工具（pack_* / build_*）必须接收 plan_path
 * 缺失时返回 plan_not_found 错误
 *
 * 当前阶段 DeliverKit 只暴露规划类工具；构建工具接入后在此生效。
 */
export interface BuildToolInput {
  source_dir: string;
  plan_path: string; // 必需，缺失返回 plan_not_found
  target_platform?: string;
}

/**
 * 非构建类工具（inspect_project、generate_packaging_plan）
 * 不强制要求 plan_path
 */
export interface NonBuildToolInput {
  source_dir: string;
  plan_path?: string;
}
