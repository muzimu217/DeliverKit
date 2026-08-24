/**
 * CLI 输出渲染。
 *
 * 工具返回的是给 Agent 用的结构化 JSON，但人在终端里需要先看到「成没成、
 * 产物在哪、失败原因是什么、下一步做什么」。默认渲染成人类可读文本，
 * --json 仍然输出原始结构给脚本和 Agent 使用。
 */

import type { ForgeKitResult } from '../capabilities/types.js';

export interface EmitOptions {
  json?: boolean;
}

export function emitResult(result: ForgeKitResult, options: EmitOptions = {}): void {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${renderResult(result)}\n`);
}

export function renderResult(result: ForgeKitResult): string {
  const lines: string[] = [];

  if (result.status === 'success') {
    lines.push(`✅ 成功${result.artifacts?.length ? ` · 产出 ${result.artifacts.length} 个产物` : ''}`);
    for (const artifact of result.artifacts ?? []) {
      lines.push(`   产物  ${artifact.path}`);
      const meta: string[] = [artifact.type];
      if (typeof artifact.size_bytes === 'number') {
        meta.push(formatSize(artifact.size_bytes));
      }
      if (artifact.checksum) {
        meta.push(`sha256 ${artifact.checksum.slice(0, 12)}…`);
      }
      lines.push(`         ${meta.join(' · ')}`);
      const checks = artifact.metadata?.verified_checks;
      if (Array.isArray(checks) && checks.length > 0) {
        lines.push(`   验证  ${checks.join(' / ')}`);
      }
    }
    if (result.decision_basis) {
      const basis = [
        result.decision_basis.target_platform,
        result.decision_basis.target_version,
        result.decision_basis.build_method,
      ].filter(Boolean);
      if (basis.length > 0) {
        lines.push(`   依据  ${basis.join(' · ')}`);
      }
    }
    if (result.logs?.path) {
      lines.push(`   日志  ${result.logs.path}`);
    }
  } else {
    const error = result.error;
    lines.push(`❌ 失败${error?.code ? ` · ${error.code}` : ''}`);
    if (error?.summary) {
      lines.push(`   原因  ${error.summary}`);
    }
    if (error?.suggested_fix) {
      lines.push(`   建议  ${error.suggested_fix}`);
    }
    if (error?.plan_correction) {
      lines.push(`   契约  ${error.plan_correction}`);
    }
    if (error?.log_excerpt) {
      lines.push('   日志片段');
      for (const line of error.log_excerpt.split('\n')) {
        lines.push(`     | ${line}`);
      }
    }
    if (error?.detail_log) {
      lines.push(`   完整日志  ${error.detail_log}`);
    }
  }

  for (const warning of result.warnings ?? []) {
    lines.push(`⚠️  ${warning}`);
  }
  if (result.next_actions?.length) {
    lines.push('   下一步');
    for (const action of result.next_actions) {
      lines.push(`     - ${action}`);
    }
  }
  lines.push('', '（加 --json 可获得完整结构化结果）');
  return lines.join('\n');
}

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
