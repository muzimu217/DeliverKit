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
systems/adapter-loader.ts             typed loader for supported platform rules
```

Packaging-plan ownership is split by responsibility:

- `generate-packaging-plan.ts`: orchestration and public result handling.
- `plan-decision-engine.ts`: platform, image, risk, and next-action decisions.
- `forge-renderer.ts`: Forge.md template loading and rendering.
- `plan-writer.ts`: generated-file overwrite and user-managed append policy.

The seven registered tools are `inspect_project`, `preflight_check`,
`diagnose_build_failure`, `generate_packaging_plan`, `build_docker_image`, and
`pack_deb`, plus the in-development `pack_harmonyos_app` adapter.

## Runtime data

`systems/adapter-loader.ts` is the single loading boundary. It currently loads
Ubuntu server rules and the in-development HarmonyOS rules when
`generate_packaging_plan` creates `Forge.md`.

## Reference assets

- `systems/`: platform rules, compatibility notes, and packaging templates.
  Ubuntu and the in-development HarmonyOS rules are runtime-connected today. See
  [systems/README.md](./systems/README.md).
- `knowledge/`: curated YAML reference material. No runtime loader currently
  consumes these files. See [knowledge/README.md](./knowledge/README.md).
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
