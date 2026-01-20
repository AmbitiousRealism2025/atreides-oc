# Production Type Safety Review — Atreides OpenCode (TypeScript/Bun, strict)

## Executive Summary
Atreides is *mostly* strongly typed: strict compiler settings are excellent (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), and the public plugin types are thoughtfully modeled with unions and well-scoped interfaces (`src/plugin/types.ts`). The main type-safety gaps come from **unvalidated external data** (notably `JSON.parse` returning implicit `any`) and a handful of **type assertions** that bypass narrowing rather than encoding it as reusable type guards.

Net: compile-time type safety is high, but runtime entry points create "type holes" that could lead to production-only failures or silent misbehavior.

## Type Coverage Score (estimate)
**~92–96% typed at compile-time** (high confidence)

Rationale:
- No explicit `any` usage found in `src/**/*.ts` (search hits were comment-only).
- Widespread use of `unknown` at boundaries is good.
- However, **`JSON.parse()` returns `any`**, and multiple call sites accept it without converting to `unknown` + validating. Those sites effectively create escape hatches from strict mode.

---

## Type Safety Violations Found

### 1) Implicit `any` via `JSON.parse` (high impact)
`JSON.parse` returns `any`, so assigning its result into typed variables is *unchecked*, even in strict mode.

Examples:
- `src/lib/checkpoint-manager.ts:434` — `return JSON.parse(manifestContent);` while function promises `Checkpoint | undefined`.
- `src/cli/update.ts:284` — `templates.opencodeJson = JSON.parse(content);` while expecting `Record<string, unknown>`.
- `src/cli/doctor.ts:621` and `src/cli/doctor.ts:728` — `const config = JSON.parse(content);` then used as if structured.
- `src/lib/manifest.ts:178` — `JSON.parse(content) as CustomizationManifest` (typed but not validated).

Why this matters: malformed or unexpected JSON produces values that look well-typed to the compiler, but can crash or cause incorrect logic at runtime.

### 2) Unsafe/non-ideal type assertions (medium impact)
These don't necessarily break today, but they're where correctness depends on *informal assumptions*.

- Double-cast to preserve generic signature:
  - `src/plugin/utils.ts:72` — `return wrapped as unknown as T;`
- Boundary casts of `unknown` → record without reusable guard:
  - `src/plugin/managers/security-hardening.ts:859` and `src/plugin/managers/security-hardening.ts:902` — `input as Record<string, unknown>`
  - `src/plugin/managers/tool-interceptor.ts:344` — `output as Record<string, unknown>`
  - `src/plugin/managers/workflow-engine.ts:514` — `input as Record<string, unknown>`
- "String from Object.entries" casts:
  - `src/plugin/managers/workflow-engine.ts:639` / `src/plugin/managers/workflow-engine.ts:651` — `intent as IntentType` (works, but encodes a trust boundary rather than narrowing).

### 3) Non-null assertion operator `!` (low-medium impact)
- `src/lib/checkpoint-manager.ts:483` — `options.files!.includes(...)`

This is likely safe due to the ternary check, but it's still a bypass. Prefer restructuring so the compiler can narrow without `!`.

---

## Null Safety Assessment
**Strong overall.**

Positive signals:
- Strict settings include `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` (`tsconfig.json:31-32`), which is a strong baseline.
- Many boundary checks correctly guard `null`/`undefined` before object inspection (e.g., `src/plugin/managers/tool-interceptor.ts:339-344`).
- Optional fields on outputs are handled defensively (e.g., `error instanceof Error ? ... : String(error)` appears frequently).

Weak points:
- Some flows still use assertions (`!`, `as Record<string, unknown>`) where a small helper guard would improve safety and readability.

---

## Interface Design Quality
**High quality in core plugin types; "boundary types" are intentionally broad.**

Strengths:
- `src/plugin/types.ts` is well-structured: unions for lifecycle/state (`WorkflowPhase`, `IntentType`, `SecurityAction`) and clear, minimal interfaces.
- Tool output contract (`ToolOutput`) is documented and matches how tool outputs vary—pragmatic for a plugin ecosystem.
- Session state uses explicit timestamps and scoped metadata: `metadata: Record<string, unknown>` (reasonable for extensibility).

Areas to tighten (without overengineering):
- `OpenCodeClient.log?: (level: string, ...)` and `notify?: (event: string, ...)` are broad by necessity, but internal code could wrap these in a typed facade using unions like `NotificationEventType` (`src/plugin/types.ts:703-714`).

---

## Runtime Validation Gaps (highest priority)
Key external-data entry points lacking runtime validation:
- JSON config/state/manifest:
  - `src/lib/config.ts:588` (`JSON.parse` + partial validation is good start, but doesn't validate array contents, nested objects deeply, etc.)
  - `src/lib/state-persistence.ts:327` (`PersistedSessionState` loaded via cast, no shape validation)
  - `src/lib/manifest.ts:178`
  - `src/lib/checkpoint-manager.ts:434`
- CLI reads:
  - `src/cli/update.ts:284`
  - `src/cli/doctor.ts:621`
- Network boundary:
  - `src/lib/version.ts:42` (`fetch` from npm registry) — ensure response JSON shape is validated before use.

Mitigation should be lightweight: small type-guard functions + "parse + validate or fallback" pattern (no need to add a heavy schema library unless you want one).

---

## Type Export Analysis
**Good public API surface; one possible drift risk.**

What's good:
- `src/plugin/index.ts:84-148` exports a wide set of types and concrete managers, making the package usable for TS consumers.
- The repo includes `src/types/opencode-plugin.d.ts` to describe/augment upstream plugin types, which improves DX.

Potential issue:
- `src/types/opencode-plugin.d.ts:1-58` defines a `PluginContext` shape that differs from `src/plugin/types.ts:55-66`. If OpenCode's real runtime shape changes, you can get **declaration drift** where the package compiles but consumer typings become misleading. Consider consolidating or clearly separating "upstream module typings" vs "Atreides internal plugin context".

---

## Recommendations for Stricter Type Safety (single primary path)

1) **Introduce small reusable runtime type guards** (Quick)
   - Add a `isRecord(value: unknown): value is Record<string, unknown>` helper.
   - Add `isString`, `isNumber`, `isBoolean`, `isArrayOfStrings`, etc.
   - Replace repeated `input as Record<string, unknown>` with `if (!isRecord(input)) return undefined;`.

2) **Wrap JSON parsing behind `parseJsonUnknown()`** (Short)
   - Pattern: `const data: unknown = JSON.parse(content);`
   - Then validate with a type guard per domain object: `isCheckpoint`, `isCustomizationManifest`, `isPersistedSessionState`.
   - On failure, return `null`/defaults and log a warning (you already do this philosophy in `loadConfig`).

3) **Eliminate `!` and "double casts" where possible** (Quick/Short)
   - Rewrite `src/lib/checkpoint-manager.ts:483` to allow natural narrowing (store `const files = options.files; if (files) ...`).
   - For `wrapHook`, consider returning a correctly typed wrapper without `as unknown as T` (or at least reduce to a single cast and tighten generic constraint to `unknown[]`).

4) **Add minimal validation for `fetch` responses** (Quick)
   - For `src/lib/version.ts:42`, validate expected fields (e.g., `version` or `dist-tags`) before using.

---

## Effort Estimate
**Short (1–4h)** for adding guards + applying to the most critical `JSON.parse` sites (config/state/manifest/checkpoint).  
**Medium (1–2d)** if you want full coverage across all CLI parsing and all manager boundary parsing.

---

## Escalation Triggers (when to consider a more complex solution)
Move to a schema library (e.g., Zod/Valibot) only if:
- You need to validate many nested structures and keep them in sync with types frequently, or
- You start ingesting lots of untrusted JSON from users/plugins and want standardized error reporting.

**Alternative sketch (advanced path)**
- Add a schema library and define schemas for `Config`, `CustomizationManifest`, `PersistedSessionState`, `Checkpoint`.
- Use `schema.safeParse()` at all boundaries, and derive TS types from schemas to prevent drift.

---

*Review completed: Type Safety Review*
*Reviewer: Oracle Agent*
