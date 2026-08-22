# r/mcp 发帖成稿

> 前置：gates.md 全部通过后发布。与 Show HN 错开至少一天。
> Reddit 铁律：以「求反馈」社区姿态发，不硬广；发帖后 24h 内有问必答；遵守子版规则（r/mcp 允许 project showcase，但需真实参与）。

## 标题

```
I built an MCP server that turns packaging/signing knowledge into plans agents can execute and verify (Linux verified e2e, Windows/macOS/HarmonyOS contract-first)
```

## 正文（markdown）

```
Every time I finish building something, the last mile is the worst: turning it into installers for Linux, Windows, macOS (and HarmonyOS if you ship in China). Each ecosystem gates packages behind signing + official toolchains + accounts, so an agent improvising this from prompts gets it wrong in expensive ways.

So I built DeliverKit — an MCP server (stdio) that gives agents this knowledge as executable tools:

- **Plan-before-build**: `inspect_project` + `generate_packaging_plan` produce a reviewable `Forge.md` contract (targets, artifacts, decision rationale, risks). Build tools refuse to run without it.
- **Real verification**: `pack_deb` / `pack_rpm` / `pack_appimage` build in isolated containers, then install and *run* the artifact in a fresh container — exit codes aren't proof, "it installed and ran" is.
- **Windows / macOS / HarmonyOS**: `pack_windows_msi` (WiX + Authenticode), `pack_macos` (DMG/PKG + codesign/notarytool/spctl), `pack_harmonyos` (hvigorw + hdc) — all contract-driven, run on the matching runners with secrets via CI. Honest status: these are implemented but their signing gates aren't CI-verified yet; the Linux loop is (e2e on Flask/TS/Go fixtures, green in CI).
- `generate_ci_workflow` emits the multi-platform Actions matrix; `generate_release_manifest` produces a unified ReleaseManifest.json with SHA256 + per-platform verification evidence.

The ecosystem knowledge (what signs what, where, and how to verify) lives in structured YAML packs the agent reads via `get_ecosystem_knowledge` — reviewable and versioned instead of buried in prompts.

Repo (MIT): https://github.com/muzimu217/DeliverKit
Site: https://muzimu217.github.io/DeliverKit/

Would love feedback from people who ship cross-platform: what ecosystems/edge cases would you want covered before you'd trust an agent with this?
```

## 备注

- r/mcp 之外可同步 r/LocalLLaMA（工具向、容忍度类似）与 r/devops，标题微调即可。
- 若被 automod 拦（新账号 karma 不足），先在帖下自然参与几天再发。
