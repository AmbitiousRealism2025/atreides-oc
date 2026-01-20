# Atreides OpenCode — Production Test Coverage Review (Bun Test)

## Executive Summary

The test suite is **broad and intentional**, especially around the plugin's core orchestration managers (workflow, security hardening, session state, compaction, interception). There is a **real integration harness** that exercises hooks end-to-end in a mocked OpenCode environment, which is a strong signal for production-readiness.

The biggest gaps are in the **CLI onboarding path (`init` + wizard)** and several **utility/lib modules** (`logger`, `file-manager`, parts of `backup`, `constants`). Additionally, a few tests are **coverage-driven / brittle** (tight performance thresholds, "doesn't throw" tests that assert `true`, and some console monkey-patching that may leak across tests).

---

## Coverage Analysis (estimated % per module)

> Estimate is based on `src/` inventory (52 files) vs `test/` inventory, plus spot checks of representative tests.

### `src/plugin/` (core plugin)
- **`src/plugin/managers/*`**: **~85–95%**
  - Evidence: dedicated tests for `session-manager`, `security-hardening`, `tool-interceptor`, plus integration tests exercising workflow + hook wiring (`test/integration/*`).
- **`src/plugin/index.ts` / `src/plugin/handlers.ts` / `src/plugin/utils.ts` / `src/plugin/types.ts`**: **~70–85%**
  - Evidence: `test/plugin/index.test.ts`, `test/plugin/integration.test.ts`, and integration harness tests exercise hook surfaces and state compaction.
  - Potential gap: deeper behavioral testing for `handlers.ts`/`utils.ts` internals (depending on what lives there).

### `src/lib/` (shared utilities)
- **Overall `src/lib/*`**: **~65–80%**
  - **High coverage** (unit tests exist):
    - `src/lib/config.ts` (`test/lib/config.test.ts`) **~90%+**
    - `src/lib/version.ts` (`test/lib/version.test.ts`) **~80%**
    - `src/lib/merge.ts` (`test/lib/merge.test.ts`) **~80%**
    - `src/lib/manifest.ts` (`test/lib/manifest.test.ts`) **~80%**
    - `src/lib/checkpoint-manager.ts` (`test/lib/checkpoint-manager.test.ts`) **~80%**
    - `src/lib/state-persistence.ts` (`test/lib/state-persistence.test.ts`) **~80%**
    - `src/lib/session-logger.ts` (`test/lib/session-logger.test.ts`) **~80%**
  - **Low / partial coverage**:
    - `src/lib/backup.ts`: **~40–70%**
      - Evidence: `test/cli/uninstall.test.ts` heavily exercises "backup created by default" flows, but likely doesn't cover `listBackups`, invalid metadata, sort behavior, etc.
    - `src/lib/constants.ts`: **~0–30%** (used indirectly, but no direct tests)
    - `src/lib/file-manager.ts`: **~0%** (no direct tests found)
    - `src/lib/logger.ts`: **~0%** (no direct tests found)

### `src/cli/` (commands + wizard)
- **Overall `src/cli/*`**: **~35–55%**
  - Covered:
    - `src/cli/doctor.ts` (`test/cli/doctor.test.ts`) **~80%+**
    - `src/cli/uninstall.ts` (`test/cli/uninstall.test.ts`) **~80%+**
    - `src/cli/checkpoint.ts` + `src/cli/restore.ts` (`test/cli/checkpoint.test.ts`) **~75–90%**
    - `src/cli/maturity.ts` (`test/cli/maturity.test.ts`) **unknown but likely solid**
  - Likely under-tested / untested:
    - `src/cli/init.ts` (no direct test spotted)
    - `src/cli/project-detection.ts` (no direct test spotted)
    - `src/cli/migrate.ts`, `src/cli/update.ts`, `src/cli/conflict-resolution.ts` (no direct test spotted)
    - `src/cli/wizard/**` steps and prompt UX (no direct tests spotted; some behavior only indirectly exercised if at all)

### `src/generators/`
- **Overall `src/generators/*`**: **~70–85%**
  - Evidence: `test/generators/agent-generator.test.ts`, `test/generators/skill-generator.test.ts`, plus an integration test `test/generators/agent-generator.integration.test.ts`.

### `src/types/`
- **`src/types/opencode-plugin.d.ts`**: N/A (types-only)

---

## Test Quality Assessment

### What's strong
- **Realistic integration harness**: `test/integration/harness.ts` creates plugin hooks and simulates OpenCode events (`tool.execute.before/after`, `system.transform`, compaction). This is exactly the kind of integration boundary worth testing.
- **Behavioral tests in critical systems**:
  - Workflow phase transitions (read/edit/bash commands) are validated in multiple integration suites (`test/integration/flows/workflow.test.ts`, `test/integration/smoke.test.ts`).
  - Security pipeline tests cover normalization stages and blocked/warned patterns thoroughly (`test/plugin/managers/security-hardening.test.ts`).
- **Temp-dir filesystem tests for CLI**: Doctor/uninstall/checkpoint tests create actual project structures under `tmpdir()` and verify files removed/restored. That's higher fidelity than pure mocks.

### Where quality slips
- **Coverage-driven tests** (low signal):
  - "Schema validation" checks that fields exist (e.g., `SessionState has all required fields...` in `test/plugin/managers/session-manager.test.ts`) are mostly **type-system work**, not runtime behavior.
  - Some tests effectively assert "doesn't crash" via `expect(true).toBe(true)` (found in `test/plugin/managers/tool-interceptor.test.ts` and `test/plugin/managers/system-prompt-injector.test.ts`). These don't validate outputs or side-effects.
- **Brittle performance assertions**
  - Multiple tests assert sub-millisecond / single-digit millisecond thresholds:
    - `test/plugin/managers/security-hardening.test.ts` (`<15ms`, `<50ms`)
    - `test/plugin/managers/tool-interceptor.test.ts` (`<5ms`)
    - `test/plugin/managers/compaction-handler.test.ts`, `todo-enforcer.test.ts`, `error-recovery.test.ts`, etc.
  - These can become flaky across CI runners, laptops under load, or different Bun versions. They also tend to fail for reasons unrelated to correctness.
- **Console monkey-patching risk**
  - `test/cli/doctor.test.ts` replaces `console.log` but (in the excerpt reviewed) does **not restore it** in `afterEach`. This can cause test pollution if any suite relies on normal console behavior.

---

## Missing Test Cases (specific functions/scenarios)

### `src/cli/init.ts` and `src/cli/wizard/**`
High-impact missing coverage because this is the primary onboarding flow.
- `runInitCommand()`:
  - Existing config detection branches:
    - when `AGENTS.md` exists but is unreadable
    - when `.opencode/agent` exists but contains non-`.md` files
    - when directory scans throw (permission errors)
  - Merge confirmation flow:
    - user declines confirmation (ensures no filesystem writes happen)
    - prompt exit (`ExitPromptError`) behavior
  - Agent generation:
    - generator returns mixed created/updated/errors; verify correct summary reporting
- Wizard steps:
  - cancellation at each step returns `cancelled: true` and no files
  - invalid project detection inputs / unknown project type handling
  - permissions preset selection vs custom selection correctness

### `src/cli/project-detection.ts`
- `detectProjectType()`:
  - "generic" fallback when no indicators exist
  - when multiple indicators exist (TypeScript + Node), ensure TypeScript wins (this logic exists)
  - package manager detection matrix:
    - bun lock detection precedence vs package-lock/yarn/pnpm
    - multiple lockfiles present (choose deterministic winner)
  - missing access permissions / unreadable directory behavior

### `src/lib/backup.ts`
- `createBackup()` error paths:
  - backup directory cannot be created (permission denied)
  - partial backup: `.opencode` copy fails mid-way (ensure result is still sane)
  - metadata write failure
- `listBackups()`:
  - missing backup dir returns empty list
  - invalid/missing `backup-metadata.json` is skipped (already implied, but should be asserted)
  - sorting newest-first correctness
- `formatBackupPath()`:
  - path not under `process.cwd()` (should remain unchanged)

### `src/lib/file-manager.ts`
- `exists()`:
  - returns `false` on access errors
- `read()`:
  - propagates errors for missing files
- `write()`:
  - creates nested directories; verify write content
  - errors on invalid basePath permissions
- `remove()`:
  - removes file and directory recursively; safe when file missing
- `ensureDir()`:
  - idempotent

### `src/lib/logger.ts`
- `createLogger()`:
  - ensures meta is appended as JSON
  - ensures level formatting is correct
  - tests should **spy on `console.*`** and restore cleanly

### CLI commands likely missing tests
- `src/cli/migrate.ts`, `src/cli/update.ts`, `src/cli/conflict-resolution.ts`:
  - basic success path + failure path
  - no-op path ("nothing to do")
  - filesystem permission errors
  - idempotency (running twice doesn't break)

---

## Mocking Strategy Evaluation

**Overall: appropriate and restrained.**
- The suite primarily uses:
  - A purpose-built OpenCode context mock (`test/mocks/opencode-context.ts`) that captures `notify`, `log`, and shell commands.
  - Real filesystem operations in temp directories for CLI tests.
- This is a good balance: **mock the platform boundary**, but keep the code under test as real as possible.

**Watch-outs**
- Some tests re-implement mock config locally (e.g., `test/plugin/managers/session-manager.test.ts`) rather than using shared factories (`test/utils/test-helpers.ts` / `test/mocks/index.ts`). This increases drift risk.
- There is some dependency on the environment (e.g., `doctor.ts` uses `execSync` to check `bun/node/opencode`). Tests acknowledge they can't fully control OpenCode presence; consider isolating "command exists" checks behind an injectable function for easier deterministic testing.

---

## Integration Test Coverage

**Good coverage of the plugin lifecycle and core workflow:**
- Hook registration and basic plugin load: `test/integration/smoke.test.ts`
- Workflow transitions driven by simulated tool executions: `test/integration/flows/workflow.test.ts`
- Hook-level behavior around system prompt injection and compaction: exercised via harness and specific integration suites (`test/integration/hooks/*`)

**Key integration gaps**
- No true "CLI integration" tests that run the built CLI entrypoint end-to-end (e.g., `bun run dist/cli/index.js init ...`). Current tests mostly call exported functions.
- Wizard UX correctness isn't integration-tested (prompts, cancellations, and resulting file plan).

---

## Test Anti-patterns Found

- **Performance assertions too strict** (risk: flakiness)
  - Examples include `<5ms`, `<10ms`, `<15ms` checks across multiple suites (matches found in `test/plugin/managers/security-hardening.test.ts`, `test/plugin/managers/tool-interceptor.test.ts`, `test/plugin/managers/compaction-handler.test.ts`, etc.).
- **"Assert true" placeholders** (low value)
  - Found in `test/plugin/managers/tool-interceptor.test.ts` and `test/plugin/managers/system-prompt-injector.test.ts`.
- **Potential test pollution via console patching**
  - `test/cli/doctor.test.ts` captures `console.log` but doesn't clearly restore it (in the portion reviewed). This can leak into other tests.

---

## Recommendations for improving the test suite

1. **Prioritize coverage where production bugs are most likely**
   - Add tests for `src/cli/init.ts`, `src/cli/project-detection.ts`, and the wizard step modules.
   - Add focused unit tests for `src/lib/file-manager.ts`, `src/lib/logger.ts`, and the non-covered branches of `src/lib/backup.ts`.
   - Effort: **Medium (1–2d)**

2. **Reduce flake risk by relaxing or restructuring performance tests**
   - Replace hard time ceilings ("<5ms") with:
     - relative comparisons (cached vs uncached), or
     - coarse ceilings (e.g., "<250ms") that won't flap on CI.
   - Keep one or two high-level perf sanity checks, not many.
   - Effort: **Short (1–4h)**

3. **Replace coverage-only assertions with behavioral assertions**
   - Remove `expect(true).toBe(true)` patterns; instead assert:
     - returned values, side effects (session state changed), or emitted logs/notifications.
   - For "never throws" claims: wrap in `expect(() => fn()).not.toThrow()` (or Bun equivalent for async).
   - Effort: **Short (1–4h)**

4. **Harden test isolation**
   - Ensure any monkey-patching (console, env vars, globals) is restored in `afterEach`.
   - Consider centralizing console capture in `test/utils/test-helpers.ts` to reduce repetition and leaks.
   - Effort: **Quick (<1h)**

5. **Standardize test factories**
   - Prefer `test/mocks/index.ts` / `test/utils/test-helpers.ts` for configs and contexts rather than re-declaring ad-hoc mock configs in individual suites.
   - Effort: **Quick (<1h)**

---

*Review completed: Test Coverage Review*
*Reviewer: Oracle Agent*
