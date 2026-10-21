# DeliverKit 自迭代框架（SELF-ITERATION）

> 状态日期：2026-10-05。本文档是每日自动化（每天 12:00）的循环说明书。
> 借鉴市面上的自迭代项目，但不引入运行时框架——我们本身就是执行代理。

## 一、调研结论（2026-10-05，GitHub）

| 候选 | Stars | 核心循环 | 采纳结论 |
|---|---|---|---|
| [yoheinakajima/babyagi](https://github.com/yoheinakajima/babyagi) | 22.4k | 执行→创建任务→重排优先级，循环往复；任务队列持久化 | ✅ 采纳「任务队列循环」与优先级重排 |
| [SakanaAI/AI-Scientist](https://github.com/SakanaAI/AI-Scientist) | 14.7k | 想法生成→实验→写作→**自动评审门禁**，不过审不采纳 | ✅ 采纳「评审门禁」：验证链不过＝本次迭代无效 |
| [All-Hands-AI/OpenHands](https://github.com/All-Hands-AI/OpenHands) | 40k+ | 事件驱动的完整自主开发平台 | ❌ 不采纳：我们是代理本身，不需要再套平台 |
| [geekan/MetaGPT](https://github.com/geekan/MetaGPT) | 45k+ | 多角色软件公司模拟（PM/架构/工程师） | ❌ 不采纳：单代理日常迭代，多角色是开销不是收益 |

**结论：采纳模式，不采纳运行时。** DeliverKit 的自迭代 = BabyAGI 的任务队列 + AI-Scientist 的评审门禁 + 本仓库既有的安全栏与验证链。

## 二、五段循环（每日 12:00 自动化执行）

```
① 感知 → ② 决策 → ③ 执行 → ④ 验证 → ⑤ 评审
   │          │                          │
   └──────────┴── 回写状态文件 ←──────────┘
```

| 段 | 动作 | 产出 |
|---|---|---|
| ① 感知 | 读 metrics/ 快照与周报、npm 下载 API、GitHub API（stars/issues/PR）、渠道反馈状态 | `kpi-log.md` 追加一行 |
| ② 决策 | 读 `backlog.md` + ROADMAP + 近 20 条 git log，选 1 个小而完整、可独立验证的迭代点；无明确方向时优先测试覆盖/文档缺口 | backlog 更新（含决策理由） |
| ③ 执行 | automation/daily 分支小步提交 | commit(s) |
| ④ 验证 | typecheck → lint → test 全过；不过则修复或回滚 | 绿的验证链 |
| ⑤ 评审 | 3-6 行汇报；迭代受阻/过小时转产出 1 条渠道内容草稿 | 汇报 + 可选 outbox/ 草稿 |

## 三、状态文件（循环的记忆）

循环必须跨天有记忆，否则每天重新发明方向：

- `docs/automation/kpi-log.md` —— 每日一行 KPI（下载/star/渠道事件/一句话结论），趋势的原始账本。
- `docs/automation/backlog.md` —— 优先级任务队列（BabyAGI 式）：每项带来源（ROADMAP/KPI 观察/渠道反馈）与优先级，完成即移除，新发现即入队。
- `docs/community/promotion/outbox/` —— 内容草稿箱：自动化按 matrix.md 口径产出的可发布文案，由用户/代理取用发布。

## 四、安全栏（继承每日规则，不因框架改变）

1. `git status --porcelain` 非空 → 只报告不修改。
2. 禁止：push、发版本、改版本号、动 main 历史、删分支、碰 `.env`/密钥。
3. 全部提交在 `automation/daily` 分支；main 由用户合并。
4. 验证链（typecheck/lint/test）是评审门禁：门禁不过＝本次迭代无效，修不好就回滚。

## 五、环境备忘（无 node 的机器）

本机可能没有 node/npm：用 `/tmp/node-v20.18.0-darwin-arm64/bin`（存在则 export PATH；不存在则从 nodejs.org 下载 portable tarball 到 /tmp），绝不全局安装。网络检索优先外置搜索 MCP（searchix）与 web_reader，不消耗内置搜索配额。
