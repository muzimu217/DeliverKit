/**
 * MCP tool registry.
 *
 * Input contracts live in schemas.ts. This module only supplies MCP metadata
 * and converts those contracts to protocol JSON Schema at the boundary.
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ToolInputSchemas, type ToolName } from './schemas.js';

const descriptions: Record<ToolName, string> = {
  inspect_project:
    '分析项目目录，识别语言、入口和已有打包配置，返回推荐的跨生态交付目标。',
  generate_packaging_plan:
    '生成项目级 Forge.md 交付契约，记录目标生态、产物、决策依据和风险（计划先行，后续构建工具必须基于此契约）。',
  get_ecosystem_knowledge:
    '读取某个生态的知识包（产物形态、工具链、签名硬约束、上架规则、验证方法）。缺省 ecosystem 时返回全部已注册生态。',
  pack_deb:
    '按已审查的 Forge.md 契约，在隔离 Ubuntu 容器中构建 deb 包，并在干净容器中安装和运行验证。',
  pack_rpm:
    '按已审查的 Forge.md 契约，在隔离 Rocky Linux 容器中构建 rpm 包，并在干净容器中安装和运行验证。',
  pack_appimage:
    '按已审查的 Forge.md 契约，在隔离 Ubuntu x86_64 容器中封装 AppImage，并以 extract-and-run 验证。',
  generate_ci_workflow:
    '按已审查的 Forge.md 契约生成 GitHub Actions Linux/Windows 多平台交付工作流；签名材料只通过 CI secrets 注入。',
  pack_windows_msi:
    '在 Windows runner 使用 WiX 生成 MSI，使用 Authenticode 签名，并以 signtool/msiexec 完成安装验证。',
  pack_macos:
    '在 macOS runner 使用 codesign/hdiutil 或 productbuild/productsign 生成 DMG/PKG，调用 notarytool 公证，并以 spctl/stapler 验证。',
  pack_harmonyos:
    '在 Linux/Windows DevEco runner 使用 hvigorw 构建 HAP/APP，并用 hdc 安装验证正式签名产物。',
  generate_release_manifest:
    '汇总各平台结构化构建结果、SHA256、签名/安装/运行证据，生成统一 ReleaseManifest.json。',
};

export function registerTools(): Tool[] {
  return (Object.keys(ToolInputSchemas) as ToolName[]).map((name) => {
    const inputSchema = zodToJsonSchema(ToolInputSchemas[name], {
      target: 'jsonSchema7',
      $refStrategy: 'none',
    }) as Tool['inputSchema'];

    return {
      name,
      description: descriptions[name],
      inputSchema: { ...inputSchema, required: inputSchema.required ?? [] },
    };
  });
}

/**
 * 是否为构建类工具（必须基于已存在的 Forge.md 契约执行）。
 * 编排与构建工具同样在此登记，以统一 Plan-before-build 校验。
 */
export function isBuildTool(toolName: string): boolean {
  return toolName === 'pack_deb' || toolName === 'pack_rpm' || toolName === 'pack_appimage' || toolName === 'generate_ci_workflow' || toolName === 'pack_windows_msi' || toolName === 'pack_macos' || toolName === 'pack_harmonyos' || toolName === 'generate_release_manifest';
}

export function isToolName(value: string): value is ToolName {
  return Object.prototype.hasOwnProperty.call(ToolInputSchemas, value);
}
