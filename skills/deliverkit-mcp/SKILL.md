---
name: DeliverKit MCP
description: Give an AI agent a contract-first workflow for building and verifying Linux, Windows, macOS, and HarmonyOS delivery artifacts.
read_when:
  - The user wants to package or release an application for another operating system
  - The user asks for installers, signing, notarization, CI packaging, or release evidence
  - A project needs a Forge.md delivery plan or a verified release manifest
metadata: {"requires":{"bins":["node","npm"]},"mcp":{"server":"deliverkit-mcp","transport":"stdio"}}
---

# DeliverKit MCP

DeliverKit is the execution backend for a delivery-focused agent skill. It turns ecosystem packaging rules into a reviewable plan, sends each build to the environment where it is legally and technically valid, and returns installation, runtime, signing, and checksum evidence.

## Start The MCP Server

Install the public package and use the `deliverkit-mcp` executable:

```bash
npx -y deliverkit-mcp
```

Claude Desktop and other stdio MCP clients can use:

```json
{
  "mcpServers": {
    "deliverkit": {
      "command": "npx",
      "args": ["-y", "deliverkit-mcp"]
    }
  }
}
```

The package also includes the human-facing CLI executable `deliverkit`.

## Default Workflow

1. Call `inspect_project` with the project root. Use its language, runtime, entrypoint, and existing packaging findings. If the language is not recognized (or is wrong), pass the optional `language` (`python` / `javascript` / `typescript` / `go` / `arkts`) and `entrypoints` overrides instead of stopping — they flow into the Forge.md contract. Entrypoints must be relative paths to existing files (or `npm start`).
2. Call `generate_packaging_plan` with explicit goals such as `deb`, `rpm`, `appimage`, `windows-msi`, `macos-dmg`, or `harmonyos-hap`. The same `language`/`entrypoints` overrides are accepted here when inspection could not detect them.
3. Read the generated `Forge.md`. Ask the user to review target ecosystems, artifact types, signing boundaries, risks, and verification commands before building.
4. Call `get_ecosystem_knowledge` when a target's toolchain, signing material, distribution rule, or verification requirement needs explanation.
5. For Linux targets, call the relevant `pack_deb`, `pack_rpm`, or `pack_appimage` only after the contract is present. These build in isolated containers and verify the artifact in a fresh container.
6. For Windows, macOS, or HarmonyOS, call `generate_ci_workflow` when the current machine is not the matching runner. Platform-specific signing material must be supplied by the user through the runner's secret store or keychain.
7. Call `generate_release_manifest` after platform result JSON files exist. Treat `verified` as evidence-backed, not as a synonym for “the command exited zero”.

Never skip the plan review or claim that a platform is verified without its corresponding runner evidence.

## Environment Gates

- Linux `deb`, `rpm`, and `AppImage`: Docker CLI and a reachable Docker daemon. AppImage produces x86_64; arm64 hosts need working amd64 emulation.
- Windows MSI: Windows runner, WiX, `signtool`, `msiexec`, and the user's Authenticode certificate.
- macOS DMG/PKG: macOS runner, Xcode tools, Apple Developer identity, and notarization credentials.
- HarmonyOS HAP/APP: DevEco runner, `hvigorw`, `ohpm`, `hdc`, AGC signing material, and a device or cloud device for installation verification.

Run `deliverkit doctor` before a long build. It reports what is ready on the current machine and how to move a target to CI.

## Three Contracts

1. **Plan before build**: every build tool requires a valid `Forge.md` contract that declares the target and artifact.
2. **Real verification**: install and run the artifact in a clean environment; signing and notarization need their official verification commands too.
3. **Actionable failure**: a failed result must be handled as structured data. Read `error.code`, `error.summary`, `error.suggested_fix`, `error.log_excerpt`, and `next_actions`. Do not ask the user to guess from a bare exit code.

## Failure Recovery

- `plan_not_found`: call `generate_packaging_plan`, then show the user the new `Forge.md` for review.
- `plan_invalid`: explain the missing target or invalid contract and regenerate with the exact required goal. A `source_dir` mismatch names both paths; if they differ only by symlink (macOS `/tmp` vs `/private/tmp`), re-run with the real path.
- `invalid_input` on language/entrypoint overrides: the value is outside the supported set or the entry file does not exist; the message lists what is supported.
- `toolchain_not_available`: use the supplied reason and suggested fix. Do not retry a 15-minute build until the preflight condition is fixed.
- `signing_material_missing`: tell the user which secret or keychain identity is missing. Never request or print a private key in chat or a repository.
- `build_failed` or `verification_failed`: quote `error.log_excerpt`, link `detail_log`, and follow `next_actions`. A timeout is different from a compile failure; suggest pre-pulling images when the result says timeout.

## Evidence Status

- **VERIFIED**: Linux deb/rpm/AppImage have end-to-end fixtures (Python/Flask, TypeScript, and Go) and a green CI packaging matrix.
- **CONTRACT-FIRST**: Windows MSI, macOS DMG/PKG, and HarmonyOS HAP/APP implementations exist, but signing, notarization, and device gates still require evidence on their matching runners.

Use these labels in summaries and promotion copy. Never describe all ecosystems as fully verified until their runner evidence is present.

## Getting Help / Reporting Success

- Stuck on a step? Open a Q&A in [Discussions](https://github.com/muzimu217/DeliverKit/discussions) with the failed result JSON — it already carries `error.code`, `log_excerpt`, and next actions, so paste it as-is. First response target is 24 hours.
- Completed a verified delivery? Report it via the “成功交付反馈” issue form or a Show-and-tell discussion (ReleaseManifest.json excerpt welcome; strip paths and signing material first). Explicit consent is required before any case is used publicly; without it, reports only count toward the internal metric.

## Minimal Example

For a Linux package, the user can run:

```bash
npx -y --package=deliverkit-mcp -- deliverkit doctor
npx -y --package=deliverkit-mcp -- deliverkit inspect .
npx -y --package=deliverkit-mcp -- deliverkit plan . --goals deb
# review Forge.md
npx -y --package=deliverkit-mcp -- deliverkit pack-deb . --plan Forge.md
```

For a project the inspector cannot recognize, manual overrides keep the flow alive:

```bash
npx -y --package=deliverkit-mcp -- deliverkit plan . --goals deb --language python --entry server.rb
```

For a multi-platform release, plan all goals, generate the CI workflow, let each matching runner produce a result JSON, then generate one `ReleaseManifest.json` with the evidence.
