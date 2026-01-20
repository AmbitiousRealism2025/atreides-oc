# Production Error Handling Review — Atreides OpenCode (TypeScript/Bun)

## Executive Summary
Atreides has a consistent **"never crash the host"** posture for OpenCode hooks via `wrapHook()` (`src/plugin/utils.ts:50`) and an explicit **3‑strike error recovery protocol** (`src/plugin/managers/error-recovery.ts:551`). This is a good baseline for production stability.

The highest-risk issues are (1) several **`catch {}` blocks that treat *any* failure as "file missing"** and can become destructive (notably merge/update code), and (2) `wrapHook()`'s safe defaults are **fail-open** for security/todo enforcement hooks, meaning internal errors can silently disable protections.

---

## Error Handling Patterns Used

### 1) Fail-safe hook wrapper (catch + fallback)
- Pattern: wrap handler, log error, return safe default
- Location: `src/plugin/utils.ts:50`
- Effect: prevents plugin hook exceptions from bubbling into OpenCode, but **swallows failures** and can change behavior silently.

### 2) Explicit recovery protocol (stateful escalation)
- Pattern: detect error → increment strike → suggest/escalate → reset on success
- Location: `src/plugin/managers/error-recovery.ts:551`
- Integrations:
  - Called from tool-after hook: `src/plugin/handlers.ts:502`
  - User-facing injection into system prompt after strike 2+: `src/plugin/handlers.ts:682`

### 3) "Soft failure" filesystem ops
- Pattern: `catch { /* ignore */ }` to treat missing files as expected
- Common in:
  - `src/lib/merge.ts:295` (config merge & AGENTS merge)
  - `src/lib/backup.ts:23`
  - `src/cli/update.ts:241`

### 4) Module-level console logger with JSON meta
- Pattern: `console.*(format(... JSON.stringify(meta)))`
- Location: `src/lib/logger.ts:10`
- Risk: logging itself can throw if meta is not JSON-serializable.

---

## Critical Issues (Silent Failures / Lost Errors)

### 1) Fail-open defaults in `wrapHook()` undermine safety features
- Location: `src/plugin/utils.ts:16`
- Current safe defaults:
  - `stop: { allow: true }`
  - `"tool.execute.before": { allow: true }`
- Impact:
  - If the **todo enforcer** or **security validator** throws, the plugin defaults to "allow", silently bypassing:
    - strict todo enforcement (`src/plugin/handlers.ts:301`)
    - security validation (`src/plugin/handlers.ts:407`)
- Why this is critical: for production safety controls, fail-open is the wrong default. It's better to **fail-closed** (deny) or **fail-warn** (allow but emit a prominent warning).

### 2) Broad `catch {}` in merge paths can be destructive
- Example: `mergeConfig()` falls back to *creating* `opencode.json` on **any** error:
  - Location: `src/lib/merge.ts:295` with `catch { ... writeFile(...) }` at `src/lib/merge.ts:326`
- Risk scenarios:
  - Invalid JSON in existing config → treated as "missing" → overwritten with template config.
  - Permission error / partial read → treated as "missing" → attempted overwrite.
- Similar pattern exists for AGENTS:
  - `src/lib/merge.ts:349` with `catch { ... writeFile(...) }` at `src/lib/merge.ts:414`

### 3) Config load failures are silent (no reason emitted)
- Location: `src/lib/config.ts:583` catch at `src/lib/config.ts:627`
- Behavior: returns defaults without logging why (missing file vs invalid JSON vs permission).
- Production impact: "why is my config ignored?" becomes hard to debug; also masks corrupted config.

### 4) Logger can throw, breaking error handling in the exact moment you need it
- Location: `src/lib/logger.ts:10`
- `JSON.stringify(meta)` can throw on:
  - circular references
  - `BigInt` values
  - certain non-serializable structures
- This is especially dangerous because `wrapHook()` relies on logging in the `catch` path (`src/plugin/utils.ts:60`). If `logger.error(...)` throws, the hook wrapper can fail unexpectedly and you lose the fallback behavior.

---

## Unhandled Edge Cases

### 1) Async timer callback potential unhandled rejection
- Location: `src/lib/state-persistence.ts:469`
- `setInterval(async () => { await this.saveState(...) })`
- Today, `saveState()` *mostly* catches and returns `false` (`src/lib/state-persistence.ts:275`), but if anything throws above that (future changes, unexpected exception), `setInterval` won't handle it.

### 2) Error recovery "success" resets may be optimistic
- Location: `src/plugin/managers/error-recovery.ts:624`
- The strike count resets on any tool output that doesn't match patterns and doesn't show structural errors.
- If a tool fails without emitting recognized patterns/exitCode/error fields, the system may **prematurely reset** and never escalate.

### 3) Extensive swallowing of filesystem errors in CLI utilities
- Example patterns:
  - `src/lib/backup.ts:46` per-file copy `catch {}` → skip silently
  - `src/cli/update.ts:255` template discovery loops swallow all errors
- This is acceptable for "best-effort", but currently lacks **differentiation** between expected (ENOENT) and unexpected (EACCES, corruption).

---

## Logging Quality Assessment

### Strengths
- Consistent namespacing: `createLogger("atreides:...")` across modules (e.g. `src/plugin/handlers.ts:40`).
- Includes useful structured context in many logs (sessionId, tool, strikeCount).

### Gaps / Risks
- **No safe serialization** in base logger (`src/lib/logger.ts:10`).
- **Potential PII leakage**: plugin logs go straight to console, while PII filtering is only applied in session/state persistence paths (`src/lib/session-logger.ts:299`, `src/lib/state-persistence.ts:218`).
- Many important "fallback to default behavior" paths do not emit a warning (notably `loadConfig()`).

---

## Error Recovery Evaluation

### What works well
- The protocol is explicit, understandable, and stateful:
  - detection: `detectError()` (`src/plugin/managers/error-recovery.ts:368`)
  - escalation message: `generateEscalationMessage()` (`src/plugin/managers/error-recovery.ts:732`)
- Good integration into user-visible guidance:
  - system prompt injection at strike 2+ (`src/plugin/handlers.ts:726`)

### What's missing for production
- More "hard" signals: pattern matching is helpful but should be complemented with standardized tool result schemas where possible.
- Clear separation of:
  - "tool failed" (operational error)
  - "plugin internal error" (Atreides bug / unexpected state)

Right now, internal errors are mostly **only in logs** and otherwise become silent fallbacks via `wrapHook()`.

---

## Recommendations (Minimal Path, With Examples)

### 1) Make hook fallback behavior safe for security/todo enforcement (fail-closed or fail-warn)
**Effort: Short (1–4h)**

Primary recommendation: adjust `SAFE_DEFAULTS` in `src/plugin/utils.ts:16` so that failure in critical hooks does not silently allow risky operations.

Example (fail-warn approach, minimal disruption):
```ts
// src/plugin/utils.ts
const SAFE_DEFAULTS: HookSafeDefaults = {
  // ...
  stop: { allow: true, message: "[ATREIDES WARNING] stop hook failed; enforcement skipped" },
  "tool.execute.before": { allow: true, message: "[ATREIDES WARNING] security hook failed; validation skipped" },
  // ...
};
```

Safer alternative (fail-closed for security only):
```ts
"tool.execute.before": {
  allow: false,
  message: "[SECURITY] Tool blocked because validation failed internally.",
},
```

### 2) Narrow `catch {}` to expected errors (ENOENT) in merge/write flows
**Effort: Medium (1–2d)**

For functions like `mergeConfig()` and `mergeAgentsMd()` in `src/lib/merge.ts:295`, distinguish:
- ENOENT → create new file (expected)
- Syntax/parsing errors → surface to user as conflict/error
- EACCES/EPERM → return failure and stop

Example pattern:
```ts
try {
  const currentContent = await readFile(configPath, "utf-8");
  // parse + merge...
} catch (err) {
  if ((err as NodeJS.ErrnoException).code === "ENOENT") {
    // create file
  } else {
    // return error result with err.message
  }
}
```

### 3) Make `loadConfig()` log why it fell back to defaults
**Effort: Quick (<1h)**

In `src/lib/config.ts:583`, capture the error and emit a warning (including `configPath` and error.message). This dramatically improves diagnosability without changing behavior.

### 4) Make `createLogger()` "never throw" (safe stringify + truncation)
**Effort: Quick (<1h)**

Wrap JSON serialization:
- if meta can't be stringified → replace with `{ metaError: "...", metaType: typeof meta }`
- optionally truncate huge meta strings

Example:
```ts
let metaStr = "";
try { metaStr = meta ? ` ${JSON.stringify(meta)}` : ""; }
catch { metaStr = " {\"meta\":\"[unserializable]\"}"; }
```

### 5) Wrap async timer callbacks with a top-level try/catch
**Effort: Quick (<1h)**

In `src/lib/state-persistence.ts:475`, ensure no unhandled rejections:
```ts
const timer = setInterval(() => {
  void (async () => {
    try { /* ... */ }
    catch (e) { logger.error("Auto-save failed", { sessionId, error: String(e) }); }
  })();
}, interval);
```

---

## Summary of Highest-Priority Fixes
- Change `wrapHook()` defaults for `"tool.execute.before"` and `stop` to avoid fail-open bypass (`src/plugin/utils.ts:16`).
- Replace broad `catch {}` in merge paths with error-aware handling (`src/lib/merge.ts:295`).
- Make logging and config fallback paths diagnosable and non-throwing (`src/lib/logger.ts:10`, `src/lib/config.ts:583`).

---

*Review completed: Error Handling Review*
*Reviewer: Oracle Agent*
