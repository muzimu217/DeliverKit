# Knowledge

生态知识包（Ecosystem Knowledge Packs）是 DeliverKit 的"给 AI 用"知识层。
Agent 通过 MCP 工具 `get_ecosystem_knowledge` 显式读取某个生态的产物形态、
工具链、签名硬约束、上架规则与验证方法。

## 活跃的知识层

- `ecosystems/*.yaml` — 每个文件描述一个生态。结构由 `ecosystem-schema.ts`
  （zod schema，单一事实源）定义，`ecosystem-loader.ts` 负责加载与校验。
- `ecosystem-schema.ts` — 知识包 schema + JSON Schema 导出。
- `ecosystem-loader.ts` — list / load / 校验，校验失败返回可行动错误。

当前已注册生态：`linux/ubuntu`、`mobile/harmonyos`。

## 新增生态

在 `ecosystems/` 下新增一个符合 `ecosystem-schema.ts` 的 YAML 文件即可注册，
无需改代码。校验失败会通过 `get_ecosystem_knowledge` 返回可行动错误。

## 迁移中的参考数据

以下文件是从 ForgeKit 迁移而来的早期参考数据，逐步被 `ecosystems/*.yaml` 取代，
不参与 MCP 输出：

- `decisions.yaml` — 跨平台选型想法。
- `deb-packaging.yaml` — Debian/Ubuntu 打包笔记（已迁移进 `ecosystems/linux-ubuntu.yaml`）。
- `mobile/harmonyos-packaging.yaml` — 鸿蒙打包笔记（已迁移进 `ecosystems/harmonyos.yaml`）。
