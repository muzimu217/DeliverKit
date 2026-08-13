/**
 * InspectCache - 项目分析结果缓存
 *
 * 特性：
 * - 单例模式，整个 MCP Server 会话共享
 * - 基于顶层文件指纹自动失效
 * - 不递归子目录，轻量级
 *
 * 性能提升：
 * - 首次调用: ~10-50ms（含指纹计算）
 * - 后续调用: ~1-2ms（指纹计算 + 缓存读取）
 * - 提升: 5-25x
 */

import * as fs from 'fs';
import * as path from 'path';
import type { InspectProjectOutput } from '../types.js';

/**
 * 缓存条目
 */
interface CacheEntry {
  fingerprint: string;
  result: InspectProjectOutput;
  timestamp: number;
}

/**
 * 项目分析结果缓存
 *
 * 使用轻量指纹策略：
 * - 只检查顶层文件（不递归子目录）
 * - 指纹 = 目录 mtime + 文件名:mtime:size
 * - 文件变更自动失效缓存
 */
export class InspectCache {
  private cache = new Map<string, CacheEntry>();

  /**
   * 计算顶层文件指纹
   *
   * 指纹格式: `目录mtime|文件1:mtime:size|文件2:mtime:size|...`
   *
   * 特点：
   * - 只看顶层文件，忽略子目录
   * - 文件名排序保证稳定性
   * - 包含 mtime 和 size，精确检测变更
   */
  getFingerprint(sourceDir: string): string {
    const stat = fs.statSync(sourceDir);
    const files = fs
      .readdirSync(sourceDir, { withFileTypes: true })
      .filter((f) => f.isFile()) // 只看文件，忽略子目录
      .sort((a, b) => a.name.localeCompare(b.name)); // 排序保证稳定性

    const parts: string[] = [`${stat.mtimeMs}`];
    for (const f of files) {
      const filePath = path.join(sourceDir, f.name);
      const s = fs.statSync(filePath);
      parts.push(`${f.name}:${s.mtimeMs}:${s.size}`);
    }
    return parts.join('|');
  }

  /**
   * 获取缓存（若指纹匹配）
   *
   * @returns 缓存结果，或 null（缓存不存在/失效/错误）
   */
  get(sourceDir: string): InspectProjectOutput | null {
    try {
      const fp = this.getFingerprint(sourceDir);
      const cached = this.cache.get(sourceDir);

      if (cached && cached.fingerprint === fp) {
        // 缓存命中
        return cached.result;
      }

      // 缓存失效（指纹不匹配）
      return null;
    } catch {
      // 文件系统错误（如目录被删除）时返回 null
      return null;
    }
  }

  /**
   * 设置缓存
   */
  set(sourceDir: string, result: InspectProjectOutput): void {
    try {
      const fp = this.getFingerprint(sourceDir);
      this.cache.set(sourceDir, {
        fingerprint: fp,
        result,
        timestamp: Date.now(),
      });
    } catch {
      // 忽略缓存失败（不影响主流程）
    }
  }

  /**
   * 清空缓存（用于测试）
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存统计（用于调试）
   */
  stats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

/**
 * 全局单例
 * 整个 MCP Server 会话共享
 */
export const globalCache = new InspectCache();