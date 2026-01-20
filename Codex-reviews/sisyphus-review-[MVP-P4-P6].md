# Codex Review: MVP-P4 through MVP-P6

## Findings (ordered by severity)
- High: SystemPromptInjector reads only `process.cwd()/AGENTS.md`, but the AGENTS.md spec defines hierarchical scope; without resolving the nearest applicable AGENTS.md, scoped instructions will be skipped. Ref: `Traycer-Planning-Docs/tickets/[MVP-P5]_Implement_SystemPromptInjector_&_AGENTS.md_Integration.md:21`, `Traycer-Planning-Docs/tickets/[MVP-P5]_Implement_SystemPromptInjector_&_AGENTS.md_Integration.md:74`
- High: CompactionHandler scope includes “state restoration after compaction”, but no restoration/parsing flow or hook usage is defined, so preserved state may never be rehydrated. Ref: `Traycer-Planning-Docs/tickets/[MVP-P6]_Implement_CompactionHandler_&_State_Preservation.md:23`, `Traycer-Planning-Docs/tickets/[MVP-P6]_Implement_CompactionHandler_&_State_Preservation.md:32`
- Medium: ToolInterceptor relies on `output.error` and `output.duration`, but tool output shape isn’t specified. Without a standard output contract (success flag, exit code, stderr), log data and success detection will be inconsistent. Ref: `Traycer-Planning-Docs/tickets/[MVP-P4]_Implement_ToolInterceptor_&_Execution_Logging.md:80`, `Traycer-Planning-Docs/tickets/[MVP-P4]_Implement_ToolInterceptor_&_Execution_Logging.md:91`
- Medium: ToolInterceptor validation uses `input.path` for `edit`/`write`, but the tool schemas in this repo use `filePath` fields. If the hook receives tool input as-is, path validation will be bypassed. Ref: `Traycer-Planning-Docs/tickets/[MVP-P4]_Implement_ToolInterceptor_&_Execution_Logging.md:66`
- Medium: SystemPromptInjector Markdown validation requires specific headings (`# Orchestration`, `## Workflow`, `## Agents`), but the AGENTS.md format and required sections are not defined elsewhere; this can incorrectly reject valid configs. Ref: `Traycer-Planning-Docs/tickets/[MVP-P5]_Implement_SystemPromptInjector_&_AGENTS.md_Integration.md:85`, `Traycer-Planning-Docs/tickets/[MVP-P5]_Implement_SystemPromptInjector_&_AGENTS.md_Integration.md:162`
- Medium: SystemPromptInjector injects identity formatting and AGENTS.md into the system prompt, but does not describe how to avoid duplicate injections when the hook runs multiple times or how to compose with other transforms. Ref: `Traycer-Planning-Docs/tickets/[MVP-P5]_Implement_SystemPromptInjector_&_AGENTS.md_Integration.md:23`, `Traycer-Planning-Docs/tickets/[MVP-P5]_Implement_SystemPromptInjector_&_AGENTS.md_Integration.md:57`
- Medium: CompactionHandler preserves `pendingTodos` from `state.todos.pending`, but no shape for `todos` is defined in the ticket; similarly `todo.description` is assumed. This risks runtime errors. Ref: `Traycer-Planning-Docs/tickets/[MVP-P6]_Implement_CompactionHandler_&_State_Preservation.md:43`, `Traycer-Planning-Docs/tickets/[MVP-P6]_Implement_CompactionHandler_&_State_Preservation.md:65`
- Medium: Compaction preservation omits parts of “error state” (e.g., escalation flag or last error details), yet the scope says “error state” should be preserved. Ref: `Traycer-Planning-Docs/tickets/[MVP-P6]_Implement_CompactionHandler_&_State_Preservation.md:19`, `Traycer-Planning-Docs/tickets/[MVP-P6]_Implement_CompactionHandler_&_State_Preservation.md:46`
- Low: ToolInterceptor’s `beforeExecute` returns `{ action: 'ask' }`, but there’s no defined UX or follow-up path for “ask” responses at the hook level, risking dead-end tool invocations. Ref: `Traycer-Planning-Docs/tickets/[MVP-P4]_Implement_ToolInterceptor_&_Execution_Logging.md:52`, `Traycer-Planning-Docs/tickets/[MVP-P4]_Implement_ToolInterceptor_&_Execution_Logging.md:56`

## Open Questions / Assumptions
- How should SystemPromptInjector resolve scoped AGENTS.md files (closest directory, multi-file merge, or root-only)?
- What is the canonical tool input/output schema for hooks (fields for file path, stdout/stderr, exit code, duration)?
- Should SystemPromptInjector de-duplicate or mark injected content to avoid repeated injections per hook call?
- What is the official AGENTS.md required section list, or should validation be schema-based rather than heading checks?
- Where and how is preserved state rehydrated after compaction (hook, parser, SessionManager API)?
- What constitutes “error state” for compaction: strike count only, or escalation/last-error metadata?

## Change Summary
- No code changes proposed; this review highlights spec gaps and acceptance criteria ambiguities to resolve before implementation.
