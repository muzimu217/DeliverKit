# MCP 目录提交材料包

> 优先级依据 2026 年生态现状：官方 Registry 是规范源头（PulseMCP 等会**自动同步**它），Smithery / Glama 是开发者发现 MCP server 的默认入口，mcp.so 成本最低。
> 全部前置：gates.md 通过（各目录均要求安装方式公开可用）。

## 1. 官方 MCP Registry（最高优先级，发布一次多处同步）

- 入口：<https://registry.modelcontextprotocol.io> · 仓库 <https://github.com/modelcontextprotocol/registry>
- 方式：publisher CLI（`make publisher` 构建）发布 server 元数据；要求安装方式公开（npm 包满足）
- 建议先自验：`npx @modelcontextprotocol/inspector` 用 MCP Inspector 验证 stdio server 握手与工具列表，再提交
- 发布信息：name `deliverkit`，npm 安装 `npx -y deliverkit-mcp`，仓库与站点链接照 README

## 2. Smithery

- 入口：<https://smithery.ai>（17k+ servers，带安全/维护/效率/文档评分）
- 方式：仓库加 `smithery.yaml` 声明启动配置，Smithery 自动扫描已发布包的工具元数据
- 评分抓手：README 质量、文档（交付百科站点）、发布节奏 —— 这三项我们已具备/可控
- 待办：`smithery.yaml` schema 参考其 docs（Registry concepts 页）

## 3. Glama

- 入口：<https://glama.ai/mcp/servers>（76k+ 收录，维护者验证、每日重建）
- 方式：官网提交 / 主动抓取；提交后关注其质量评分反馈并整改

## 4. mcp.so

- 入口：其仓库提 GitHub issue 即可收录（20k+ servers）
- 材料直接复用 awesome-mcp-servers.md 的条目描述

## 5. PulseMCP

- 入口：<https://www.pulsemcp.com>
- 方式：**无需手动提交** —— 官方 Registry 发布后自动流入；发布官方 Registry 后一周回查收录情况

## 提交后统一动作

1. 各目录收录链接回填 matrix.md 状态列；
2. 收录截图存 `docs/community/promotion/assets/`（后续 X 串推与长文的社交证明素材）；
3. 一周后看 GitHub Insights referrers，验证目录流量是否真实流入。
