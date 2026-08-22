# X / Twitter 串推成稿

> 前置：gates.md 通过后发布，T+2~T+3（此时已有目录收录/首批反馈可引用）。
> 配图：`docs/community/deliverkit-hero.png`（交付百科首页 hero）；可另截 Forge.md 与 ReleaseManifest.json 终端图。

---

**1/6**
Shipping one product to every ecosystem means: Apple notarization (macOS+Xcode only), Windows Authenticode certs, Huawei DevEco for HarmonyOS.

An agent improvising this from prompts burns days. So I taught an agent the rules instead.

🧵 DeliverKit, open source (MIT):

**2/6**
It's an MCP server that turns packaging/signing/notarization knowledge into tools an agent can execute — and verify.

Rule #1: plan-before-build. Every delivery starts with a reviewable `Forge.md` contract: target ecosystems, artifacts, decision rationale, risks. No contract → no build. [配图：Forge.md]

**3/6**
Rule #2: real verification. `pack_deb` / `pack_rpm` / `pack_appimage` build in isolated containers, then install and RUN the artifact in a fresh container.

Exit codes aren't proof. "It installed and ran" is.

**4/6**
Same contract-driven flow for the hard ecosystems:
• `pack_windows_msi` — WiX + Authenticode
• `pack_macos` — DMG/PKG + codesign/notarytool/spctl
• `pack_harmonyos` — hvigorw + hdc

Honest status: Linux loop is e2e-verified (Flask/TS/Go fixtures, green CI). The rest is contract-first, signing gates pending CI.

**5/6**
`generate_ci_workflow` emits the multi-platform Actions matrix. `generate_release_manifest` produces one ReleaseManifest.json with SHA256 + per-platform verification evidence — proof your agent actually shipped.

Ecosystem rules live in reviewable YAML packs, not prompt text.

**6/6**
Try it: `npx -y deliverkit-mcp` (MCP/stdio, works with Claude & any MCP client)
Code: https://github.com/muzimu217/DeliverKit
Delivery encyclopedia: https://muzimu217.github.io/DeliverKit/

Stars ⭐ and brutal feedback both welcome.

---

## 发布备注

- 首推单独发（hook 放推外），回复串接 2–6。
- 若 Show HN / r/mcp 已有反馈，把 1–2 条真实评论截图替换第 6 条结尾，社交证明优于 CTA。
