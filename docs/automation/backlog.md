# 自迭代 Backlog（任务队列）

> BabyAGI 式优先级队列：每项带来源与优先级；完成即移除，新发现即入队。
> 决策理由写在当日选择的条目下方，一行即可。

## 队列（P0 > P1 > P2）

- **P0** [渠道] awesome-mcp-servers PR #14195：维护者要求 Glama 认领 + 质量分——已完成认领（评 A），待其复审；有新评论则评估回复草稿入 outbox/。（来源：channel-feedback-2026-10-05）
- **P0** [渠道] mcp.so 收录 issue #4070 无响应超 3 周：备选动作＝关闭重提或经 PulseMCP（自动同步官方 Registry）补收录。（来源：channel-feedback）
- **P0** [渠道] mcp-marketplace.io：已上架（claimed）；安全扫描 findings 已修复（js-yaml 5.5.0 / flask 固件 3.1.3 / readPackageJson 窄化）；**待推送 GitHub 后请求重扫**（无公开 rescan 入口，走 dashboard/support）；eslint 项为已撤回公告（平台数据问题，重扫后应消失或向平台反馈）。（来源：2026-10-18 用户核验 + 扫描报告）
- **P1** [测试] 仍无直接单测：`capabilities/forge-renderer.ts`、`capabilities/plan-decision-engine.ts`（有测但分支覆盖可加深）、`cli/render.ts`、`cli/doctor.ts`、`mcp-server/tools/registry.ts`、`mcp-server/tools/schemas.ts`。（来源：2026-10-05 src/tests 对照）
- **P1** [文档] ROADMAP 阶段 C/D/E 门槛均为「缺真实 runner 实证」：整理一份《如何用 GitHub Actions secrets 完成 Windows MSI 签名实证》的 runner 指南，供用户解锁门槛。（来源：ROADMAP 阶段 C）
- **P1** [功能] 一键安装脚本生成（curl -sL URL | sh；参考 goreleaser 用户求整合的 godownloader）。（来源：docs/user-needs.md #2）
- **P1** [场景] apt/yum 仓库托管设计与骨架（repo init/publish；关联 nfpm .changes 需求）——受众大一个量级的重定位评估。（来源：docs/user-needs.md #3）
- **P2** [e2e] ROADMAP 注明「跨主机复核建议继续」：本机有 Docker 时跑一次 `npm run test:e2e:linux` 并回填证据。（来源：ROADMAP 阶段 B）
- **P2** [站点] P1 阶段遗留：邮件/社区订阅接入、隐私政策、统一域名——均需用户决策，先不动。（来源：ROADMAP 阶段 P1）

## 决策日志

- 2026-10-05：框架落地日（SELF-ITERATION.md + 本队列 + 推广 playbook）；当日迭代＝测试覆盖批次 1（utils 5 模块 + get_ecosystem_knowledge）。
- 2026-10-18：用户在线授权解锁闸门（gitignore 四行）并选定「需求调研→落地」方向；当日迭代＝pack_deb systemd 服务安装（需求来源：fpm/nfpm/goreleaser 高赞痛点扫描，映射见 docs/user-needs.md）；新增 P1 三项（rpm systemd、一键安装脚本、仓库托管）。
- 2026-10-18（第二次运行）：迭代点＝P1「pack_rpm systemd 对称支持」——完成 #1 用户痛点的 deb+rpm 全覆盖；完成后该项从队列移除。
- 2026-10-18（渠道+修复）：mcp-marketplace.io 上架核验 + AI 代理检索实测（其 MCP 端 search_servers 可检索到）；响应安全扫描（4.6/10，10 findings）完成依赖与质量修复；npm audit 9→1（余 1 条 dev-only vite，受 npm 解析器 bug 阻塞，运行时 `--omit=dev` 为 0）；已发布包 npx 握手 + tarball/compiled 双冒烟全过。
- 2026-10-18：用户在线授权解锁闸门（gitignore 四行）并选定「需求调研→落地」方向；当日迭代＝pack_deb systemd 服务安装（需求来源：fpm/nfpm/goreleaser 高赞痛点扫描，映射见 docs/user-needs.md）；新增 P1 三项（rpm systemd、一键安装脚本、仓库托管）。
