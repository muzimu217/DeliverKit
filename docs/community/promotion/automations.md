# 本地监督定时任务定义

本地 workspace 定时任务一个会话只能创建一个。当前状态（2026-09-05）：

| 任务 | 计划 | 状态 |
|---|---|---|
| 推广指标与快照健康检查 | 每周一 09:00 | ✅ 已创建（automation-4fcbc9f7） |
| 发布门禁与目录状态审计 | 每周二 09:30 | ❌ 待新会话创建 |
| 社区响应与北极星进度监督 | 每个工作日 09:30 | ❌ 待新会话创建 |

GitHub 侧 `promotion-supervision.yml`（周一至周五自动）已覆盖后两项的职能；本地任务是增强版（可创建 issue、可交互）。

## 补建方法

每开一个**新聊天**，粘贴下面对应的一段即可创建一个任务（一个会话一个）。

### 任务 2：每周二 09:30 发布门禁与目录状态审计

> 请创建一个定时任务：每周二 09:30 运行，标题「每周二 09:30 DeliverKit 发布门禁与目录状态审计」。任务内容：只做审计与报告，绝不代替我执行 npm publish 或任何外部发布。仓库 /Users/blackevil/Projects/DeliverKit（GitHub muzimu217/DeliverKit，npm 包 deliverkit-mcp）。步骤：1) git fetch origin 比对本地与远端 main，不一致只报告不 push；2) 检查发布门禁：npm view deliverkit-mcp version（404 = npm 未发布，标记 BLOCKED）、npm run release:check、npm run test:tarball、gh run list 检查 test/release-check/deploy-pages 是否绿色；3) 对照 docs/community/promotion/matrix.md 报告各渠道 BLOCKED/READY，npm 公开前外部目录提交保持 BLOCKED；4) 输出 READY/BLOCKED 逐项结论与证据，失败项用 gh issue create（标签 release-gate）建维护 issue；5) 中文摘要列出阻断原因和用户需要执行的命令。缺凭据时明确说明，不假装发布成功，数据缺失记 UNKNOWN 不归零。

### 任务 3：每个工作日 09:30 社区响应与北极星进度监督

> 请创建一个定时任务：每个工作日 09:30 运行，标题「每个工作日 09:30 DeliverKit 社区响应与北极星进度监督」。任务内容：只做监督、报告与提醒，不做任何发布。仓库 /Users/blackevil/Projects/DeliverKit（GitHub muzimu217/DeliverKit）。步骤：1) gh issue list / gh api 检查新 issue、Discussion、PR：超过 24 小时无回复的列入待办并给出链接；2) 检查 docs/community/promotion/success-cases.md 是否有新增真实成功案例，对照北极星目标（到 2026-09-22 达成 10 例）报告进度；3) 检查 Discussions 里是否有用户贴出产物或 ReleaseManifest 的成功反馈，提醒维护者记录进台账（须用户明确同意后才可对外宣传）；4) API 权限不足时明确报告缺什么，不静默跳过；5) 输出中文待办清单。数据缺失记 UNKNOWN 不归零。
