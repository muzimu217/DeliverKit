# T+1 发帖工具包（2026-09-11 发布日实况版）

> 用途：社区渠道发帖时**直接复制**。所有链接为发布日真实状态，发帖前如已变化（如 PR 合并），按最新事实微调。
> 口径红线不变：Linux deb/rpm/AppImage = VERIFIED（e2e+CI）；Windows/macOS/HarmonyOS = CONTRACT-FIRST；不宣称全生态已验证；star 不是成功指标。

## 当日事实卡（发帖引用）

- **安装**：`npx -y deliverkit-mcp`（[npm 包](https://www.npmjs.com/package/deliverkit-mcp)，MIT，v0.3.1）
- **官方 MCP Registry**：已收录 [io.github.muzimu217/DeliverKit](https://registry.modelcontextprotocol.io)（status: active）
- **GitHub**：[muzimu217/DeliverKit](https://github.com/muzimu217/DeliverKit)（CI 绿：Node 18/20/22 + Ubuntu 22.04/24.04 真实 Docker 打包矩阵）
- **Release**：[v0.3.1](https://github.com/muzimu217/DeliverKit/releases/tag/v0.3.1) / [v0.3.0](https://github.com/muzimu217/DeliverKit/releases/tag/v0.3.0)
- **站点**：https://muzimu217.github.io/DeliverKit/
- **30 秒首验**（发帖可附）：
  ```bash
  npx -y --package=deliverkit-mcp -- deliverkit doctor
  npx -y --package=deliverkit-mcp -- deliverkit plan . --goals deb
  ```

## 渠道 × 素材 × 状态

| 渠道 | 成稿 | 状态 | 发布动作 |
|---|---|---|---|
| Show HN | [copy/en-showhn.md](copy/en-showhn.md) | ⏸ 需 HN 账号 | 美东上午发，当天回评论；标题用成稿首行 |
| r/mcp | [copy/en-reddit-r-mcp.md](copy/en-reddit-r-mcp.md) | ⏸ 需 Reddit 账号 | 与 Show HN 错开 ≥12h |
| X 串推 | [copy/en-x-thread.md](copy/en-x-thread.md) | ⏸ 需 X 账号 | T+2~3，引用目录收录与首批反馈 |
| V2EX 分享创造 | [copy/zh-v2ex.md](copy/zh-v2ex.md) | ⏸ 需 V2EX 账号 | T+1 周（有英文反馈后转化更好） |
| 掘金/知乎 | [copy/zh-juejin-zhihu.md](copy/zh-juejin-zhihu.md) | ⏸ 需账号 | T+1 周 |
| awesome-mcp-servers | — | 🟡 [PR #14195](https://github.com/punkpeye/awesome-mcp-servers/pull/14195) 待审 | 合并后在其他帖引用 |
| mcp.so | — | 🟡 [issue #4070](https://github.com/chatmcp/mcpso/issues/4070) 待收录 | 同上 |
| Smithery / Glama | — | ⏸ 待自动同步或门户提交 | Glama 通常自动抓取 GitHub；Smithery 需注册 |

## 发帖后的回填纪律

每渠道发布后 24h 内：matrix.md 对应行改 ✅ 并附 URL；下周一指标快照观察来源变化（popular_referrers）。
