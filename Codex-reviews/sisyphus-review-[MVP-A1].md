# Codex Review: MVP-A1

## Findings (ordered by severity)
- Medium: Generation logic writes to `.opencode/agent/` but does not ensure the directory exists, risking runtime failures on fresh projects. Ref: `Traycer-Planning-Docs/tickets/[MVP-A1]_Generate_MVP_Agent_Files_&_Templates.md:92`
- Medium: Template rendering replaces `{{name}}`, `{{displayName}}`, and `{{model}}`, but the sample template only includes `{{model}}` and does not include `{{enabled}}`, so enabled flags may never be rendered and displayName may remain hardcoded. Ref: `Traycer-Planning-Docs/tickets/[MVP-A1]_Generate_MVP_Agent_Files_&_Templates.md:41`, `Traycer-Planning-Docs/tickets/[MVP-A1]_Generate_MVP_Agent_Files_&_Templates.md:98`
- Medium: Only the Stilgar template is specified; templates for Explore, Librarian, Build, and Plan are not defined, making frontmatter schema and tool permissions for the other agents ambiguous. Ref: `Traycer-Planning-Docs/tickets/[MVP-A1]_Generate_MVP_Agent_Files_&_Templates.md:20`, `Traycer-Planning-Docs/tickets/[MVP-A1]_Generate_MVP_Agent_Files_&_Templates.md:36`
- Medium: Customization zone markers are required but only shown in the Stilgar example. There is no guidance to preserve user edits when regenerating or merging templates, risking overwrites. Ref: `Traycer-Planning-Docs/tickets/[MVP-A1]_Generate_MVP_Agent_Files_&_Templates.md:25`, `Traycer-Planning-Docs/tickets/[MVP-A1]_Generate_MVP_Agent_Files_&_Templates.md:72`
- Low: Model defaults include specific model IDs (e.g., `claude-haiku-4-5`) without validation or availability checks, risking failures on environments that lack those models. Ref: `Traycer-Planning-Docs/tickets/[MVP-A1]_Generate_MVP_Agent_Files_&_Templates.md:118`, `Traycer-Planning-Docs/tickets/[MVP-A1]_Generate_MVP_Agent_Files_&_Templates.md:120`

## Open Questions / Assumptions
- Should generation create `.opencode/agent/` if missing, and how should errors be surfaced?
- What is the canonical frontmatter schema (required fields and defaults) across all 5 agent templates?
- How should regeneration preserve user customizations inside the custom zone markers?
- Are additional templates or tool permissions required for non-Stilgar agents, and where are they defined?
- Should model names be validated or mapped to provider availability during init?

## Change Summary
- No code changes proposed; this review highlights spec gaps and acceptance criteria ambiguities to resolve before implementation.
