# Source architecture

`src` contains three different kinds of assets. Their status matters more than
their file extension or directory depth.

## Runtime code

```text
mcp-server/index.ts
  -> mcp-server/tools/registry.ts     MCP discovery metadata
  -> mcp-server/tools/schemas.ts      authoritative tool input contracts
  -> mcp-server/tools/executor.ts     validation and capability routing
  -> capabilities/*.ts                product behavior
  -> capabilities/utils/*.ts          shared runtime helpers
knowledge/ecosystem-loader.ts         typed loader for active ecosystem knowledge packs
```

Packaging-plan ownership is split by responsibility:

- `generate-packaging-plan.ts`: orchestration and public result handling.
- `plan-decision-engine.ts`: platform, image, risk, and next-action decisions.
- `forge-renderer.ts`: Forge.md template loading and rendering.
- `plan-writer.ts`: generated-file overwrite and user-managed append policy.

The registered tools are `inspect_project`, `generate_packaging_plan`,
`get_ecosystem_knowledge`, `pack_deb`, `pack_rpm`, `pack_appimage`,
`generate_ci_workflow`, `pack_windows_msi`, `pack_macos`, `pack_harmonyos`, and
`generate_release_manifest`. Each build or orchestration tool
requires a machine-readable Forge contract and records reviewable output or
verification logs.

## Runtime data

`knowledge/ecosystem-loader.ts` is the active loading boundary for planning and
build target selection. It loads the registered ecosystem knowledge packs when
`generate_packaging_plan` creates `Forge.md`; build and orchestration capabilities
validate the embedded contract before invoking Docker or a platform runner.
The embedded `source_dir` is relative to `Forge.md`, so a reviewed plan can be
committed and reused after a CI checkout moves the repository to another path.

The Windows path is intentionally runner-bound: `pack_windows_msi` returns an
explicit toolchain error on macOS/Linux, while `generate_ci_workflow` emits the
reviewable `windows-latest` job and secret names needed to execute it legally.
The macOS path supports both notarized DMG and PKG artifacts; PKG additionally
requires a Developer ID Installer identity.

## Reference assets

- `systems/`: legacy platform rules, compatibility notes, and packaging
  templates. They remain reference material until a build capability explicitly
  consumes them. See [systems/README.md](./systems/README.md).
- `knowledge/`: active structured ecosystem knowledge packs and their runtime
  loader. See [knowledge/README.md](./knowledge/README.md).
- `packaging/`: the human-readable Forge plan template.

Evaluation corpora and quality tooling belong under `tests/` and `scripts/`,
not in production `src`.

## Adding a tool

1. Add its Zod input schema to `mcp-server/tools/schemas.ts` and include it in
   `ToolInputSchemas`.
2. Add its description to `mcp-server/tools/registry.ts`.
3. Implement the capability under `capabilities/` and route it in
   `mcp-server/tools/executor.ts`.
4. Add input-contract, capability, and protocol tests.

Do not handwrite another JSON Schema in the registry. It is generated from the
same Zod contract used for runtime validation.
