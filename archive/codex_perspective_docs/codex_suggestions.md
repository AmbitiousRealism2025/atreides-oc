# Codex Perspective: Suggestions for Improvement (Expanded)

## Related
- `atreides/codex_perspective_docs/codex_index.md`
- `mentat/codex_perspective_docs/codex_index.md`

## MVP Guardrails
- Add a short “MVP cut line” appendix explicitly listing deferred agents, skills, and features.
- Require sign-off before introducing any post-MVP features into the MVP branch.
- Create a one-page “MVP non-goals” list to prevent scope creep during delivery.

## Hook Stability and Fallbacks
- Define a fallback strategy for `experimental.chat.system.transform` and `experimental.session.compacting`.
- Add detection logic for hook availability with a documented degradation path.
- Include a contingency plan if OpenCode removes or changes experimental APIs mid-project.

## Security-to-Test Traceability
- Build a mapping table between each security control and its corresponding test coverage.
- Add a checklist in the plan that ensures obfuscation decoding, blocked patterns, and file guards are each validated.
- Tie the 466-test parity goal to specific categories and minimum required coverage.

## Compatibility Rules
- Specify precedence and merge behavior between CLAUDE.md and AGENTS.md, including conflict resolution rules.
- Document how settings.json migration impacts opencode.json and when it should override defaults.
- Add a compatibility matrix that labels legacy features as MVP, post-MVP, or deprecated.

## Performance Validation
- Define measurement tooling and baseline environments for load time and hook overhead metrics.
- Add a minimal benchmark plan to Week 4 or Week 6 deliverables.
- Include thresholds for acceptable variance between local and CI environments.

## CLI Operational Runbook
- Expand the `doctor` command section with a remediation playbook for common warnings.
- Standardize warning/error codes for `doctor` output to support automation and support requests.
- Provide a short migration troubleshooting guide (common failure modes + recovery steps).

## Phase Acceptance Criteria
- Add explicit acceptance criteria for each phase (e.g., integration test pass list, hook validation scenarios).
- Require at least one end-to-end workflow test per phase milestone.
- Define minimal documentation deliverables per phase (README, migration guide, config reference).
