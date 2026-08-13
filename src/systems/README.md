# System adapters

This directory contains platform-specific rules, compatibility data, and
packaging templates. A file being present here does not mean ForgeKit can build
that target.

## Current support status

| Area | Status | Runtime behavior |
| --- | --- | --- |
| `servers/ubuntu/decision-rules.yaml` | Runtime-connected | Read by `generate_packaging_plan` |
| Docker image build | Implemented | Exposed as `build_docker_image` |
| Ubuntu deb build | Implemented | Exposed as `pack_deb` |
| `mobile/harmonyos/decision-rules.yaml` | Runtime-connected | Read by `generate_packaging_plan` |
| HarmonyOS app/hap build | Experimental | Exposed as `pack_harmonyos_app`; real API 17 DevEco/HAP cloud-device evidence recorded; formal AGC signing remains unverified |
| `ubuntu/` templates and guides | Reference assets | Not selected through a general adapter loader |
| Debian, CentOS, EulerOS, Fedora | Reference/planned | No registered platform-specific build tool |
| Android, PWA, Windows | Planning rules only | No registered build tool and no runtime rule loader |

Today, the verified product paths are server-oriented Docker / Ubuntu deb
packaging plus one real HarmonyOS API 17 HAP/cloud-device validation. HarmonyOS
(NEXT) app/hap packaging remains experimental because formal AGC signing and
AppGallery acceptance are not verified. Mobile (Android/iOS), web, desktop,
rpm, and the other Linux distributions are not supported product capabilities
yet.

The runtime registration point is `adapter-loader.ts`. Its
`SUPPORTED_SYSTEM_ADAPTERS` list currently contains `servers/ubuntu` and
`mobile/harmonyos`. Unsupported `target_environment` values fail explicitly
instead of silently falling back to an Ubuntu plan.

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
