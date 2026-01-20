# Codex Review: MVP-F1 to MVP-F4

## Findings (ordered by severity)
- High: Session state initialization is described as calling `initializeSessionState` on `session.created`, but the guidance does not say to store the returned state in the Map. The sample implementation only returns a state object, so if followed literally the Map never gets the state and later `getState` will reinitialize, losing early mutations. Ref: `Traycer-Planning-Docs/tickets/[MVP-F3]_Implement_SessionManager_with_Map-Based_State.md:35`, `Traycer-Planning-Docs/tickets/[MVP-F3]_Implement_SessionManager_with_Map-Based_State.md:48`, `Traycer-Planning-Docs/tickets/[MVP-F3]_Implement_SessionManager_with_Map-Based_State.md:68`
- Medium: Coverage is enabled with an 80% threshold, while acceptance also requires `bun test` to pass even with no tests. A zero-test run will fail coverage unless thresholding is disabled or gated to CI only. Ref: `Traycer-Planning-Docs/tickets/[MVP-F4]_Set_Up_Testing_Framework_&_Development_Workflow.md:34`, `Traycer-Planning-Docs/tickets/[MVP-F4]_Set_Up_Testing_Framework_&_Development_Workflow.md:39`, `Traycer-Planning-Docs/tickets/[MVP-F4]_Set_Up_Testing_Framework_&_Development_Workflow.md:79`, `Traycer-Planning-Docs/tickets/[MVP-F4]_Set_Up_Testing_Framework_&_Development_Workflow.md:87`
- Medium: Testing infrastructure is explicitly out of scope in F1, yet F1 acceptance requires `bun test` to run. That makes F1 dependent on F4 and hard to complete in isolation. Ref: `Traycer-Planning-Docs/tickets/[MVP-F1]_Initialize_Package_Structure_&_Build_Pipeline.md:26`, `Traycer-Planning-Docs/tickets/[MVP-F1]_Initialize_Package_Structure_&_Build_Pipeline.md:88`
- Medium: The error boundary chooses safe defaults based on `handler.name`, which can be empty for anonymous handlers or unstable after bundling. This risks returning the wrong default type for a hook. Safe defaults should be keyed by explicit hook name. Ref: `Traycer-Planning-Docs/tickets/[MVP-F2]_Implement_Plugin_Entry_Point_&_Hook_Registry.md:56`, `Traycer-Planning-Docs/tickets/[MVP-F2]_Implement_Plugin_Entry_Point_&_Hook_Registry.md:66`
- Medium: Safe defaults are required but not specified per hook, leaving ambiguity about the correct return shapes for `event`, `stop`, tool hooks, and system transform. This can cause runtime type mismatches. Ref: `Traycer-Planning-Docs/tickets/[MVP-F2]_Implement_Plugin_Entry_Point_&_Hook_Registry.md:81`, `Traycer-Planning-Docs/tickets/[MVP-F2]_Implement_Plugin_Entry_Point_&_Hook_Registry.md:86`
- Low: The plugin export shape is not specified (named export vs default). If OpenCode expects a default export, `export const AtreidesPlugin` may not be discovered. Clarify loader expectations. Ref: `Traycer-Planning-Docs/tickets/[MVP-F2]_Implement_Plugin_Entry_Point_&_Hook_Registry.md:34`
- Low: `@opencode-ai/plugin` is listed under devDependencies without clarifying whether it is runtime or type-only. If runtime code imports it, it should be a dependency to avoid missing module errors. Ref: `Traycer-Planning-Docs/tickets/[MVP-F1]_Initialize_Package_Structure_&_Build_Pipeline.md:45`

## Open Questions / Assumptions
- Does OpenCode require a default export or a named export for plugins?
- Should coverage thresholds be enforced only in CI while local runs allow zero tests?
- Should session state initialization occur exclusively via `getState`, or should event handlers write to the Map directly?

## Change Summary
- No code changes proposed; this review highlights spec inconsistencies and clarifications to address before implementation.
