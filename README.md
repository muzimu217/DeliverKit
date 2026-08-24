# DeliverKit

> **AI 交付大脑**：给 Agent 用的全生态交付编排工具。

DeliverKit 不是一个"把 Linux 软件塞进 Windows 跑"的兼容层，而是一个给 AI（Agent）使用的**交付大脑**：它把各生态（Linux / Windows / 苹果 / 鸿蒙）的打包、签名、上架知识变成 AI 能读懂、能执行、能验证的能力，让 AI 理解用户需求后，规划出一条**合法合规的交付链路**，把已经开发好的产品送达每一个生态。

## 它解决什么问题

"一次开发、各生态安装包自动产出"之所以难，不是因为没人想做，而是各生态官方用**代码签名 + 官方工具链 + 官方账号**把这条路锁死了：

| 生态 | 产出安装包的硬约束 |
|---|---|
| 苹果（macOS/iOS） | 签名与公证只能在 **macOS + Xcode + Apple 开发者账号**上完成 |
| Windows | 代码签名需要 **Windows 代码签名证书** |
| 鸿蒙 | 需要 **华为 DevEco 工具链 + AGC 签名** |
| Linux（deb/rpm/AppImage） | 唯一能在一台机器上多目标产出，无强制签名门槛 |

所以 DeliverKit **不假装一台机器产出全生态**——它懂得"每个安装包该在哪、用什么合法方式产出、怎么验证它真的能装能跑"，并指挥 AI 在正确的环境（本地 / CI 对应平台 runner / 云构建）里完成。这就绕开了各生态的硬约束，而不是去翻墙。

## 当前能力（v0.1.0 · 契约层 + Linux 三目标实验闭环）

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

## 接入

### 交付百科（第一阶段公开预览）

仓库新增了可直接部署的静态百科站点：[site/index.html](site/index.html)。它把生态知识包、个人签名材料获取路径、CI secret 注入边界和真实验证证据整理成面向开发者与 Agent 的公开入口。

```bash
npx serve site
```

站点不包含任何账号、证书或私钥；邮箱发布名单目前只写入浏览器本地存储，正式宣发接入订阅服务前不会上传数据。部署与内容边界见 [site/README.md](site/README.md)。

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
deliverkit inspect .                   # 识别项目与交付目标建议
deliverkit plan . --goals deb,rpm      # 生成 Forge.md 交付契约
deliverkit pack-deb . --plan Forge.md  # 构建并验证 deb（需要 Docker）
deliverkit pack-rpm . --plan Forge.md  # 构建并验证 rpm（需要 Docker）
deliverkit pack-appimage . --plan Forge.md  # 构建并验证 AppImage（需要 Docker）
deliverkit generate-ci-workflow . --plan Forge.md  # 生成 Linux/Windows GitHub Actions 工作流
deliverkit pack-windows-msi . --plan Forge.md  # 仅 Windows runner 可执行，要求签名 secrets
deliverkit pack-macos . --plan Forge.md  # 仅 macOS runner 可执行，按 Forge.md 构建 DMG/PKG
deliverkit pack-harmonyos . --plan Forge.md  # 仅 DevEco runner 可执行，要求 AGC secrets/设备
deliverkit generate-release-manifest . --plan Forge.md --results .deliverkit/results
```

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
