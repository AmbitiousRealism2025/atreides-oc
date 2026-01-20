# Atreides OpenCode — Production Performance Review (TypeScript/Bun)

## Executive Summary
Atreides is generally "bounded by design" in the hottest runtime paths: session state is centralized in `Map`s, tool history is capped (100 entries), persisted tool history is capped (50 entries), and security validation uses an explicit LRU cache (100 entries). The biggest performance risk I see is **unbounded per-session auxiliary state** in a few managers (notably Think Mode), plus a **potentially unsafe/inefficient async auto-save interval** that can overlap saves and create unnecessary concurrent I/O.

If you address (1) auto-save overlap/locking, (2) session cleanup gaps, and (3) "stat per log write", you'll remove the most plausible sources of sustained CPU/I/O load and long-lived memory growth.

---

## Memory Management Assessment

### Session state accumulation (core)
- `src/plugin/managers/session-manager.ts:24` keeps all session states in `const sessions = new Map<string, SessionState>()`.
- Cleanup path is correctly wired: `src/plugin/handlers.ts:229` handles `"session.deleted"` and calls `SessionManager.deleteSession(sessionId)` plus clearing compaction/todo caches.
- **Residual risk**: if OpenCode fails to emit `session.deleted` (crash, abrupt termination), the Map will retain state until process restart. This is normal in many plugin architectures, but it's the primary "leak-shaped" risk in the core.

### Unbounded auxiliary Maps / per-session caches
- **Think Mode session state is not cleared on session end.**
  - `src/plugin/managers/think-mode-manager.ts:38` keeps `private sessionStates: Map<string, ThinkModeState> = new Map();`
  - There is no call in `src/plugin/handlers.ts` `"session.deleted"` to clear ThinkMode state. Over many sessions, this can grow unbounded (small entries, but unbounded count).
- Compaction pending todos are bounded by session lifecycle:
  - `src/plugin/managers/compaction-handler.ts:136` `pendingTodosMap` is cleared in `src/plugin/handlers.ts:268-269` on delete.
- TodoEnforcer per-session Map is cleared:
  - `src/plugin/managers/todo-enforcer.ts:462-464` deletes per session; invoked in `src/plugin/handlers.ts:269`.

### Tool execution trackers
- `src/plugin/managers/tool-interceptor.ts:96` uses `executionTrackers: Map<string, ExecutionTracker>`.
- It deletes tracker entries on `afterExecute` (`src/plugin/managers/tool-interceptor.ts:191-194`).
- **Leak-shaped edge case**: if `beforeExecute` runs but `afterExecute` never fires (hook order disruption / exception upstream), entries remain. There is only `clearTrackers()` (global), not per-session cleanup.

### Metadata growth
- `src/plugin/managers/session-manager.ts:307-315` stores arbitrary `metadata[key] = value` without bounds.
- This is mitigated by usage patterns: error output is truncated (`src/plugin/managers/error-recovery.ts` stores `outputText.substring(0, 500)`), and tool history is capped. Still, metadata is a "soft leak vector" if future features store larger blobs.

**Overall memory assessment:** Mostly bounded, but **ThinkModeManager's `sessionStates` is the clearest unbounded map** in normal operation, and ToolInterceptor trackers can leak under hook failure scenarios.

---

## CPU Hotspots Identified

### Todo parsing & completion detection (bounded but can spike with long text)
- `src/plugin/managers/todo-enforcer.ts:91-103` uses global regexes and calls `matchAll()` into arrays:
  - `const uncheckedMatches = [...aiResponse.matchAll(...)]` etc.
- Completion phrase detection has a nested loop:
  - For each completion regex match, it iterates all todos (`for (const todo of todos.values())`).
- In practice, AI response lengths and todo counts are typically small, so this is rarely a true hotspot, but it's a **theoretical O(matches * todos)**.

### Session logger PII filtering (potentially expensive on larger objects)
- `src/lib/session-logger.ts:184-217` recursively clones and filters objects (`filterPiiFromObject`).
- The logger is careful in some paths (e.g. logs only input summaries in `logToolBefore`), but any future call that logs large objects could amplify CPU.

### Error pattern scanning
- `src/plugin/managers/error-recovery.ts:376-377` checks ~25 regexes against extracted output text.
- This is fine for typical outputs but can get costly if `extractOutputText()` returns very large strings (e.g., huge `stdout` or stack traces).

**Overall CPU assessment:** No obvious O(n²) catastrophes in common paths; hotspots are mostly "text scanning" and "recursive filtering" that become noticeable only with atypically large payloads.

---

## I/O Efficiency Analysis

### State persistence I/O
- `src/lib/state-persistence.ts:275-309` does atomic save via temp file + rename (good).
- `cleanupOldStates()` uses `Promise.all(stat)` for file stats (good), then deletes sequentially (fine).
- **Main issue**: `startAutoSave()` uses `setInterval(async () => { await saveState(...) })` (`src/lib/state-persistence.ts:475-480`).
  - `setInterval` does not await the callback; if `saveState()` takes longer than the interval, **multiple saves can overlap**.
  - Overlap risks:
    - extra CPU/I/O churn
    - contention on `${statePath}.tmp`
    - unnecessary repeated JSON serialization
- `getStateMetadata()` reads and parses the entire JSON file (`src/lib/state-persistence.ts:512-528`) just to extract `savedAt`. This is okay if rarely called, but it's "metadata by full read".

### Session logger I/O (most concerning for steady-state performance)
- `src/lib/session-logger.ts:312-323` does:
  1. `stat(logPath)` on *every* log write
  2. possible rotation
  3. `appendFile(...)`
- In a tool-heavy session with debug logging enabled, this is a lot of syscalls. It's correct but not cheap.

### Generators (CLI-time)
- `src/generators/agent-generator.ts:68` / `src/generators/skill-generator.ts:76` read templates and cache them in `Map`s. This is good for repeated generations within a single process run, but note:
  - `templateCache` has no max size; if templatePath keys can vary widely (unlikely), it could grow.

**Overall I/O assessment:** The core risks are **interval-driven concurrent saves** and **stat-before-append** for logs.

---

## Async Pattern Evaluation

### Parallelism vs sequential awaits
- Cleanup and stats gathering uses `Promise.all` appropriately (`cleanupOldStates`, `cleanupOldLogs`).
- Many deletes are sequential loops; given small bounded file counts, this is acceptable and often safer.

### Async intervals without backpressure
- The most important async pattern issue is the auto-save interval overlap described above (`src/lib/state-persistence.ts:475-480`).
- Recommended pattern: per-session "in-flight" guard (mutex/flag) to prevent overlapping `saveState()` calls, or use `setTimeout` loop that schedules the next tick only after completion.

---

## Resource Lifecycle Issues

### Timers
- Auto-save timers are tracked in `autoSaveTimers: Map<string, ReturnType<typeof setInterval>>` (`src/lib/state-persistence.ts:130`).
- They are stopped on `"session.deleted"` (`src/plugin/handlers.ts:35-37`) and can be stopped globally via `stopAllAutoSave()` on reset.
- **Edge lifecycle gap**: if sessions end without `"session.deleted"`, timers can persist. That's a function of host lifecycle, but you can mitigate by stopping timers on `"session.idle"` after prolonged inactivity, or implementing a TTL/idle cleanup sweep.

### Per-session Maps not fully cleaned
- Think Mode manager should clear session state on session end (currently missing).
- ToolInterceptor could clear any tracker keys starting with `${sessionId}:` on delete for safety.

---

## Startup Performance

### Initialization work
- Plugin init (`src/plugin/index.ts:184-189`) does:
  - `loadConfig(projectPath)` (file read/parse)
  - `initializeLoggingInfrastructure(...)`
- Logging infrastructure init (`src/plugin/handlers.ts:55-125`) can do:
  - `mkdir` for logs/state dirs
  - `cleanupOldLogs()` which `readdir + stat` many files
  - `cleanupOldStates()` which `readdir + stat` many files
- This is reasonable, but **cleanup-on-startup can be noticeable** if users have many retained logs/states (even though caps exist, directories may still be large).

### System prompt injection on first response
- `SystemPromptInjector` caches AGENTS.md for 60s, but the first cache miss does a hierarchical search up to filesystem root (`src/plugin/managers/system-prompt-injector.ts:336-364`). Usually fine, but in deep paths it can be several `access()` calls.

**Startup assessment:** Cold start cost is mostly "cleanup + filesystem checks". Consider deferring cleanup (or throttling it) if startup latency matters.

---

## Recommendations (specific optimizations)

### 1) Prevent overlapping auto-saves (highest impact, correctness + performance)
**Where:** `src/lib/state-persistence.ts:469-506`

- Add a per-session in-flight flag:
  - `private autoSaveInFlight: Set<string> = new Set()`
  - In interval callback:
    - if in-flight, skip
    - else set in-flight, `await saveState`, finally clear
- Or switch from `setInterval` to a `setTimeout`-driven loop that schedules the next run only after completion.

**Why:** avoids concurrent writes, reduces I/O churn, prevents temp-file contention.

---

### 2) Fix ThinkModeManager session map growth (true memory leak vector)
**Where:** `src/plugin/managers/think-mode-manager.ts:38` and `src/plugin/handlers.ts:229-270`

- Add `clearSession(sessionId)` (or reuse existing pattern like `clearSessionTodos`).
- Call it in `"session.deleted"` handler alongside other cleanup:
  - `thinkModeManager?.clearSession(sessionId)` (or expose `getThinkModeManagerInstance()` and call through).

**Why:** prevents unbounded growth across many sessions.

---

### 3) Reduce log-write syscall overhead (stat-per-write)
**Where:** `src/lib/session-logger.ts:311-323`

Primary minimal approach:
- Cache the last known size per sessionId in memory:
  - keep `Map<sessionId, number>` for approximate bytes written
  - increment by `line.length`
  - only `stat()` occasionally (e.g., first write, after rotation, or every N writes / every X seconds)

**Why:** `stat()` on every log entry is expensive under heavy tool usage.

---

### 4) Add per-session cleanup for ToolInterceptor trackers (defensive)
**Where:** `src/plugin/managers/tool-interceptor.ts` + `src/plugin/handlers.ts`

- Add method `clearSessionTrackers(sessionId)` that deletes keys prefixed by `${sessionId}:`.
- Invoke on `"session.deleted"`.

**Why:** prevents tracker map leakage if `afterExecute` isn't called due to host/plugin edge conditions.

---

### 5) Make AGENTS.md resolution cheaper after first find (minor)
**Where:** `src/plugin/managers/system-prompt-injector.ts:293-328`

- Cache `foundPath` (the resolved AGENTS.md path) once discovered.
- On subsequent cache refreshes, check `access(foundPath)` and re-read directly; only fall back to hierarchical scan if missing.

**Why:** avoids re-walking parent directories every 60 seconds.

---

## Effort estimate
**Short (1–4h)** for the top 3 fixes (auto-save overlap, ThinkMode cleanup, ToolInterceptor per-session cleanup).  
**Medium (1–2d)** if you also want to rework session logging rotation/size tracking carefully and add tests/benchmarks.

---

## Watch out for
- **Auto-save overlap is both performance and data-integrity risk** (temp file collisions).
- Any future feature that stores large blobs in `SessionManager.metadata` will become a memory pressure point; consider a small "metadata hygiene" rule (truncate strings, cap arrays).
- Heavy debug logging can become the dominant runtime cost; ensure production defaults minimize log volume.

---

## Escalation triggers (when to consider more complex solutions)
- Sessions routinely exceed hundreds/thousands per process lifetime (e.g., server-style OpenCode host) → implement TTL-based sweeper for per-session maps and timers.
- Persisted state/log directories can grow to thousands of files → consider incremental cleanup or background cleanup on a timer rather than startup.
- Tool outputs are often very large (multi-MB) → switch error scanning to sample/truncate before regex matching (e.g., first/last N KB).

---

*Review completed: Performance Review*
*Reviewer: Oracle Agent*
