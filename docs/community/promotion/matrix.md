# 宣传矩阵总表

> 核心思路（参考成熟开源项目与 MCP 生态的实际打法）：**先「上架」，再「发声」，后「长尾」**。
> 目录分发（awesome 列表 / MCP registry / Smithery / Glama）带来的是持续的自然流量，社区发帖带来的是脉冲流量，站点 + 长文带来的是搜索长尾。三者缺一不可。

## 一、对标体系：别人是怎么宣传的

### MCP 服务器类项目的主流路径

| 打法 | 事实依据 | 对 DeliverKit 的启示 |
|---|---|---|
| 收录进 awesome-mcp-servers（punkpeye，80k+ star）是 MCP 项目冷启动第一站 | 其 CONTRIBUTING 明确接受 PR 收录，条目格式 `- [Name](link) — Description` | 提交一个高质量 PR（材料见 `submissions/awesome-mcp-servers.md`） |
| 发布到官方 MCP Registry（registry.modelcontextprotocol.io） | 官方 registry 是规范源头，PulseMCP 等第三方目录会**自动同步**官方 registry 的发布 | 发布一次，多处收录，性价比最高（前提：安装方式公开 = npm 包已发布） |
| 上架 Smithery（17k+ servers）与 Glama（76k+ servers） | 二者是开发者发现 MCP server 的默认入口，带安全/维护/文档评分 | 评分与 README 质量、发布节奏直接挂钩，先完善再上架 |
| mcp.so（20k+ servers） | 通过其仓库提 GitHub issue 收录 | 低成本，顺手做 |
| r/mcp、Show HN、X 是英文圈脉冲流量源 | MCP 工具类项目（如各类 MCP server 作者）普遍靠 r/mcp 首发 + X thread 扩散 | 需要账号；文案已备好（`copy/`），发布时间选美东上午 |

### 经典开源项目的通用节奏（esbuild / ruff / biome 这类工具型项目）

1. **仓库即门面**：README 首屏讲清 problem → solution → 三行内跑起来；badge（CI / license / npm / stars）是信任信号。
2. **Show HN 首发**：标题克制、正文第一人称讲 trade-off 和 limitation，社区反感营销腔。
3. **Release 即事件**：每个 GitHub Release 都是一次再曝光机会（Release 通知所有 watcher）。
4. ** Discussions + issue 模板**：把「用户不知道去哪提问」的摩擦降到零。
5. **star-history / OpenSauced**：增长曲线本身会成为二次传播素材。

### 中文圈路径（WorkBuddy 文案已覆盖腾讯频道，此处补齐）

- V2EX「分享创造」节点：中文开发者冷启动最有效的单点。
- 掘金 / 知乎长文：搜索长尾（「跨平台打包」「鸿蒙 上架」等关键词）。
- OSCHINA / Gitee 镜像与资讯投稿：中文圈目录分发。

## 二、渠道矩阵

| # | 渠道 | 受众 | 资产 | 动作 | 时机 | 状态 |
|---|---|---|---|---|---|---|
| 1 | GitHub 仓库门面 | 全部 | topics、badge、README | 已加 topics、开启 Discussions；badge 见 gates.md | T0 | ✅ 部分（badge 待 push） |
| 2 | GitHub Release v0.1.0 | 全部 | release notes | `gh release create` | T0 | ✅ 已建 |
| 3 | awesome-mcp-servers | MCP 开发者 | 提交条目 + PR | fork → PR（材料已备） | T0 | ⏸ 待 gates 通过 |
| 4 | 官方 MCP Registry | MCP 生态 | publisher CLI 发布 | 安装方式公开后发布 | T0 | ⏸ 依赖 npm publish |
| 5 | Smithery / Glama | MCP 用户 | smithery.yaml / 提交表单 | 上架 | T0 | ⏸ 待 gates 通过 |
| 6 | mcp.so | MCP 用户 | GitHub issue | 提 issue 收录 | T0 | ⏸ 待 gates 通过 |
| 7 | Show HN | 英文极客 | `copy/en-showhn.md` | 发帖 + 当天回评论 | T+1 上午（美东） | ⏸ 需账号 |
| 8 | r/mcp | MCP 社区 | `copy/en-reddit-r-mcp.md` | 发帖 + 回评论 | T+1 | ⏸ 需账号 |
| 9 | X / Twitter | 英文 AI 圈 | `copy/en-x-thread.md` | 串推 + 配图 | T+2 | ⏸ 需账号 |
| 10 | V2EX 分享创造 | 中文开发者 | `copy/zh-v2ex.md` | 发帖 | T+1w | ⏸ 需账号 |
| 11 | 掘金 / 知乎 | 中文长尾 | `copy/zh-juejin-zhihu.md` | 长文 | T+1w | ⏸ 需账号 |
| 12 | WorkBuddy 腾讯频道 | WorkBuddy 用户 | `docs/community/post-deliverkit-intro.md` | 已定稿（2026-08-17） | 已发布窗口 | ✅ 文案就绪 |
| 13 | 交付百科站点 | 搜索长尾 | site/（GitHub Pages 在线） | 接入匿名统计（见 metrics.md） | T0 | ⏸ 待接统计 |

## 三、发布节奏

- **T0（gates 全部通过当天）**：渠道 1–6 一次性完成。目录收录是纯增量动作，不需要「攒热度」。
- **T+1**：Show HN 与 r/mcp **错开发**（同一天两个高热社区容易被判自我营销）；Show HN 选美东上午（北京时间晚上）。
- **T+2~3**：X 串推，引用目录收录与首批反馈作社交证明。
- **T+1 周**：中文圈（V2EX → 掘金/知乎），此时已有英文圈反馈可引用，转化更好。
- **持续**：每周一 `metrics/` 流量快照复盘；每个 feature release 触发渠道 2 再曝光；Discussions 有问必答（24h 内）。

## 四、铁律

1. **gates.md 未通过前，不发任何对外渠道**——README 里 `npx -y deliverkit-mcp` 必须真实可用，否则所有流量落地即流失。
2. **文案与事实一致**：Linux deb/rpm/AppImage 已有 e2e + CI 验证闭环；Windows / macOS / 鸿蒙是「契约先行实现，签名/公证门槛待对应 CI 验证」。所有文案不得宣称「全生态已验证」。
3. **每个渠道链接带来源区分**（见 metrics.md 的链接规约），否则流量归因失效。
