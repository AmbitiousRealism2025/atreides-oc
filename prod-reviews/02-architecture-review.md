# Atreides OpenCode — Production Architecture Code Review (TypeScript/Bun)

## Executive Summary
Atreides has a clear "composition root + manager set" architecture: `src/plugin/index.ts` wires OpenCode hooks to focused managers (workflow, security, error recovery, todos, compaction, notifications, think-mode). This is a strong baseline for maintainability and feature growth.

The main architectural risk is **state and dependency coupling**: `SessionManager` is a global singleton and many managers mutate shared state directly, while "auxiliary state" (todos/pending todos) is stored in multiple places. There's also a mild layering violation where `src/lib/state-persistence.ts` imports plugin types (even if type-only), which complicates boundaries.

---

## Architecture Strengths

### 1) Clear composition root + hook orchestration
- `src/plugin/index.ts` is the assembly point: loads config, initializes infra, registers hooks, wraps in `wrapHook()` for "fail-open" safe defaults.
- `src/plugin/handlers.ts` cleanly maps each OpenCode hook to a cohesive pipeline (security → tool tracking → error recovery → workflow updates → todo bookkeeping).

### 2) Manager pattern is consistent and readable
Managers are logically separated:
- **State**: `src/plugin/managers/session-manager.ts`
- **Workflow**: `src/plugin/managers/workflow-engine.ts`
- **Security**: `src/plugin/managers/security-hardening.ts` + `src/plugin/managers/tool-interceptor.ts`
- **Reliability**: `src/plugin/managers/error-recovery.ts`
- **Continuity**: `src/plugin/managers/compaction-handler.ts`
- **Governance**: `src/plugin/managers/todo-enforcer.ts`
- **UX**: `src/plugin/managers/notification-manager.ts`, `src/plugin/managers/think-mode-manager.ts`
- **Prompt integration**: `src/plugin/managers/system-prompt-injector.ts`, `src/plugin/managers/identity-manager.ts`

This modularity makes it easy to reason about responsibilities and test them in isolation.

### 3) Strong "operational safety" posture
- `wrapHook()` provides safe defaults and prevents hook failures from breaking OpenCode (`src/plugin/utils.ts`).
- Security-hardening is designed as a deterministic pipeline with compiled patterns, plus "deny vs warn" semantics (`src/plugin/managers/security-hardening.ts`).
- PII filtering exists for both logs and persisted state (`src/lib/session-logger.ts`, `src/lib/state-persistence.ts`).

### 4) Extensible workflow engine
`WorkflowEngine` uses a clean heuristic strategy:
- Tool→phase mapping + special-case bash parsing (`src/plugin/managers/workflow-engine.ts`)
- Explicit allowed transition graph (`VALID_TRANSITIONS`)
- Phase history recorded for debugging and analytics

---

## Architecture Weaknesses

### 1) Layering boundary leak: `lib` depends on `plugin` types
- `src/lib/state-persistence.ts` has: `import type { SessionState, WorkflowPhase } from "../plugin/types.js";`

Even though it's `import type`, it still establishes that "lib knows plugin", which is an architecture smell. `src/lib/*` is used by CLI and generators too, so it should not conceptually depend on `src/plugin/*`.

**Impact**
- Harder to refactor plugin types without touching `lib`
- Increases chances of circular dependency pressure over time
- Blurs package boundaries (what is reusable vs plugin-only?)

### 2) "Singleton everywhere" increases hidden coupling
Patterns observed:
- `SessionManager` is a module-level `Map` singleton (`src/plugin/managers/session-manager.ts`).
- `handlers.ts` holds module-level instances for session logger/state persistence/notifications/think mode (`src/plugin/handlers.ts`).
- Several managers also expose singleton accessors (e.g., `getThinkModeManager()` pattern).

**Impact**
- Makes "multiple plugin instances in one process" harder (multi-project / hot reload / tests)
- Encourages implicit cross-module state sharing
- Can lead to subtle contamination if OpenCode ever runs plugins in shared processes across worktrees

### 3) State duplication (todos and compaction)
There are multiple sources of truth for todo-like data:
- `SessionState` tracks counts (`todoCount`, `todosCompleted`, `todosCreated`)
- `TodoEnforcer` keeps its own per-session `Map<todoId, TodoItem>` (`src/plugin/managers/todo-enforcer.ts`)
- `CompactionHandler` separately stores pending todos from `todowrite` outputs (`pendingTodosMap`) (`src/plugin/managers/compaction-handler.ts`)

**Impact**
- Drift risk: the "real todos" and "pending todos for compaction" can disagree
- Harder to evolve the todo model (IDs, statuses, multiple todo sources) without bugs

### 4) Tool execution tracking has a concurrency collision vector
`ToolInterceptor` tracks in-flight executions via:
- key = `${sessionId}:${tool}` (`src/plugin/managers/tool-interceptor.ts`)

If OpenCode can run two same-named tools concurrently (or re-entrantly) per session, durations can be computed incorrectly and trackers can be overwritten.

Even if today tools are sequential, this is a fragile assumption.

### 5) Public surface area is very broad
`src/plugin/index.ts` exports many managers and internals directly (SessionManager, WorkflowEngine, ToolInterceptor, etc.). This effectively makes internal architecture a public API.

**Impact**
- Makes refactoring expensive (breaking downstream users)
- Increases coupling between "plugin consumers" and internal implementation details
- Encourages "reach inside" usage instead of stable interfaces

### 6) Metadata is untyped at the boundary
`SessionState.metadata: Record<string, unknown>` is flexible, but modules store structured data under string keys like `"workflowStarted"`, `"stilgarEscalation"`, `"lastError"`, `"errorRecovery"`, etc.

**Impact**
- Typos become runtime bugs
- Schema evolution is ad-hoc
- Cross-module invariants are not enforced by TypeScript

---

## Coupling Analysis

### High-coupling nodes
- **`SessionManager`** is a hub dependency for most managers.
- **`handlers.ts`** imports nearly all managers; it's an unavoidable "hub" but also a coupling hotspot.
- **`plugin/index.ts`** exports almost everything, turning internal coupling into external coupling.

### Dependency diagram (simplified)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        OpenCode Runtime                              │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    src/plugin/index.ts                               │
│              (composition root + hook registration)                  │
└─────────────────────────────────────────────────────────────────────┘
                    │                           │
                    ▼                           ▼
        ┌───────────────────┐        ┌─────────────────────┐
        │ src/lib/config.ts │        │ src/lib/logger.ts   │
        └───────────────────┘        └─────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    src/plugin/handlers.ts                            │
│                    (hook pipeline orchestrator)                      │
└─────────────────────────────────────────────────────────────────────┘
            │           │           │           │           │
            ▼           ▼           ▼           ▼           ▼
     ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
     │ Session  │ │ Workflow │ │   Tool   │ │  Error   │ │  System  │
     │ Manager  │ │  Engine  │ │Interceptor│ │ Recovery │ │  Prompt  │
     └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
            │                       │
            │                       ▼
            │               ┌──────────────┐
            │               │   Security   │
            │               │  Hardening   │
            │               └──────────────┘
            │
            ▼
     ┌──────────────────────────────────────────────────────────────┐
     │                    src/lib/* utilities                        │
     │  (session-logger, state-persistence, file-manager, etc.)      │
     └──────────────────────────────────────────────────────────────┘
                                    │
                            (type-only import)
                                    ▼
                         ┌────────────────────┐
                         │ src/plugin/types.ts│  ← BOUNDARY VIOLATION
                         └────────────────────┘
```

Key observation: `src/lib/state-persistence.ts` reaching into `src/plugin/types.ts` is the architectural boundary violation (even if type-only).

---

## Cohesion Analysis

### Strong cohesion
- `WorkflowEngine` is cohesive: phase rules, detection, transitions, and guidance generation are all tightly related.
- `SystemPromptInjector` is cohesive: read + validate + cache + inject, with a clean "duplicate injection marker" mechanism.
- `SecurityHardening` is cohesive: deterministic validation pipeline and pattern catalogs.

### Mixed cohesion
- `handlers.ts` is a deliberate "pipeline orchestrator", but it also owns lifecycle of logging/state persistence/notifications. This is fine as a composition root, but it is beginning to look like a "god module" as features grow.

Recommendation: keep `handlers.ts` as the pipeline root, but move "infrastructure lifecycle" into a small `RuntimeServices` object or factory to reduce the sense that `handlers.ts` is both "orchestration + service container".

---

## Design Pattern Evaluation

### Manager pattern
- Used consistently and appropriately.
- The singletons (`getX()`) are convenient but create hidden coupling and make multi-instance scenarios difficult.

### Interceptor pattern
- `ToolInterceptor` is a good use of an interceptor: it centralizes validation and tracking and keeps hook logic simpler.

### Strategy/Rules engines
- `WorkflowEngine` is effectively a rule engine / strategy system (tool mapping + transition rules), implemented simply and readably.

### Hook wrapper / fail-open safety
- `wrapHook()` provides consistent error containment and safe defaults; this is very appropriate for plugin ecosystems.

---

## Scalability Assessment

### What scales well
- Adding new "capabilities" (managers) is straightforward: add manager + attach into handler pipeline.
- Performance is considered throughout (history limits, TTL caching, rotation policies).

### What will start to hurt as the project grows
- `SessionManager` as a shared mutable global is the coupling bottleneck.
- Metadata keys and "side maps" (todos, compaction pending todos) will accumulate schema drift.
- Broad re-exports from `src/plugin/index.ts` will constrain refactors.

---

## Recommendations for Improvement (single primary path)

### Primary recommendation: Introduce a small "Core" layer and reduce duplicated state
Goal: **keep your current patterns**, but tighten boundaries and make state more coherent.

**Action plan**
1. **Create a shared core types module** (e.g. `src/core/types.ts`) containing `SessionState`, `WorkflowPhase`, and related primitives currently in `src/plugin/types.ts`.
   - Plugin types can re-export these for OpenCode consumers, but `lib/` should depend on `core/`, not `plugin/`.
   - Update `src/lib/state-persistence.ts` to import from `src/core/types.ts` instead of `src/plugin/types.ts`.
2. **Unify todo state** so there's one source of truth:
   - Either store todo items in `SessionState` (recommended), or store them in `SessionState.metadata` under a typed key.
   - Update `TodoEnforcer` to read/write through that single store (and remove/limit its separate `sessionTodos` map).
   - Update `CompactionHandler` to derive pending todos from the same store instead of a separate `pendingTodosMap`.
3. **Harden ToolInterceptor tracking** by allowing multiple in-flight executions per tool:
   - Change `executionTrackers` to `Map<string, ExecutionTracker[]>` (stack/queue), keyed by `${sessionId}:${tool}`.
   - On `beforeExecute`, push tracker; on `afterExecute`, pop the most recent tracker.
4. **Type metadata keys** to reduce drift:
   - Add a `SessionMetadata` interface and wrapper helpers like `getMetadata<K extends keyof SessionMetadata>(...)`.
   - This is a low-cost way to prevent typos and clarify cross-module contracts.
5. **Define a narrower public API surface**:
   - Keep `src/plugin/index.ts` exporting the plugin function + stable types.
   - Move "internal exports" to `src/plugin/internal.ts` (or avoid exporting them) so refactors don't become breaking changes.

**Effort estimate**: **Medium (1–2 days)**  
- Steps (1) and (3) are **Short (1–4h)** each.
- Steps (2) and (4)/(5) depend on how many call sites rely on the existing todo maps / metadata patterns.

---

## Why this approach
- It preserves your existing architecture (managers + handler pipelines) and avoids adding new libraries or frameworks.
- It targets the most impactful long-term risks: boundary drift (`lib`↔`plugin`), duplicated state, and weak contracts.
- It makes the codebase easier to evolve without rewriting the plugin.

---

## Watch out for
- **Behavioral compatibility**: if any external consumer imports internals from `src/plugin/index.ts`, narrowing exports could be breaking. Consider deprecating gradually (keep exports but mark "internal" in docs).
- **Todo matching semantics**: if you unify todo storage, be careful to preserve the current content-hash ID behavior in `TodoEnforcer` to avoid regressions in "duplicate prevention".
- **Assumptions about tool execution ordering**: hardening `ToolInterceptor` is safest even if OpenCode is currently sequential.

---

## Escalation triggers (when to revisit with a more complex approach)
- OpenCode introduces true parallel tool execution per session (you'll want invocation IDs in hook payloads).
- You want to support multiple projects/worktrees in a single long-lived OpenCode process (you'll want instance-based state rather than module singletons).
- Plugin feature count grows significantly (10–15+ managers), at which point a lightweight internal "event bus" or explicit pipeline stages may reduce `handlers.ts` complexity.

---

### Alternative sketch (only if needed later)
If multi-instance becomes a requirement: introduce a `PluginRuntime` object created per `AtreidesPlugin(context)` call, containing `SessionStore`, `NotificationService`, `PersistenceService`, etc., and have hooks close over that runtime instead of using module singletons.

This is intentionally not the recommended first step—your current architecture is "working well"; the core/type boundary + state unification gets most of the value with far less complexity.

---

*Review completed: Architecture Code Review*
*Reviewer: Oracle Agent*
