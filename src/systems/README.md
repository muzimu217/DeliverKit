# System adapters

This directory contains legacy platform-specific rules, compatibility data, and
packaging templates. A file being present here does not mean DeliverKit can
build that target.

## Current support status

| Area | Status | Runtime behavior |
| --- | --- | --- |
| `servers/ubuntu/decision-rules.yaml` | Legacy reference | Superseded for planning by `knowledge/ecosystems/linux-ubuntu.yaml` |
| `mobile/harmonyos/decision-rules.yaml` | Legacy reference | Superseded for planning by `knowledge/ecosystems/harmonyos.yaml` |
| `adapter-loader.ts` | Compatibility-only loader | Unit-tested but not called by current MCP tools |
| `ubuntu/` templates and guides | Reference assets | Not selected by a registered build tool yet |
| Linux deb/rpm/AppImage | Experimental build capabilities | `pack_deb`, `pack_rpm`, and `pack_appimage`; Docker isolation plus clean-container verification |
| CentOS, EulerOS, Fedora | Reference/planned | No dedicated platform-specific build tool yet |
| Android, PWA | Planning rules only | No registered build tool or active knowledge pack yet |
| Windows MSI | Experimental runner capability | `generate_ci_workflow` + `pack_windows_msi`; requires windows-latest, WiX, Authenticode secrets, and real runner evidence |
| macOS DMG | Experimental runner capability | `generate_ci_workflow` + `pack_macos`; requires macos-14, Apple signing/notary secrets, and real Gatekeeper evidence |
| HarmonyOS HAP/APP | Experimental runner capability | `generate_ci_workflow` + `pack_harmonyos`; requires DevEco, AGC secrets, and hdc device/cloud-phone evidence |

Today, the verified product paths include project inspection, knowledge
retrieval, `Forge.md` planning, and experimental Linux/Windows/macOS/HarmonyOS
runner capabilities. Apple and HarmonyOS signing/device gates remain
unverified until their platform evidence is supplied.

The active planning registration point is `knowledge/ecosystem-loader.ts`.
`adapter-loader.ts` is retained as legacy data loading code and must not be used
to claim an implemented packaging path.

## What “supported” requires

A platform becomes supported only when all of the following exist:

1. A registered MCP tool and validated input contract.
2. A capability implementation that produces the advertised artifact.
3. A runtime loader for the platform rules/templates it claims to use.
4. Unit, protocol, and end-to-end tests for that target.
5. User-facing documentation that matches actual behavior.

Rules and templates without those connections remain reference or planning
assets. This prevents roadmap files from being mistaken for working features.

## Migration direction

Do not reorganize these paths into `supported/` and `planned/` until callers,
package contents, and documentation can be migrated together. The next adapter
work should first introduce a typed platform loader, then move one target at a
time after its tests pass.
