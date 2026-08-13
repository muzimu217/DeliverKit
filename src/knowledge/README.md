# Knowledge reference assets

The YAML files in this directory are curated packaging notes and decision
references:

- `decisions.yaml`: cross-platform selection ideas.
- `docker-best-practices.yaml`: Docker and multi-architecture guidance.
- `deb-packaging.yaml`: Debian/Ubuntu packaging guidance.

## Current status

These files are shipped with the npm package, but production code does not
currently load or query them. They are reference data, not an active runtime
knowledge layer. Editing them will not change MCP tool output today.

The only external rule file currently consumed by a capability is
`../systems/servers/ubuntu/decision-rules.yaml`, used by
`generate_packaging_plan`.

## Activation requirements

Before any knowledge file is described as runtime behavior, add:

1. A schema and parser with actionable validation errors.
2. An explicit loader owned by the capability that uses the data.
3. Tests proving a rule change affects the expected output.
4. Versioning or provenance fields so rule updates can be audited.

Until then, keep these files useful as reviewed source material and avoid claims
that an Agent reads them automatically.
