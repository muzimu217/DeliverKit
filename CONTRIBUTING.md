# 参与 DeliverKit

DeliverKit 是「给 Agent 用的交付大脑」。它的价值不在于代码量，而在于**知识是否正确、验证是否真实**。因此贡献的门槛不高，但对「诚实」的要求很高：不能宣称未验证的能力。

## 两条不可协商的铁律

任何 PR 都必须符合：

1. **计划先行（Plan-before-build）**：构建类工具没有 `Forge.md` 契约就必须拒绝执行。
2. **真实验证（Real verification）**：不能只看退出码。产物必须在干净环境里装得上、跑得起来（签名类还要验签名有效）。

## 本地开发

```bash
npm install
npm run verify     # lint + typecheck + build + 单测 + 编译产物冒烟，提交前必须全绿
npm test           # 只跑单测
npm run test:e2e:linux   # Linux 三目标端到端（需要 Docker，耗时较长）
```

`deliverkit doctor` 可以先确认本机能跑哪些目标的测试。

## 新增一个生态知识包

生态知识是这个项目的核心资产，需要有据可依。

1. 在 `src/knowledge/ecosystems/` 新建 YAML，遵循 `src/knowledge/ecosystem-schema.ts` 的 schema。
2. 每条签名、分发、验证规则都要能对应到**官方文档**（PR 里贴链接）。不确定的规则宁可不写，也不要猜。
3. 在 `tests/unit/knowledge/` 补校验用例。
4. 明确写清该生态的硬约束：产出必须在什么平台、需要什么账号或证书。**不要暗示能在任意机器上产出**。

## 新增一个 pack_* 工具

1. 先在生态知识包里写清规则，再写工具。
2. 工具必须先加载 `Forge.md` 契约并校验目标生态与产物类型（参考 `src/capabilities/pack-deb.ts`）。
3. 前置检查（preflight）要在长耗时操作之前完成，并区分具体原因：工具链缺失、守护进程未启动、权限不足、平台不匹配各有不同的修复动作（参考 `src/capabilities/utils/docker.ts`）。
4. 失败必须返回可行动信息：`code` + `summary` + `suggested_fix` + `log_excerpt`（日志尾部片段）+ `next_actions`。只给日志路径不算合格。
5. 成功必须带验证证据：`verified_checks` 写明实际执行了哪些验证动作。
6. 在 `src/mcp-server/tools/registry.ts` 与 `schemas.ts` 注册，并在 `tests/unit/capabilities/` 补用例（成功路径、契约缺失、工具链缺失、构建失败四类至少各一）。

## 提交规范

- 提交信息用中文或英文均可，格式 `type: 简述`（`feat` / `fix` / `docs` / `chore` / `test` / `ci`）。
- 一个 PR 只做一件事。文档改动与功能改动分开提。
- 描述里写清：改了什么、怎么验证的、还有什么没验证。**没验证的部分要主动说明**，这比声称全部通过更有价值。

## 报告问题

- Bug：请附 `deliverkit doctor` 输出、完整命令、错误结果里的 `log_excerpt`。
- 生态支持请求：请说明目标生态、产物类型，以及你能提供的官方文档链接。
- 安全问题：见 [SECURITY.md](SECURITY.md)，不要开公开 issue。
