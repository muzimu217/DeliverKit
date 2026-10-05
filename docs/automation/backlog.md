# 自迭代 Backlog（任务队列）

> BabyAGI 式优先级队列：每项带来源与优先级；完成即移除，新发现即入队。
> 决策理由写在当日选择的条目下方，一行即可。

## 队列（P0 > P1 > P2）

- **P0** [渠道] awesome-mcp-servers PR #14195：维护者要求 Glama 认领 + 质量分——已完成认领（评 A），待其复审；有新评论则评估回复草稿入 outbox/。（来源：channel-feedback-2026-10-05）
- **P0** [渠道] mcp.so 收录 issue #4070 无响应超 3 周：备选动作＝关闭重提或经 PulseMCP（自动同步官方 Registry）补收录。（来源：channel-feedback）
- **P1** [测试] 仍无直接单测：`capabilities/forge-renderer.ts`、`capabilities/plan-decision-engine.ts`（有测但分支覆盖可加深）、`cli/render.ts`、`cli/doctor.ts`、`mcp-server/tools/registry.ts`、`mcp-server/tools/schemas.ts`。（来源：2026-10-05 src/tests 对照）
- **P1** [文档] ROADMAP 阶段 C/D/E 门槛均为「缺真实 runner 实证」：整理一份《如何用 GitHub Actions secrets 完成 Windows MSI 签名实证》的 runner 指南，供用户解锁门槛。（来源：ROADMAP 阶段 C）
- **P2** [e2e] ROADMAP 注明「跨主机复核建议继续」：本机有 Docker 时跑一次 `npm run test:e2e:linux` 并回填证据。（来源：ROADMAP 阶段 B）
- **P2** [站点] P1 阶段遗留：邮件/社区订阅接入、隐私政策、统一域名——均需用户决策，先不动。（来源：ROADMAP 阶段 P1）

## 决策日志

- 2026-10-05：框架落地日（SELF-ITERATION.md + 本队列 + 推广 playbook）；当日迭代＝测试覆盖批次 1（utils 5 模块 + get_ecosystem_knowledge）。
