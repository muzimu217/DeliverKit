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

## 当前能力（v0.1.0 · 契约层雏形）

DeliverKit 通过 MCP（stdio）暴露两个规划类工具：

- **`inspect_project`** —— 识别项目语言、入口与已有打包配置，给出跨生态交付目标建议。
- **`generate_packaging_plan`** —— 生成一份可评审的 `Forge.md` 交付契约（目标生态 / 产物 / 决策依据 / 风险）。

后续阶段会接入构建类工具（`pack_deb` / `pack_rpm` / `pack_windows` / `pack_apple` / `pack_harmonyos`），它们都遵守两条铁律：

1. **计划先行**（Plan-before-build）：无 `Forge.md` 契约不构建。
2. **真实验证**（Real verification）：不只看退出码，要验证产物装得上、跑得起来、签名有效。

## 接入

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
```

## 路线图

见 [docs/ROADMAP.md](docs/ROADMAP.md)。简要：

- **A** — 契约层 + 生态知识包 schema（当前）
- **B** — Linux 多发行版可验证交付（deb/rpm/AppImage）
- **C** — 编排层 + CI 矩阵，打通 Windows
- **D** — 苹果生态（签名 + 公证）
- **E** — 鸿蒙正式化 + 统一交付报告

## 起源

DeliverKit 的 MCP 协议层与"计划先行 / 真实验证"两条铁律继承自 [ForgeKit](https://github.com/CDUESTC-OpenAtom-Open-Source-Club/ForgeKit)（一个专注 Docker 构建诊断的项目）。两者定位不同、各自独立演进：ForgeKit 往窄里做诊断，DeliverKit 往宽里做多生态交付。

## License

MIT
