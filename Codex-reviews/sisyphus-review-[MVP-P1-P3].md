# Codex Review: MVP-P1 through MVP-P3

## Findings (ordered by severity)
- High: Workflow phase transitions rely on tool usage, but there is no hook capturing the initial user message, so the Intent → Assessment transition can be skipped entirely. Ref: `Traycer-Planning-Docs/tickets/[MVP-P1]_Implement_WorkflowEngine_&_Phase_Tracking.md:24`, `Traycer-Planning-Docs/tickets/[MVP-P1]_Implement_WorkflowEngine_&_Phase_Tracking.md:59`
- Medium: Verification and implementation both map to `bash` while `detectPhaseTransition` receives only the tool name, making phase detection ambiguous without command context. Ref: `Traycer-Planning-Docs/tickets/[MVP-P1]_Implement_WorkflowEngine_&_Phase_Tracking.md:66`, `Traycer-Planning-Docs/tickets/[MVP-P1]_Implement_WorkflowEngine_&_Phase_Tracking.md:93`
- Medium: Phase-specific guidance is required, but the ticket does not define the output channel or contract for emitting guidance, making acceptance tests unclear. Ref: `Traycer-Planning-Docs/tickets/[MVP-P1]_Implement_WorkflowEngine_&_Phase_Tracking.md:26`, `Traycer-Planning-Docs/tickets/[MVP-P1]_Implement_WorkflowEngine_&_Phase_Tracking.md:128`
- Medium: The test example expects intent → exploration on first `read`, which conflicts with the stated heuristic of intent → assessment before tool use. Either the heuristic or test needs alignment. Ref: `Traycer-Planning-Docs/tickets/[MVP-P1]_Implement_WorkflowEngine_&_Phase_Tracking.md:60`, `Traycer-Planning-Docs/tickets/[MVP-P1]_Implement_WorkflowEngine_&_Phase_Tracking.md:148`
- Medium: The 22 error patterns are not enumerated (placeholder comments), blocking a concrete implementation and making 100% pattern coverage tests undefined. Ref: `Traycer-Planning-Docs/tickets/[MVP-P2]_Implement_ErrorRecovery_&_3-Strike_Protocol.md:38`, `Traycer-Planning-Docs/tickets/[MVP-P2]_Implement_ErrorRecovery_&_3-Strike_Protocol.md:129`
- Medium: Error detection takes a single output string, but the ticket doesn’t specify whether this is stdout, stderr, combined output, or includes exit code, risking missed errors or false resets. Ref: `Traycer-Planning-Docs/tickets/[MVP-P2]_Implement_ErrorRecovery_&_3-Strike_Protocol.md:25`, `Traycer-Planning-Docs/tickets/[MVP-P2]_Implement_ErrorRecovery_&_3-Strike_Protocol.md:74`
- Medium: Escalation sets `escalated = true` but no reset or downgrade behavior is defined, so a session can remain permanently escalated. Ref: `Traycer-Planning-Docs/tickets/[MVP-P2]_Implement_ErrorRecovery_&_3-Strike_Protocol.md:91`, `Traycer-Planning-Docs/tickets/[MVP-P2]_Implement_ErrorRecovery_&_3-Strike_Protocol.md:101`
- Medium: Blocked command patterns are listed as 22+ but are not enumerated, which blocks deterministic coverage for pattern tests and acceptance criteria. Ref: `Traycer-Planning-Docs/tickets/[MVP-P3]_Implement_SecurityHardening_&_Multi-Layer_Validation.md:94`, `Traycer-Planning-Docs/tickets/[MVP-P3]_Implement_SecurityHardening_&_Multi-Layer_Validation.md:192`
- Medium: Warning patterns require an “ask” action and integration with ToolInterceptor, but neither the “ask” UX nor the ToolInterceptor contract is defined. Ref: `Traycer-Planning-Docs/tickets/[MVP-P3]_Implement_SecurityHardening_&_Multi-Layer_Validation.md:111`, `Traycer-Planning-Docs/tickets/[MVP-P3]_Implement_SecurityHardening_&_Multi-Layer_Validation.md:196`
- Medium: File guards list blocked paths/files but do not specify path normalization or traversal handling, yet path traversal tests are mandated. This enables bypass risks (e.g., `../` or symlinked paths). Ref: `Traycer-Planning-Docs/tickets/[MVP-P3]_Implement_SecurityHardening_&_Multi-Layer_Validation.md:121`, `Traycer-Planning-Docs/tickets/[MVP-P3]_Implement_SecurityHardening_&_Multi-Layer_Validation.md:205`
- Low: Recovery suggestions are keyed by strings, but detection is regex-based; no mapping from matched regex to suggestion keys is defined, risking missing suggestions for common errors. Ref: `Traycer-Planning-Docs/tickets/[MVP-P2]_Implement_ErrorRecovery_&_3-Strike_Protocol.md:97`, `Traycer-Planning-Docs/tickets/[MVP-P2]_Implement_ErrorRecovery_&_3-Strike_Protocol.md:114`
- Low: The `/error:/i` pattern is extremely broad and will inflate strike counts on benign outputs. Ref: `Traycer-Planning-Docs/tickets/[MVP-P2]_Implement_ErrorRecovery_&_3-Strike_Protocol.md:51`

## Open Questions / Assumptions
- Should WorkflowEngine also integrate with a message hook to guarantee Intent → Assessment before tool use?
- How should verification `bash` commands be detected (command patterns, exit codes, or explicit flags)?
- Can the full lists of error patterns and blocked command patterns be included in the tickets for testability?
- What is the authoritative source of tool output for error detection (stdout, stderr, exit code, or combined)?
- When should `errorRecovery.escalated` be reset or downgraded after successful runs?
- What is the exact “ask” behavior for warning patterns, and what is the ToolInterceptor API contract?
- Should file guard checks normalize and resolve paths before matching to prevent traversal bypasses?

## Change Summary
- No code changes proposed; this review highlights spec gaps and acceptance criteria ambiguities to resolve before implementation.
