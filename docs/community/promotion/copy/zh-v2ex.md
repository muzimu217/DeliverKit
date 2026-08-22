# V2EX「分享创造」发帖成稿

> 前置：gates.md 通过后发布（T+1 周）。节点选「分享创造」。
> V2EX 风格：口语、克制、少 emoji、多讲踩坑细节；准备好被问「和 XX 有什么区别」。

## 标题

```
分享一个给 AI 用的「交付大脑」：让 Agent 懂各生态打包签名规则，真实验证后再交付
```

## 正文

```
背景：每次开发完一个产品，最后一步永远是噩梦——把它变成各平台的安装包。苹果要 macOS 上签名+公证，Windows 要代码签名证书，鸿蒙要华为 DevEco 工具链，每个生态的坑都不一样，查资料踩坑几周就没了。

我做的这个 DeliverKit（MIT 开源）思路是：别指望一台机器产出全生态安装包，而是把这些生态的打包、签名、验证规则做成 AI 能读懂、能执行、能验证的知识包，让 Agent 规划出一条合法合规的交付链路，在正确的环境（本地 / CI 对应平台 runner）里完成。

两条铁律：
1. 计划先行：没有 Forge.md 交付契约就不构建，契约里写清楚目标生态、产物、决策依据、风险；
2. 真实验证：不看退出码，要在干净容器里真的装上、跑起来才算过。

目前进展说实话：Linux 三件套（deb/rpm/AppImage）已经用 Flask / TypeScript / Go 三个真实项目跑通端到端，CI 也绿；Windows MSI、macOS DMG/PKG、鸿蒙 HAP 是实现完了但签名/公证门槛还要对应 runner 上的 CI 验证，不吹。

MCP 协议接入（stdio），Claude 或任意 MCP 客户端可用：
npx -y deliverkit-mcp

仓库：https://github.com/muzimu217/DeliverKit
交付百科（在线站点）：https://muzimu217.github.io/DeliverKit/

欢迎拍砖，特别是踩过跨平台打包坑的朋友，想知道你们的场景里最痛的是哪一步。
```

## 预期问题预案

| 问题 | 口径 |
|---|---|
| 和 electron-builder / jpackage 区别 | 那些是单生态构建器；这是给 Agent 的规划+验证层，覆盖鸿蒙，产物带验证证据 |
| 为什么不直接给 ChatGPT/Claude 写 prompt | 生态规则是结构化 YAML 知识包，可评审可版本化；长尾规则塞 prompt 里既易错又没法验证 |
| 鸿蒙也有人用？ | 国内上架刚需；知识包 schema 与其他生态同构 |
| npm 包安全吗 | MIT、files 白名单只含 dist/src/packaging、无遥测无外传（代码可查） |
