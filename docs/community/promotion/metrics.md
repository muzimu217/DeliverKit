# 真实用户数据采集方案

> 回答一个直接的问题：**截至 2026-08-22，DeliverKit 没有任何用户数据采集**——代码无遥测（src/、site/ 全文检索无任何 analytics 埋点），站点邮箱名单只写浏览器 localStorage（README 已声明该边界），GitHub Insights 是唯一数据源且只回溯 14 天。
> 以下方案分三层，原则：**先零成本自动化，再匿名统计，最后才考虑产品内 opt-in 遥测**（开源工具默认遥测是信任红线，不做）。

## 第 0 层 · 当日基线快照（2026-08-22，来源 GitHub API）

| 指标 | 值 |
|---|---|
| Stars / Watchers / Forks | 0 / 0 / 0 |
| Issues / PRs | 0 / 0 |
| 14 天浏览 | 24 次 / 2 独立访客（8-17 站点上线日 21 次，其后每天 ≤1） |
| 14 天 clone | 22 次 / 12 独立（多为 CI 与本机） |
| Referrer | 仅 github.com |
| 热门路径 | /wiki（12 次）> / Overview（3 次） |
| GitHub Pages 站点 | HTTP 200 在线 |
| npm | `deliverkit` 不存在（404） |
| Releases / Topics / Discussions | 无 / 无（现已补） / 关闭（现已开启） |

**解读**：项目处于「零外部触达」状态，任何渠道动作的效果都可以从这份基线干净地归因。

## 第 1 层 · 零成本自动化（已上线，无需账号）

### GitHub 流量周快照

`.github/workflows/metrics-snapshot.yml`：每周一 09:00（UTC）自动把 views / clones / referrers / paths / stars / forks 快照进 `metrics/` 目录提交。**GitHub Insights 只保留 14 天，快照让数据可长期留存**——这是「有没有真实用户」的原始证据链。

```bash
gh workflow run metrics-snapshot.yml -R muzimu217/DeliverKit   # 手动补一次快照
ls metrics/                                                      # 每周一个 JSON
```

### npm 下载量（Gate 2 发布后自动可用）

```bash
curl -s https://api.npmjs.org/downloads/point/last-week/deliverkit | jq .downloads
```

不依赖任何账号，写进每周复盘即可。

## 第 2 层 · 站点匿名统计（需要一次账号决策）

GitHub Pages 是纯静态站，目前**测不到任何访问**。推荐接入 [GoatCounter](https://www.goatcounter.com)（开源、免费、无 cookie、不采集个人信息）或 Plausible：

- 只需在 `site/index.html` 加一行 `<script>`（用户注册后提供 code）；
- 与 README 已承诺的隐私边界一致：**邮箱名单在接入订阅服务前不上传任何数据**；
- 待用户选定服务商后实施，10 分钟工作量。

## 第 3 层 · 产品内 opt-in 遥测（后续代码优化项，不在本轮实施）

如果要回答「哪个 pack 工具被用得最多、Forge.md 生成成功率」，唯一合规做法是 **opt-in 匿名计数**：默认关闭，`DELIVERKIT_TELEMETRY=1` 或 CLI 显式开关开启，只上报工具名 + 成败 + 版本号，不含路径/项目信息。此项列入代码层 UX 优化 backlog，需用户拍板后再做。

## 链接规约（渠道归因）

无自有统计端时，用**每渠道独立入口链接**归因：

| 渠道 | 对外链接 |
|---|---|
| 英文社区（HN / Reddit / X） | `https://github.com/muzimu217/DeliverKit`（GitHub referrers 可见 reddit.com / news.ycombinator.com / x.com 来源） |
| 中文社区（V2EX / 掘金 / 知乎） | 同上（referrer 区分 v2ex.com / juejin.cn / zhihu.com） |
| 站点导流 | `https://muzimu217.github.io/DeliverKit/`（接入第 2 层后带 utm） |

每周复盘 referrer 榜 = 渠道归因表，配合 npm 周下载与 star 增量即可判断各渠道质量。

## 每周一指标看板（metrics-snapshot 数据出来后照此复盘）

| 指标 | 健康线（首月） | 行动触发 |
|---|---|---|
| 周独立访客 | ≥20 | <10 → 渠道文案复盘 |
| Stars | 周 ≥5 | 两周 0 增长 → 重发长文/换渠道 |
| npm 周下载 | ≥10 | >50 → 加速 Roadmap C/D 验证 |
| Discussions/Issue 响应 | ≤24h | 必守（信任资产） |
| wiki / site 占比 | 上升 | 站点是转化入口，占比跌 → 改 site 首屏 |
