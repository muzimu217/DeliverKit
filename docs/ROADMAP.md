# DeliverKit 路线图

> 状态日期：2026-08-23
> 定位：给 AI（Agent）使用的「全生态交付大脑」

## 1. 定位

DeliverKit 把各生态的打包、签名、上架知识变成 AI 能读取、能执行、能验证的能力。AI 读了这些知识后，能理解用户需求 → 规划出一条**合法合规的交付链路** → 把用户已经开发好的产品，自动完善并打包进各个生态（Linux / Windows / 苹果 / 鸿蒙）的安装包。

DeliverKit 自己不假装一台机器能产出全生态——它懂得"每种安装包该在哪、用什么合法方式产出，并如何验证它真的能装、能跑"。

## 2. 核心认知：为什么不能「一台机器产全生态」

### 2.1 代码签名与公证

- **代码签名**：给安装包盖一个"数字身份章"，证明这个软件确实是某开发者做的、发布后没被篡改。操作系统靠这个章决定"要不要让用户安装、要不要弹安全警告"。这个章需要一把私钥 + 一张证书，证书通常要向官方或权威机构（CA）申请，往往要花钱、要实名。
- **公证（Notarization，苹果特有）**：光盖章还不够，苹果还要求把软件上传到苹果服务器过一遍安检，盖个"我审过了"的戳，用户电脑才肯痛快地装。

### 2.2 硬约束（绑死在特定系统上）

| 生态 | 硬约束 | 大白话 |
|---|---|---|
| 苹果 macOS/iOS | 签名 + 公证只能在装了 Xcode 的 macOS 上做，且必须有 Apple 开发者账号 | 苹果规定：给苹果软件盖章，只能用苹果电脑 + 苹果账号 |
| Windows | 打包可跨平台，但代码签名需要 Windows 证书，安装冒烟测试最好在 Windows 上做 | 建包可在别处，但"盖章 + 确认真能装"离不开 Windows |
| 鸿蒙 | 需要华为 DevEco 工具链 + AGC 签名 + 真机/云手机验证 | 用华为的工具、华为的账号签名，在华为设备上验证 |
| 各 Linux 发行版 | deb/rpm/AppImage 可在一台 Linux 机器上多目标产出，无强签名门槛 | 唯一"一台机器基本能全包"的生态 |

### 2.3 结论

"一个本地工具一键产出全生态可上架安装包"在技术和法律上都不成立。正确的解法不是翻墙硬产出，而是**把墙内的活派到墙内做**。这恰好和 DeliverKit 的定位一致：它不亲自翻墙，它懂得合法链路，指挥 AI 在每个生态各自合法的环境里产出。

## 3. 五层架构（把"知识/编排/验证"和"产出"解耦）

```
用户需求（自然语言） →  AI Agent  →  DeliverKit MCP
        │
   ① 知识层 Knowledge   —— 各生态打包/签名/上架规则（结构化，供 AI 阅读）
   ② 契约层 Contract    —— Forge.md 交付计划（目标生态 / 签名方式 / 验证方式）
   ③ 编排层 Orchestration—— 决定每个产物在哪产出：本地 Docker / CI 平台 runner / 云
   ④ 产出层 Build       —— 在"合法环境"里执行（Linux: 本地 / Win/mac: CI runner / 鸿蒙: 华为云）
   ⑤ 验证层 Verification—— 每个产物：装得上？跑得起来？签名有效？→ 结构化证据清单
```

- **① 知识层**：每个生态一份结构化"知识包"——产物格式、工具链、能否跨平台构建、必须在哪个 OS 做哪一步、签名/公证要求、上架规则、已知失败模式。
- **② 契约层**：声明式 `Forge.md`，描述"要交付到哪些生态、用什么签名、怎么验证"。AI 生成契约 = 产出一条合法链路；人可评审，机器可执行。
- **③ 编排层**：判定每个产物的执行位置。本地能做的直接跑；必须在特定 OS 的（Windows/苹果）生成对应平台的 CI 工作流，把签名证书作为 CI secret 注入；鸿蒙生成华为云构建/验证脚本。
- **④ 产出层**：在被指派的环境里调用各生态官方/成熟工具（fpm/nfpm、WiX/NSIS、xcodebuild/notarytool、hvigorw）。
- **⑤ 验证层**：把"装得上 / 跑得起来"的验证哲学推广到每种产物，汇总成 Release Manifest（SHA256 + 签名有效 + 运行证据 + git 溯源）。

## 4. 逐个生态：怎么落地、怎么解决签名

"解决签名"的真正含义 = DeliverKit 不替用户变出证书（那违法），而是：① 用知识层告诉 AI/用户需要什么证书、去哪办、怎么存；② 用编排层把证书安全注入到正确的构建环境；③ 用验证层确认签名 + 公证真的生效。

| 生态 | 产出位置 | 签名方案（合法链路） | DeliverKit 负责 |
|---|---|---|---|
| Linux (.deb/.rpm/AppImage) | 本地 / 任意 Linux | 无强制签名（仓库分发可选 GPG） | 全流程 + 干净环境安装验证 |
| Windows (.exe/.msi) | CI `windows-latest` | 用户在 CA 购买代码签名证书 → 存为 CI secret → runner 上 signtool 签名 | 生成 WiX/NSIS 配置 + CI 工作流 + 引导办证书 + 验证 |
| 苹果 (.dmg/.pkg/.app) | CI `macos-14` | Apple 开发者账号证书存入 CI keychain → xcodebuild 签名 → notarytool 公证 | 生成签名/公证配置 + CI 工作流 + 引导办开发者账号 + 验证票据 |
| iOS (.ipa) | CI `macos-latest` | 同上 + 描述文件（provisioning profile） | 同上（更复杂，放最后阶段） |
| 鸿蒙 (.hap/.app) | 华为云 / DevEco | AGC 证书 + profile 存为 secret | 签名 + 云手机验证 |

## 5. 路线图（每阶段有门槛，上一阶段验证通过才进下一阶段）

### 阶段 A — 契约层与知识地基（已完成）
- 两个规划类工具已就绪（`inspect_project`、`generate_packaging_plan`）。
- 定义"生态知识包" schema，把现有 ubuntu/harmonyos 适配器迁进去。
- **门槛**：知识包 schema 有 ≥2 个真实样例；契约层支持多目标 `delivery_targets`。

已满足：知识包 schema 已有 Linux Ubuntu、Linux RPM、Linux AppImage 与 HarmonyOS
样例；`Forge.md` 已嵌入可校验的多目标机器契约。

### 阶段 B — Linux 多生态可验证交付（已完成：本地 matrix 门槛已复现）
- 做能在一台 Linux 机器上合法产出的：`.deb`（补验证闭环）+ `.rpm` + AppImage。
- 给包补上"干净容器里装 + 跑"的验证。
- 扩展 `Forge.md` 的 `delivery_targets`。
- **门槛**：≥3 个真实项目，一份 Forge.md 产出多个 Linux 包且全部通过安装验证。

当前已实现 `pack_deb`、`pack_rpm`、`pack_appimage`，并提供
`npm run test:e2e:linux` 对 Python Flask、TypeScript 和 Go 标准库 HTTP 三个真实
fixture 逐一生成同一份多目标 Forge.md，再执行三种 Docker 构建与干净容器验证。
该命令的成功输出是 Phase B 门槛的可复现实证；仓库 `.github/workflows/test.yml`
也已加入 `linux-matrix` job，在 Ubuntu 22.04 上上传 JSON 证据。其他原生 Linux
主机复核仍建议继续执行。

### 阶段 C — 编排层 + CI 矩阵（实现中）
- 实现编排层：DeliverKit 能生成 GitHub Actions 多平台工作流。
- 先打通 **Windows `.msi`**（签名门槛比苹果低）：CI windows runner + 证书 secret + 安装验证。
- **门槛**：≥2 个真实项目在 CI 上产出已签名且可静默安装的 Windows 包。

当前已实现 `generate_ci_workflow` 与 `pack_windows_msi`：工作流包含
`ubuntu-22.04` Linux job 和 `windows-latest` MSI job，PFX 与密码仅从 CI
secrets 注入；Windows 真机/runner 签名产物尚未在本仓库完成实证，因此阶段门槛仍未达成。

### 阶段 D — 苹果生态（实现中）
- macOS `.dmg`/`.pkg`：CI macos runner + 签名 + 公证 + 票据验证。
- **门槛**：≥1 个真实项目产出通过 `spctl`/公证校验的 macOS 包。
- iOS `.ipa` 视需求再排（最复杂，涉及 App Store 上架）。

当前已实现 `pack_macos` 的 DMG/PKG 路径与 macOS CI job；PKG 额外要求
Developer ID Installer identity。缺少 Apple Developer 证书、公证凭据和可用
macOS runner 实证，因此门槛未宣称达成。

### 阶段 E — 鸿蒙正式化 + 统一交付报告（实现中）
- 鸿蒙：补 AGC 正式签名 + 云手机验证。
- 统一 Release Manifest：一份报告覆盖全部生态的"成功/证据"。
- **门槛**：一条 AI 指令 → 一份 Forge.md → 多生态产物 + 统一可验证报告。

当前已实现 `pack_harmonyos`、HarmonyOS CI job 与 `generate_release_manifest`；Linux
真实 matrix 现在同时生成 `verified` Release Manifest，
生成的 HarmonyOS job 明确要求 Linux self-hosted DevEco runner，并在执行前检查
`hvigorw`、`ohpm`、`hdc` 工具链，
AGC/hdc 设备证据和跨平台真实结果仍是最终门槛。

### 阶段 P1 — 交付百科与第一阶段宣发（已完成首版）
- 建立可直接部署的静态百科站点 `site/`，作为开发者与 Agent 的公开入口。
- 把 Windows Authenticode、Apple Developer/notarization、HarmonyOS AGC、Linux GPG 的申请入口、材料清单、CI 注入步骤写入知识包与站点指南。
- 明确个人账号可以作为材料提供方，但资格由平台/CA 决定；DeliverKit 不代办账号、不生成证书、不保存私钥。
- 第一阶段公开内容聚焦 Linux 真实矩阵、跨平台签名边界、可复用知识包；正式邮件订阅接入前，站点表单只做本地预览。
- **门槛**：站点在 375px/768px/1440px 无横向溢出，核心筛选/指南交互可用，且不包含任何真实 secrets。

当前首版已通过浏览器断点与交互验收；正式宣发前仍需接入邮件/社区订阅服务、隐私政策和统一域名。

### 阶段 P2 — 首次成功体验与宣传矩阵（进行中）

设定北极星目标：**30 天内让 10 个真实外部用户成功产出并验证一个安装包**（详见 [community/promotion/goal.md](community/promotion/goal.md)）。取「用户真的交付成功」而不是 star 作为目标，是因为前者才是这个项目的价值证明。优先级由此推导为**转化 > 流量**。

已完成（第二轮）：

- `deliverkit doctor`：把「本机现在能交付哪些目标、缺什么、怎么补」前置到 5 秒内可知。
- 失败可自救：错误结果带 `log_excerpt`（日志尾部片段）、`suggested_fix`、`next_actions`；此前只给日志路径，Agent 完全读不到原因。
- Docker 不可用细分为没装 / 守护进程未启动 / 权限不足 / 探测超时四类，各给修复动作；「Docker Desktop 未启动」曾被误判为权限问题，已用真实报错文案加回归测试。
- 构建超时不再伪装成普通失败，并提示预拉镜像；项目侧检查前置到 Docker 探测之前。
- CLI 默认人类可读输出，`--json` 保留结构化结果；MCP 响应设 `isError`；未预期异常落回统一错误结构。
- 宣传矩阵与目录提交材料落库 `docs/community/promotion/`，每周流量快照 workflow 上线。

**门槛**：首次使用者从零到一个「装得上、跑得起来」的包不超过 10 分钟；任何失败都能在结果里看到原因与下一步，不需要打开日志文件。

待办（第三轮，按对目标的贡献排序）：Linux 目标跨主机 CI 复核 → `inspect`/`plan` 支持手动指定语言与入口 → 契约 `source_dir` 比对加 realpath → AppImage 构建镜像 pin 版本 → 站点匿名统计 → opt-in 遥测（需拍板）。

## 6. 成功标准（愿景达成的样子）

一个开发者（或它的 AI Agent）对 DeliverKit 说：

> "把我这个 Node 服务交付成 Linux 服务器包、Windows 桌面安装包、macOS 安装包。"

DeliverKit 让 AI：
1. 读知识层 → 判断三种产物各自的合法产出方式；
2. 生成一份 `Forge.md`（人可评审的合法交付链路）；
3. 本地产出 Linux 包并验证；为 Win/mac 生成 CI 工作流，指导用户放好证书；
4. CI 在各自平台产出已签名、通过公证/安装验证的包；
5. 汇总一份 Release Manifest：**每个生态：成功 + 证据（SHA256 / 签名有效 / 装得上跑得起来）**。

**这就是"AI 交付大脑"——AI 懂得如何合法地把一个产品送达每一个生态。**

## 7. 不做的事

- 不承诺"一台机器产全生态"——是"编排各平台环境"，不是本地硬扛。
- 不替用户绕过或伪造签名——只做合法引导与注入。
- 不在门槛达标前铺开多生态——防止重蹈"放一堆模板假装支持"的老路。
