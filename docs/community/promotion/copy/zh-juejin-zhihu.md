# 掘金 / 知乎长文成稿

> 前置：gates.md 通过后发布（T+1 周，V2EX 之后）。
> 掘金发「开源」标签；知乎答「如何把一个软件打包发布到多个平台？」类问题并附本文。
> 与 WorkBuddy 腾讯频道版（docs/community/post-deliverkit-intro.md）素材同源，但去掉了频道活动内容、补足技术细节。

## 标题（掘金版）

```
我开源了一个「AI 交付大脑」：把 Linux/Windows/macOS/鸿蒙的打包签名知识喂给 Agent
```

## 正文

```markdown
## 一个所有人都撞过的墙

产品开发完了，然后呢？要变成各平台的安装包：

- 苹果：签名与公证只能在 macOS + Xcode + Apple 开发者账号上完成
- Windows：代码签名需要证书（没有证书 SmartScreen 直接拦）
- 鸿蒙：需要华为 DevEco 工具链 + AGC 签名
- Linux：deb / rpm / AppImage 规则各不相同，但门槛最低

这些不是技术难度问题，是**生态用签名 + 官方工具链 + 官方账号把路锁死了**。让 AI「帮忙打包」，它会在错误的平台上用错误的方式自信地给你生成一堆装不上的东西——因为规则是长尾知识，模型只能靠猜。

## DeliverKit 的解法：别绕墙，让 AI 懂墙在哪

[DeliverKit](https://github.com/muzimu217/DeliverKit)（MIT 开源）是一个 MCP 工具，把这些生态的打包、签名、上架知识变成 AI 能读懂、能执行、能验证的能力。它不假装一台机器产出全生态，而是规划出合法合规的交付链路，指挥 AI 在正确的环境（本地 / CI 对应平台 runner / 云构建）里完成。

两条铁律贯穿所有工具：

**1. 计划先行（Plan-before-build）**：`inspect_project` 识别项目，`generate_packaging_plan` 生成可评审的 `Forge.md` 交付契约——目标生态、产物、决策依据、风险全部写明。没有契约，构建工具直接拒绝执行。

**2. 真实验证（Real verification）**：`pack_deb` 在隔离 Ubuntu 容器构建，然后在**全新的容器里安装并运行**；AppImage 要 extract-and-run 验证。退出码不是证据，「装得上、跑得起」才是。

## 怎么接

MCP（stdio）方式，Claude / 任意 MCP 客户端：

​```json
{
  "mcpServers": {
    "deliverkit": { "command": "npx", "args": ["-y", "deliverkit-mcp"] }
  }
}
​```

然后一句「帮我把这个项目交付到 deb 和 rpm」，Agent 会先生成 Forge.md 契约让你评审，再调 pack_deb / pack_rpm 构建并验证。

## 目前的真实状态（不吹）

- ✅ Linux deb / rpm / AppImage：三个真实项目（Flask / TypeScript / Go 标准库）端到端跑通，CI 绿
- 🔶 Windows MSI（WiX + Authenticode）、macOS（DMG/PKG + 公证）、鸿蒙（HAP）：实现完成，签名/公证门槛待对应 CI 验证
- ✅ `generate_ci_workflow`：生成 GitHub Actions 多平台矩阵，证书只走 secrets
- ✅ `generate_release_manifest`：汇总各平台 SHA256 与验证证据的统一 ReleaseManifest.json

配套的「交付百科」站点在线：muzimu217.github.io/DeliverKit，把各生态签名材料获取路径、CI secret 边界整理成了公开文档。

## 为什么做成 MCP 而不是一个 CLI 包工

打包交付正好是那种「上下文极重、规则极碎、出错极贵」的领域——Agent 最不擅长即兴发挥、最擅长执行结构化知识的领域。生态规则放在可评审的 YAML 知识包里版本化管理，而不是埋在 prompt 里，这是我能想到的最诚实的做法。

仓库：https://github.com/muzimu217/DeliverKit（star ⭐ 是持续更新的燃料）
```

## 平台差异

- **知乎**：不发专栏原文，去找「跨平台打包」「软件签名公证」「鸿蒙应用上架」等高关注问题，写 300 字干货回答 + 文末附仓库链接，引流效果远好于发专栏。
- **掘金**：配 `deliverkit-hero.png` 封面，打「开源」「AI」「前端工程化/工程效率」标签。
