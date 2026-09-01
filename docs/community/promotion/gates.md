# 发布门禁（Launch Gates）

> 历史门禁基线（2026-08-22）：当时远端尚未包含多平台工作，npm registry 上不存在包。本文件保留历史记录；当前代码已推送到 v0.3.0，仍需在 npm registry 完成首次公开发布。
> 结论：**当前不满足任何对外宣发条件**。以下 3 道门禁全部通过后，才按 matrix.md 节奏发布。

## Gate 1 — 推送多平台打包工作（用户执行）

本地未提交的打包能力（pack_windows_msi / pack_macos / pack_harmonyos / pack_deb / pack_rpm / pack_appimage / generate_ci_workflow / generate_release_manifest 及全部测试与 e2e）是 README 承诺的能力，**远端用户看不到**。推广引来的用户访问的是远端仓库。

```bash
# 按既有约定：与 site/ 变更分离提交
git add src/ tests/ package.json README.md docs/ROADMAP.md ...
git commit -m "feat: 多平台打包能力（Windows MSI / macOS / 鸿蒙 / CI 工作流 / Release Manifest）"
git push origin main
```

推送时**顺手把 README badge 加上**（放在标题下方）：

```markdown
[![CI](https://github.com/muzimu217/DeliverKit/actions/workflows/test.yml/badge.svg)](https://github.com/muzimu217/DeliverKit/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/deliverkit-mcp.svg)](https://www.npmjs.com/package/deliverkit-mcp)
```

## Gate 2 — 发布 npm 包（用户执行，需要 npm 账号）

README 的接入指引是 `npx -y deliverkit-mcp`，**包不存在时该命令 404**。这是当前所有推广落地的第一杀手。

```bash
npm adduser                 # 本机当前 ENEEDAUTH，需先登录
npm run verify              # lint + typecheck + build + test + tarball 冒烟，全绿再发
npm publish --access public # 发布 canonical 包 deliverkit-mcp
```

发布后在干净目录验证：`npx -y deliverkit-mcp` 启动 MCP stdio server；CLI 使用 `npx -y --package=deliverkit-mcp -- deliverkit doctor`。官方 MCP Registry 的「安装方式公开」前置条件至此满足。

## Gate 3 — Release v0.2.0（推送 Gate 1 后执行）

v0.1.0 Release 已建立在 a268349（契约层 + 生态知识包 + 交付百科站点）。Gate 1 推送后打 v0.2.0，把多平台能力作为发布事件：

```bash
git tag v0.2.0 && git push origin v0.2.0
gh release create v0.2.0 --title "v0.2.0 — 多平台打包：Windows MSI / macOS DMG+PKG / 鸿蒙 HAP" --notes-file <(echo "见 README「当前能力」；Linux 三目标 e2e 证据见 Actions 产物")
```

## 已由宣传矩阵代完成的项（无需用户操作）

- ✅ GitHub topics 已添加（14 个，SEO / 话题页曝光）
- ✅ Discussions 已开启（用户提问入口）
- ✅ Release v0.1.0、v0.2.0 已发布；v0.3.0 代码已推送，等待 npm 首发后创建 release
- ✅ `metrics-snapshot.yml` 流量采集 workflow 已上线并验证可运行
- ✅ 2026-08-22 真实基线已回填（`metrics/traffic-2026-08-22.json`：views 24/2 uniques，clones 22/12 uniques）
- ✅ tarball smoke 已通过：发布包包含 YAML 知识包、Forge 模板并可从干净目录启动 MCP
- ✅ 独立 Agent Skill 已加入 `skills/deliverkit-mcp/SKILL.md`
- ✅ 全渠道文案与目录提交材料已备好（见 `copy/`、`submissions/`）

## 后续动作（非阻断，但强烈建议）

**配置 METRICS_TOKEN（流量采集真实化）**：GitHub Actions 的默认 GITHUB_TOKEN 没有 traffic API 权限（HTTP 403），未配置 secret 时每周快照会记 `traffic_ok: false`。创建 classic PAT（勾选 `repo` scope）后：

```bash
gh secret set METRICS_TOKEN -R muzimu217/DeliverKit    # 粘贴 PAT
gh workflow run metrics-snapshot.yml -R muzimu217/DeliverKit  # 手动触发验证
```
