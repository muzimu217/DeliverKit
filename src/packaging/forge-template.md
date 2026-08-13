# ForgeKit Packaging Plan

> 本文件由 ForgeKit 自动生成，记录打包计划与决策依据。
> 请审查 Decisions / Risks 段，确认无误后再执行构建。
> 生成时间：{{generated_at}}

## Project
- Name: {{project_name}}
- Type: {{project_type}}
- Language: {{language}}
- Runtime: {{runtime}}
- Entry: {{entry}}

## Goals
- Primary artifact: {{primary_artifact}}
- Secondary artifact: {{secondary_artifact}}
- Target platform: {{target_platform}}
- Target users: {{target_users}}
- Distribution method: local

## Build Strategy
- Docker: {{docker_strategy}}
- Debian package: {{deb_strategy}}
- Architecture: x86_64
- Base image: {{base_image}}
- System target: {{system_target}}

## Decisions
{{decisions_section}}

## Risks
{{risks_section}}

## Commands
- Inspect: forgekit inspect .
- Build Docker: forgekit build-docker .
- Build deb: forgekit pack-deb .（可选）
- Verify: {{verify_command}}

## Results
- Docker image: pending
- Deb artifact: pending
- Logs: pending
- Checksums: pending

## Next Actions
{{next_actions_section}}