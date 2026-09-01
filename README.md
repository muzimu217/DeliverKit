# DeliverKit

[![CI](https://github.com/muzimu217/DeliverKit/actions/workflows/test.yml/badge.svg)](https://github.com/muzimu217/DeliverKit/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-stdio-blue)](https://modelcontextprotocol.io)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green)](package.json)

> **AI 交付大脑**：给 Agent 用的全生态交付编排工具。

DeliverKit 不是一个"把 Linux 软件塞进 Windows 跑"的兼容层，而是一个给 AI（Agent）使用的**交付大脑**：它把各生态（Linux / Windows / 苹果 / 鸿蒙）的打包、签名、上架知识变成 AI 能读懂、能执行、能验证的能力，让 AI 理解用户需求后，规划出一条**合法合规的交付链路**，把已经开发好的产品送达每一个生态。

## 30 秒上手

```bash
npx -y --package=deliverkit-mcp -- deliverkit doctor            # 先看本机现在能交付哪些目标，缺什么、怎么补
npx -y --package=deliverkit-mcp -- deliverkit inspect .         # 识别项目语言与入口
npx -y --package=deliverkit-mcp -- deliverkit plan . --goals deb,rpm   # 生成可评审的 Forge.md 交付契约
npx -y --package=deliverkit-mcp -- deliverkit pack-deb . --plan Forge.md   # 构建 + 干净容器安装运行验证（需 Docker）
```

`doctor` 会把「这台机器现在能产出哪些包」摊开讲清楚——不能产出的目标不是缺陷，而是各生态用签名和官方工具链锁定了产出位置，DeliverKit 的做法是把它们规划到正确的 runner 上，而不是在本机伪造产物。

失败时不会只丢一个日志路径给你：错误结果里带 `log_excerpt`（日志尾部片段）、`suggested_fix` 和 `next_actions`，Agent 和人都能直接看到原因与下一步。


## 它解决什么问题

"一次开发、各生态安装包自动产出"之所以难，不是因为没人想做，而是各生态官方用**代码签名 + 官方工具链 + 官方账号**把这条路锁死了：

| 生态 | 产出安装包的硬约束 |
|---|---|
| 苹果（macOS/iOS） | 签名与公证只能在 **macOS + Xcode + Apple 开发者账号**上完成 |
| Windows | 代码签名需要 **Windows 代码签名证书** |
| 鸿蒙 | 需要 **华为 DevEco 工具链 + AGC 签名** |
| Linux（deb/rpm/AppImage） | 唯一能在一台机器上多目标产出，无强制签名门槛 |

所以 DeliverKit **不假装一台机器产出全生态**——它懂得"每个安装包该在哪、用什么合法方式产出、怎么验证它真的能装能跑"，并指挥 AI 在正确的环境（本地 / CI 对应平台 runner / 云构建）里完成。这就绕开了各生态的硬约束，而不是去翻墙。

## 当前能力（v0.2.0 · 契约层 + 多平台工具 + Linux 三目标闭环）

DeliverKit 通过 MCP（stdio）暴露规划、编排与构建工具：

- **`inspect_project`** —— 识别项目语言、入口与已有打包配置，给出跨生态交付目标建议。
- **`generate_packaging_plan`** —— 生成一份可评审的 `Forge.md` 交付契约（目标生态 / 产物 / 决策依据 / 风险）。
- **`get_ecosystem_knowledge`** —— 读取已注册生态的结构化打包、签名、分发与验证规则。
- **`pack_deb`** —— 按 `Forge.md` 在隔离 Ubuntu 容器中构建 `.deb`，并在新容器执行安装和运行验证。
- **`pack_rpm`** —— 按 `Forge.md` 在隔离 Rocky Linux 容器中构建 `.rpm`，并在新容器执行安装和运行验证。
- **`pack_appimage`** —— 按 `Forge.md` 在隔离 Ubuntu x86_64 容器中构建 AppImage，并执行 extract-and-run/AppRun 验证。
- **`generate_ci_workflow`** —— 按 `Forge.md` 生成 GitHub Actions 多平台工作流；Windows/Apple 证书只通过 secrets 注入，HarmonyOS job 要求 Linux self-hosted DevEco runner。
- **`pack_windows_msi`** —— 在 Windows runner 使用 WiX 构建 MSI，执行 Authenticode 签名与静默安装/卸载验证。
- **`pack_macos`** —— 在 macOS runner 使用 codesign/hdiutil 构建 DMG，或使用 productbuild/productsign 构建 PKG，执行 notarytool 公证、spctl 与 stapler 验证。
- **`pack_harmonyos`** —— 在 Linux/Windows DevEco runner 使用 hvigorw 构建 HAP/APP，并用 hdc 安装验证。
- **`generate_release_manifest`** —— 汇总各平台 JSON 结果、SHA256 与验证证据，生成统一 `ReleaseManifest.json`。

三个 Linux 构建工具都需要可用 Docker 守护进程。`npm run test:e2e:linux` 已用
Python Flask、TypeScript 和 Go 标准库 HTTP 三个真实 fixture 复现同一份多目标
`Forge.md`，完成 deb/rpm/AppImage 的构建、安装与运行验证，并生成 `verified`
状态的 Release Manifest；仓库 CI 也会在
Ubuntu 22.04 上重复该 matrix 并上传 JSON 证据，其他 Linux 主机复核仍建议继续执行。

所有平台构建类工具都遵守两条铁律：

1. **计划先行**（Plan-before-build）：无 `Forge.md` 契约不构建。
2. **真实验证**（Real verification）：不只看退出码，要验证产物装得上、跑得起来、签名有效。

失败时的可行动性也被当作契约的一部分：Docker 不可用会区分「没装 / 守护进程没起 / 权限不足 / 探测超时」并给出各自的修复动作；构建超时不会伪装成普通构建失败；每次失败都带日志尾部片段与下一步命令。

## 接入

### 站点（MCP 转化入口）

仓库附带可直接部署的静态站点：[site/index.html](site/index.html)。首屏是 MCP 安装命令与「10 分钟跑通 Linux」首次任务，生态知识与平台前置指南作为次级入口，Agent Skill 见 [skills/deliverkit-mcp/SKILL.md](skills/deliverkit-mcp/SKILL.md)。

```bash
npx serve site
```

站点不收集任何用户数据（无表单、无统计脚本、无 cookie），也不包含任何账号、证书或私钥；部署与内容边界见 [site/README.md](site/README.md)。

MCP（stdio）：

```json
{
  "mcpServers": {
    "deliverkit": {
      "command": "npx",
      "args": ["-y", "deliverkit-mcp"]
    }
  }
}
```

CLI：

```bash
deliverkit doctor                      # 自检本机可交付目标，缺什么、怎么补
deliverkit inspect .                   # 识别项目与交付目标建议
deliverkit plan . --goals deb,rpm      # 生成 Forge.md 交付契约
deliverkit pack-deb . --plan Forge.md  # 构建并验证 deb（需要 Docker）
deliverkit pack-rpm . --plan Forge.md  # 构建并验证 rpm（需要 Docker）
deliverkit pack-appimage . --plan Forge.md  # 构建并验证 AppImage（需要 Docker）
deliverkit generate-ci-workflow . --plan Forge.md  # 生成多平台 GitHub Actions 工作流
deliverkit pack-windows-msi . --plan Forge.md  # 仅 Windows runner 可执行，要求签名 secrets
deliverkit pack-macos . --plan Forge.md  # 仅 macOS runner 可执行，按 Forge.md 构建 DMG/PKG
deliverkit pack-harmonyos . --plan Forge.md  # 仅 DevEco runner 可执行，要求 AGC secrets/设备
deliverkit generate-release-manifest . --plan Forge.md --results .deliverkit/results
```

CLI 默认输出人类可读摘要（产物、验证项、失败原因、下一步）；任何命令加 `--json` 得到与 MCP 一致的结构化结果，供脚本和 Agent 消费。

## 参与

- 提 issue：[bug 报告 / 生态支持请求](https://github.com/muzimu217/DeliverKit/issues/new/choose)
- 提 PR 前请读 [CONTRIBUTING.md](CONTRIBUTING.md)（含「新增生态知识包」与「新增 pack_* 工具」的检查清单）
- 安全问题请按 [SECURITY.md](SECURITY.md) 私下反馈，不要开公开 issue
- 讨论与提问：[GitHub Discussions](https://github.com/muzimu217/DeliverKit/discussions)

## 路线图

见 [docs/ROADMAP.md](docs/ROADMAP.md)。简要：

- **A** — 契约层 + 生态知识包 schema（已完成）
- **B** — Linux 多发行版可验证交付（本地三项目 matrix 门槛已复现，CI/跨主机复核建议继续）
- **C** — 编排层 + CI 矩阵，Windows MSI（实现中，真实签名门槛待 CI 验证）
- **D** — 苹果生态（实现中，签名/公证门槛待 macOS CI 验证）
- **E** — 鸿蒙正式化 + 统一交付报告（实现中，AGC/设备门槛待验证）

## 起源

DeliverKit 的 MCP 协议层与"计划先行 / 真实验证"两条铁律继承自 [ForgeKit](https://github.com/CDUESTC-OpenAtom-Open-Source-Club/ForgeKit)（一个专注 Docker 构建诊断的项目）。两者定位不同、各自独立演进：ForgeKit 往窄里做诊断，DeliverKit 往宽里做多生态交付。

## License

MIT
