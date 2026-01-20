# Codex Review: MVP-T2

## Findings (ordered by severity)
- High: Integration tests require an “actual OpenCode installation” and load the plugin from `./dist/plugin/index.js`, but the ticket doesn’t define how to build artifacts in CI or local test runs. Without a build step, the integration suite will fail by default. Ref: `Traycer-Planning-Docs/tickets/[MVP-T2]_Implement_Integration_Test_Suite_(150_tests).md:5`, `Traycer-Planning-Docs/tickets/[MVP-T2]_Implement_Integration_Test_Suite_(150_tests).md:68`
- Medium: Test counts by category sum to 160 (10 + 15 + 40 + 20 + 25 + 20 + 20 + 10) which exceeds the 150 target; scope should clarify expected totals. Ref: `Traycer-Planning-Docs/tickets/[MVP-T2]_Implement_Integration_Test_Suite_(150_tests).md:20`, `Traycer-Planning-Docs/tickets/[MVP-T2]_Implement_Integration_Test_Suite_(150_tests).md:41`
- Medium: The setup uses `@opencode-ai/plugin`, but required version and API contract are not defined; plugin API changes could break tests. Ref: `Traycer-Planning-Docs/tickets/[MVP-T2]_Implement_Integration_Test_Suite_(150_tests).md:62`
- Medium: Test fixture creation (`createTestProject`, `cleanupTestProject`) is referenced but not specified, making isolation and cleanup requirements ambiguous. Ref: `Traycer-Planning-Docs/tickets/[MVP-T2]_Implement_Integration_Test_Suite_(150_tests).md:70`
- Low: Execution time target (<30s) is aggressive given “actual OpenCode” + 150 tests; without sharding or parallelism guidance, this may be unrealistic. Ref: `Traycer-Planning-Docs/tickets/[MVP-T2]_Implement_Integration_Test_Suite_(150_tests).md:52`

## Open Questions / Assumptions
- What build step produces `./dist/plugin/index.js` for integration tests, and should it be part of test setup?
- Is the 150 test target inclusive of all category counts, or should category counts be adjusted?
- What OpenCode version and `@opencode-ai/plugin` API should the tests target?
- What is the canonical test fixture setup for creating/cleaning isolated test projects?
- Is there a plan for parallelization or test selection to meet the <30s target?

## Change Summary
- No code changes proposed; this review highlights spec gaps and acceptance criteria ambiguities to resolve before implementation.
