# Show HN 成稿

> 前置：gates.md 全部通过后发布。发布时间选美东上午（北京时间晚上 ~21:00–23:00）。
> HN 铁律：标题克制不吹、正文第一人称、主动讲 limitation、发布后守着回评论（前 2 小时决定生死）。

## 标题（≤80 字符，二选一）

```
Show HN: DeliverKit – MCP server that plans and verifies multi-ecosystem packaging
```

```
Show HN: I turned packaging/signing/notarization knowledge into an MCP server
```

## 正文

```
Hi HN, I built DeliverKit, an MCP server (stdio) that lets AI agents package one codebase into Linux, Windows, macOS, and HarmonyOS installers — legally.

The problem: every ecosystem locks installation packages behind code signing + official toolchains + developer accounts (Apple notarization needs macOS+Xcode, Windows needs Authenticode certs, HarmonyOS needs Huawei DevEco). So "build all installers on one machine" is a fantasy — but an agent that *knows* these constraints can still get you there via the right environment each time.

DeliverKit exposes that knowledge as agent-executable tools:

- inspect_project / generate_packaging_plan — produce a reviewable Forge.md contract (target ecosystems, artifacts, decision rationale, risks). No contract, no build — that's rule #1 (plan-before-build).
- pack_deb / pack_rpm / pack_appimage — build in isolated containers and verify by actually installing and running the artifact in a fresh container. That's rule #2 (real verification): not exit codes, but "does it install, run, and validate".
- pack_windows_msi / pack_macos / pack_harmonyos — same contract-driven flow for WiX MSI, DMG/PKG with codesign+notarytool, and HAP via hvigorw. These run on the matching runners (Windows / macOS / DevEco), with secrets injected via CI only.
- generate_ci_workflow / generate_release_manifest — emit the GitHub Actions matrix and a unified ReleaseManifest.json with SHA256 + verification evidence per platform.

Status: the Linux targets (deb/rpm/AppImage) have an e2e loop reproduced on three real fixtures (Flask, TypeScript, Go stdlib) and in CI on Ubuntu 22.04. Windows/macOS/HarmonyOS are implemented contract-first but their signing/notarization gates still need verification on the corresponding runners — I'm not claiming those are done.

Why MCP: packaging is exactly the kind of long-tail, high-context knowledge (per-ecosystem rules, cert handling, verification steps) that agents are bad at improvising and good at executing once it's structured. The ecosystem knowledge lives in reviewable YAML packs, not buried in prompt text.

MIT licensed: https://github.com/muzimu217/DeliverKit
Docs site: https://muzimu217.github.io/DeliverKit/

Happy to dig into how the plan-then-verify contract holds up against messy real-world signing requirements — that's where I expect the interesting failures to be.
```

## 评论区预案（常见质疑 + 口径）

| 预期质疑 | 回复口径 |
|---|---|
| 「和 electron-builder / jpackage / cargo-dist 什么区别」 | 那些是单生态构建器；DeliverKit 是给 Agent 的规划+验证层，产物里包含决策依据与验证证据，且覆盖鸿蒙 |
| 「为什么不直接写 prompt」 | 生态规则是结构化知识包（YAML），可评审可版本化；prompt 里长尾规则易错且不可验证 |
| 「Windows/macOS 还没验证就发？」 | 已在正文如实标注 status；Linux 闭环有 e2e+CI 证据（ReleaseManifest JSON 在 Actions 产物里） |
| 「鸿蒙有人用吗」 | 国内生态刚需，知识包 schema 与其余生态同构 |
