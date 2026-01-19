# Codex Perspective: Analysis (Expanded)

## Related
- `atreides/codex_perspective_docs/codex_index.md`
- `mentat/codex_perspective_docs/codex_index.md`

## Scope and Intent
- The plan positions `atreides-opencode` as a first-class OpenCode plugin, eliminating legacy template rendering and wrapper scripts.
- The MVP is defined around a full workflow arc: session lifecycle, phase tracking, error recovery, tool interception, and compaction.
- A clear separation exists between user-editable rules (`AGENTS.md`) and enforced behavior (plugin hooks).
- Backward compatibility is explicitly scoped via CLAUDE.md ingestion and settings migration.

## Architecture and Hook Strategy
- The hook map targets `event`, `stop`, `tool.execute.before/after`, and `experimental.*` to cover orchestration, enforcement, and context preservation.
- The system prompt injection is the primary mechanism for embedding orchestration rules and identity constraints.
- The compaction hook preserves state and todo continuity across long-running sessions.
- Tool interception is the enforcement boundary for command validation, file guards, and log sanitation.

## Migration Coverage
- The component migration matrix provides a detailed port plan for legacy commands, scripts, and templates.
- Template partials are folded into either AGENTS.md (rules) or plugin logic (runtime enforcement).
- Shell script functionality is explicitly migrated into TypeScript hooks rather than executed externally.

## Security Posture
- The security pipeline is designed to normalize commands before pattern evaluation (URL decode, hex, octal, quote stripping).
- Blocked patterns cover destructive actions, fork bombs, and remote code execution behaviors.
- File guards prevent interaction with secrets, keys, credentials, and cloud config files.
- Error pattern detection is used to drive recovery behavior and enforce the three-strikes protocol.

## Identity and UX
- The Muad’Dib identity system is preserved and made configurable, including response prefixes and delegation announcements.
- Identity is treated as part of system prompt behavior, not a stylistic add-on.
- Onboarding allows persona name selection alongside model and agent configuration.

## Delivery Mechanics
- The CLI is the primary control plane for initialization, verification, updates, and migration.
- Generated assets include agent definitions, skill files, and the local plugin wrapper.
- Init modes (minimal/standard/full) allow staged adoption without requiring all features from day one.

## Quality and Validation
- Success criteria include functional workflow compliance, security hardening, and performance thresholds.
- The plan targets parity with a large legacy test corpus (466 tests), emphasizing regression avoidance.
- Risk assessment highlights OpenCode API changes and experimental hook stability as primary technical risks.
