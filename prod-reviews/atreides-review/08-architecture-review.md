# Atreides OpenCode - Architecture Review

**Review Date**: 2026-01-19
**Reviewer**: Senior Software Architect
**Version Reviewed**: 0.1.0
**Codebase Path**: `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc`

---

## Executive Summary

### Overall Architecture Rating: B+

Atreides OpenCode demonstrates a well-designed plugin architecture for AI orchestration with clear separation of concerns, comprehensive type safety, and thoughtful error handling. The codebase shows strong architectural foundations with a hook-based plugin system, centralized state management, and modular manager classes. However, there are opportunities for improvement in dependency injection patterns, interface abstraction, and scalability considerations.

**Key Strengths**:
- Excellent type safety with comprehensive TypeScript interfaces
- Clean hook-based plugin architecture following OpenCode's patterns
- Centralized state management with clear lifecycle semantics
- Comprehensive security hardening with multi-layer validation
- Well-documented code with detailed JSDoc comments
- Solid test infrastructure with integration harness

**Key Concerns**:
- Module-level singleton patterns reduce testability
- Tight coupling between managers and SessionManager
- Limited abstraction for external dependencies
- In-memory state storage limits horizontal scaling

---

## Architecture Diagram Description

```
+-----------------------------------------------------------------------------------+
|                              Atreides OpenCode Plugin                              |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |                           CLI Layer (src/cli/)                               |  |
|  |   +----------+  +--------+  +--------+  +----------+  +-----------+         |  |
|  |   |  index   |  | doctor |  |  init  |  | maturity |  | checkpoint|         |  |
|  |   +----------+  +--------+  +--------+  +----------+  +-----------+         |  |
|  |   | migrate  |  | restore|  |uninstall| | update   |  | wizard/*  |         |  |
|  +---|----------|--|--------|--|---------|---------------|-----------|----------+  |
|      |          |  |        |  |         |               |           |             |
|      +----------+--+--------+--+---------+---------------+-----------+             |
|                                      |                                             |
|                                      v                                             |
|  +-----------------------------------------------------------------------------+  |
|  |                        Plugin Core (src/plugin/)                             |  |
|  |                                                                              |  |
|  |   +----------------+     +----------------+     +----------------+           |  |
|  |   |    index.ts    |---->|   handlers.ts  |---->|    types.ts    |           |  |
|  |   | (Entry Point)  |     | (Hook Factory) |     | (Type Defs)    |           |  |
|  |   +----------------+     +----------------+     +----------------+           |  |
|  |          |                      |                                            |  |
|  |          v                      v                                            |  |
|  |   +----------------+     +----------------+                                  |  |
|  |   |    utils.ts    |     |   managers/    |<--- Manager Layer                |  |
|  |   | (Hook Wrappers)|     +----------------+                                  |  |
|  |   +----------------+            |                                            |  |
|  |                                 v                                            |  |
|  +-----------------------------------------------------------------------------+  |
|                                    |                                              |
|  +-----------------------------------------------------------------------------+  |
|  |                        Managers Layer (src/plugin/managers/)                  |  |
|  |                                                                              |  |
|  |  +-------------------+  +-------------------+  +-------------------+         |  |
|  |  | session-manager   |  | workflow-engine   |  | error-recovery    |         |  |
|  |  | (State Storage)   |  | (Phase Tracking)  |  | (3-Strike Proto)  |         |  |
|  |  +-------------------+  +-------------------+  +-------------------+         |  |
|  |           |                     |                      |                     |  |
|  |  +-------------------+  +-------------------+  +-------------------+         |  |
|  |  | security-hardening|  | tool-interceptor  |  | todo-enforcer     |         |  |
|  |  | (Validation)      |  | (Tool Tracking)   |  | (Task Tracking)   |         |  |
|  |  +-------------------+  +-------------------+  +-------------------+         |  |
|  |           |                     |                      |                     |  |
|  |  +-------------------+  +-------------------+  +-------------------+         |  |
|  |  | notification-mgr  |  | compaction-handler|  | identity-manager  |         |  |
|  |  | (Event Alerts)    |  | (State Preserve)  |  | (Persona Config)  |         |  |
|  |  +-------------------+  +-------------------+  +-------------------+         |  |
|  |           |                     |                      |                     |  |
|  |  +-------------------+  +-------------------+                                |  |
|  |  | think-mode-manager|  | system-prompt-    |                                |  |
|  |  | (Model Switching) |  |     injector      |                                |  |
|  |  +-------------------+  +-------------------+                                |  |
|  +-----------------------------------------------------------------------------+  |
|                                    |                                              |
|  +-----------------------------------------------------------------------------+  |
|  |                        Library Layer (src/lib/)                              |  |
|  |                                                                              |  |
|  |  +------------+  +------------+  +------------+  +------------+             |  |
|  |  |  config    |  |   logger   |  |  backup    |  |   merge    |             |  |
|  |  +------------+  +------------+  +------------+  +------------+             |  |
|  |  +------------+  +------------+  +------------+  +------------+             |  |
|  |  | session-   |  |  state-    |  | checkpoint-|  | file-      |             |  |
|  |  |   logger   |  | persistence|  |   manager  |  |   manager  |             |  |
|  |  +------------+  +------------+  +------------+  +------------+             |  |
|  |  +------------+  +------------+  +------------+                             |  |
|  |  | constants  |  |  manifest  |  |  version   |                             |  |
|  |  +------------+  +------------+  +------------+                             |  |
|  +-----------------------------------------------------------------------------+  |
|                                    |                                              |
|  +-----------------------------------------------------------------------------+  |
|  |                     Generators Layer (src/generators/)                       |  |
|  |                                                                              |  |
|  |  +------------------+  +------------------+  +------------------+            |  |
|  |  | agent-generator  |  | skill-generator  |  | types/skill-types|            |  |
|  |  +------------------+  +------------------+  +------------------+            |  |
|  +-----------------------------------------------------------------------------+  |
|                                                                                   |
+-----------------------------------------------------------------------------------+
                                        |
                                        v
+-----------------------------------------------------------------------------------+
|                            External Dependencies                                   |
|                                                                                   |
|  +----------------+  +----------------+  +----------------+                       |
|  | OpenCode API   |  | File System    |  | @inquirer/     |                       |
|  | (Plugin Host)  |  | (node:fs)      |  |   prompts      |                       |
|  +----------------+  +----------------+  +----------------+                       |
+-----------------------------------------------------------------------------------+
```

### Data Flow Overview

1. **Plugin Initialization**: `AtreidesPlugin` function receives `PluginContext` from OpenCode
2. **Hook Registration**: 6 hooks registered for session lifecycle and tool interception
3. **State Management**: `SessionManager` maintains `Map<sessionId, SessionState>`
4. **Tool Execution**: Security validation -> Phase tracking -> Error recovery -> Logging
5. **System Prompt**: Identity + AGENTS.md + Phase guidance injected via transform hook

---

## Component Analysis with Coupling Assessment

### 1. Plugin Core (`src/plugin/`)

| Component | Responsibility | Afferent Coupling (Ca) | Efferent Coupling (Ce) | Instability (I) |
|-----------|---------------|------------------------|------------------------|-----------------|
| index.ts | Plugin entry, hook export | 0 (entry point) | 6 | 1.0 (unstable) |
| handlers.ts | Hook factory functions | 1 | 8 | 0.89 |
| types.ts | Type definitions | 8 | 1 | 0.11 (stable) |
| utils.ts | Hook wrappers, utilities | 2 | 2 | 0.5 |

**Assessment**: The plugin core follows a clean architecture with `types.ts` as a stable foundation. `handlers.ts` has high efferent coupling (depends on many managers), which is acceptable as a composition layer.

### 2. Managers (`src/plugin/managers/`)

| Manager | Responsibility | Inbound Deps | Outbound Deps | Coupling Risk |
|---------|---------------|--------------|---------------|---------------|
| session-manager | State storage (Map) | 10 | 2 | **HIGH** (god object risk) |
| workflow-engine | Phase transitions | 3 | 1 | Low |
| error-recovery | 3-strike protocol | 2 | 1 | Low |
| security-hardening | Command validation | 2 | 1 | Low |
| tool-interceptor | Tool call tracking | 2 | 2 | Low |
| todo-enforcer | Task tracking | 2 | 1 | Low |
| notification-manager | Event notifications | 2 | 2 | Low |
| compaction-handler | State preservation | 2 | 1 | Low |
| identity-manager | Persona config | 1 | 1 | Low |
| system-prompt-injector | Prompt injection | 1 | 2 | Low |
| think-mode-manager | Model switching | 1 | 1 | Low |

**Critical Finding**: `session-manager` is a coupling hotspot. 10 managers depend directly on it. While this centralizes state access (a valid pattern), it creates a bottleneck and testing complexity.

### 3. Library Layer (`src/lib/`)

| Module | Responsibility | Stability |
|--------|---------------|-----------|
| config.ts | Configuration loading/validation | High |
| logger.ts | Console logging wrapper | High |
| session-logger.ts | File-based session logging | Medium |
| state-persistence.ts | State serialization to disk | Medium |
| checkpoint-manager.ts | Project checkpoint system | Medium |
| backup.ts | Backup operations | High |
| merge.ts | Configuration merging | High |
| constants.ts | Path/name constants | High |

**Assessment**: The library layer is well-factored with single responsibilities. `session-logger.ts` and `state-persistence.ts` could benefit from interface abstraction for easier testing.

### 4. CLI Layer (`src/cli/`)

| Command | Complexity | Dependencies |
|---------|------------|--------------|
| doctor.ts | High (31KB) | Many lib modules |
| maturity.ts | High (46KB) | Project analysis |
| migrate.ts | High (31KB) | Schema migration |
| init.ts | Medium | Wizard steps |
| checkpoint.ts | Medium | Checkpoint manager |
| restore.ts | Medium | Checkpoint restore |
| uninstall.ts | Medium | File cleanup |

**Concern**: `maturity.ts` and `migrate.ts` are large files (>30KB). Consider breaking into smaller, focused modules.

---

## Findings by Category

### Critical Severity

**CRIT-01: Module-Level Singleton State**
- **Location**: `src/plugin/managers/session-manager.ts:24`
- **Issue**: `const sessions = new Map<string, SessionState>()` is module-level state
- **Impact**:
  - Prevents true isolation in tests
  - Makes horizontal scaling impossible (state not shareable)
  - Memory leak potential if sessions not cleaned up
- **Recommendation**: Inject state storage as a dependency, support pluggable backends (memory, Redis, etc.)

**CRIT-02: No Interface Abstraction for Managers**
- **Location**: All manager modules
- **Issue**: Managers are concrete classes/modules with no interface contracts
- **Impact**:
  - Difficult to mock for unit testing
  - Cannot swap implementations (e.g., mock SecurityHardening)
  - Tight coupling throughout codebase
- **Recommendation**: Define `ISessionManager`, `IWorkflowEngine`, etc. interfaces

### High Severity

**HIGH-01: OpenCode Client Dependency Coupling**
- **Location**: `src/plugin/types.ts:30-37`
- **Issue**: `OpenCodeClient` interface defined locally without formal contract
- **Impact**: Changes in OpenCode API could break plugin silently
- **Recommendation**: Import types from `@opencode-ai/plugin` when available, add runtime validation

**HIGH-02: Synchronous File Operations in Hot Path**
- **Location**: `src/plugin/managers/system-prompt-injector.ts`
- **Issue**: AGENTS.md reading happens in system transform hook
- **Impact**: File I/O in critical path adds latency
- **Recommendation**: Cache AGENTS.md content on initialization, watch for changes

**HIGH-03: Error Recovery State in Metadata**
- **Location**: `src/plugin/managers/error-recovery.ts:609-614`
- **Issue**: Error recovery state stored in `SessionManager.setMetadata()` - no type safety
- **Impact**: Easy to have schema drift, runtime errors possible
- **Recommendation**: Define explicit `ErrorRecoveryState` field in `SessionState`

**HIGH-04: Large Monolithic CLI Commands**
- **Location**: `src/cli/doctor.ts` (31KB), `src/cli/maturity.ts` (46KB)
- **Issue**: Single files with many responsibilities
- **Impact**: Hard to test individual components, cognitive load
- **Recommendation**: Break into focused modules (e.g., `doctor/checks/*.ts`)

### Medium Severity

**MED-01: Inconsistent Singleton Patterns**
- **Location**: Various managers
- **Issue**: Mix of patterns:
  - Module-level instances (`workflowEngine`, `toolInterceptor`)
  - Factory functions (`getSessionLogger`, `getNotificationManager`)
  - Class exports with internal singleton
- **Impact**: Inconsistent API, harder to reason about lifecycle
- **Recommendation**: Standardize on factory pattern with reset functions

**MED-02: Performance Targets Not Enforced**
- **Location**: `src/plugin/index.ts:49-57`
- **Issue**: Performance targets documented but not enforced at runtime
- **Impact**: Regressions go undetected
- **Recommendation**: Add performance assertions in development mode, expose metrics

**MED-03: Config Validation at Runtime Only**
- **Location**: `src/lib/config.ts:443-573`
- **Issue**: Config validation happens at load time, continues with invalid config
- **Impact**: Runtime errors possible from malformed configuration
- **Recommendation**: Fail fast on invalid config, or use strict defaults

**MED-04: Limited Retry/Circuit Breaker Patterns**
- **Location**: `src/lib/state-persistence.ts`, `src/lib/session-logger.ts`
- **Issue**: File operations fail silently or with single attempt
- **Impact**: Transient failures cause data loss
- **Recommendation**: Add retry logic for file operations, implement circuit breaker for repeated failures

**MED-05: Magic Numbers in Security Patterns**
- **Location**: `src/plugin/managers/security-hardening.ts`
- **Issue**: LRU cache size (100), max iterations (3), max length (500) are hardcoded
- **Impact**: Cannot tune without code changes
- **Recommendation**: Move to configuration or named constants

### Low Severity

**LOW-01: Mixed Export Styles**
- **Location**: Throughout codebase
- **Issue**: Mix of `export default`, named exports, namespace exports (`export * as`)
- **Impact**: Inconsistent import patterns across modules
- **Recommendation**: Standardize on named exports for better tree-shaking

**LOW-02: Console Usage in Library Code**
- **Location**: `src/lib/config.ts:594`
- **Issue**: `console.warn()` called directly in loadConfig
- **Impact**: Cannot control output in different environments
- **Recommendation**: Use logger consistently

**LOW-03: Incomplete Type Narrowing**
- **Location**: `src/plugin/managers/error-recovery.ts:458-513`
- **Issue**: Multiple `as Record<string, unknown>` casts
- **Impact**: Potential runtime type errors
- **Recommendation**: Use type guards or Zod validation

**LOW-04: Test Setup Global Mutation**
- **Location**: `test/setup.ts:34-48`
- **Issue**: `globalThis.testUtils` mutation
- **Impact**: Potential conflicts with other test frameworks
- **Recommendation**: Use explicit imports or Bun's test context

---

## Technical Debt Assessment

### Debt Categories

| Category | Debt Level | Description |
|----------|------------|-------------|
| Architectural | Medium | Singleton state, no DI container |
| Testing | Low | Good coverage, but manager mocking difficult |
| Documentation | Low | Excellent JSDoc, some ADRs missing |
| Security | Low | Comprehensive patterns, needs security audit |
| Performance | Low | Good targets, needs monitoring |
| Configuration | Low | Well-structured, validation could be stricter |

### Debt Quantification

- **Estimated Refactoring Effort**: 2-3 weeks for full DI implementation
- **Risk of Delay**: Medium - current architecture works, but scaling will hit limits
- **Priority Areas**:
  1. Interface abstraction for managers (1 week)
  2. Configurable state backend (3 days)
  3. CLI modularization (1 week)

---

## Scalability Analysis

### Current Limitations

1. **In-Memory State**: `sessions` Map cannot scale beyond single process
2. **File-Based Persistence**: `~/.atreides/` doesn't support multi-machine deployment
3. **No Rate Limiting**: Notification throttling is in-memory only
4. **Synchronous Bottlenecks**: Some file operations block event loop

### 10x Growth Scenarios

| Scenario | Current Capacity | At 10x | Mitigation |
|----------|------------------|--------|------------|
| Concurrent sessions | ~1000 | Fails (memory) | Pluggable state store |
| Tool executions/sec | ~100 | Degrades | Batch logging, async writes |
| Error pattern matches | Instant | Instant | Already O(n) with compiled RegExp |
| State persistence | ~10MB/session | Disk full | Compression, rotation |

### Recommendations for Scale

1. **Short-term**: Add Redis adapter for SessionManager
2. **Medium-term**: Implement async file operations throughout
3. **Long-term**: Consider event-sourcing for state changes

---

## Testability Assessment

### Current State

| Aspect | Rating | Notes |
|--------|--------|-------|
| Unit Test Infrastructure | A | Bun test with good utilities |
| Integration Test Harness | A | Excellent mock context and simulation |
| Manager Isolation | C | Singletons make mocking difficult |
| External Dependency Mocking | B | File system mocked, OpenCode context mocked |
| Coverage Targets | A | 80% threshold enforced |

### Testing Patterns Used

1. **Test Harness**: `test/integration/harness.ts` - simulates full plugin lifecycle
2. **Mock Context**: `test/mocks/opencode-context.ts` - captures notifications, logs, shell commands
3. **Fixtures**: `test/fixtures/` - sample projects and expected outputs
4. **Setup File**: `test/setup.ts` - global cleanup, utilities

### Gaps

1. **Manager Mocking**: Cannot easily mock `SessionManager` for unit tests
2. **Security Pattern Testing**: No fuzzing or property-based testing
3. **Performance Regression Tests**: No automated timing assertions
4. **E2E with Real OpenCode**: No integration with actual OpenCode runtime

---

## Positive Architectural Decisions

### 1. Hook-Based Plugin Architecture
The plugin uses a well-defined hook system with 6 integration points:
- `event` - Session lifecycle
- `stop` - Todo enforcement
- `tool.execute.before` - Security validation
- `tool.execute.after` - Error recovery, phase tracking
- `experimental.chat.system.transform` - Prompt injection
- `experimental.session.compacting` - State preservation

This allows non-invasive orchestration without modifying OpenCode core.

### 2. Comprehensive Type Safety
- 800+ lines of type definitions in `src/plugin/types.ts`
- Strict TypeScript config with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- Custom error classes with structured context

### 3. Multi-Layer Security Hardening
- 5-stage obfuscation detection pipeline (URL, hex, octal, quotes, backslash)
- 22+ blocked command patterns
- Path traversal protection
- LRU caching for performance

### 4. Progressive Error Recovery
The 3-strike protocol provides graceful degradation:
- Strike 1: Log and continue
- Strike 2: Suggest recovery actions
- Strike 3: Escalate to "Stilgar" with full context

### 5. State Preservation on Compaction
Context compaction preserves:
- Workflow phase and history
- Pending todos
- Error strike count
- Tool execution summary

### 6. Configuration Layering
- Default config with sensible values
- Project-level overrides via `opencode.json`
- Runtime validation with warnings
- Deep merge for nested config objects

### 7. Clean CLI Architecture
- Command separation in individual files
- Interactive wizard with step-by-step flow
- Help text and version handling
- Exit code semantics (0=success, 1=warning, 2=error)

### 8. Comprehensive Logging Infrastructure
- Session-level file logging with rotation
- PII filtering for sensitive data
- Structured log events with timestamps
- Configurable log levels

---

## Recommendations for Architectural Improvements

### Priority 1: Introduce Dependency Injection

```typescript
// Proposed: Define manager interfaces
interface ISessionManager {
  getState(sessionId: string, config?: Config): SessionState;
  getStateOrUndefined(sessionId: string): SessionState | undefined;
  setState(sessionId: string, state: SessionState): void;
  // ...
}

// Create container
class PluginContainer {
  readonly sessionManager: ISessionManager;
  readonly workflowEngine: IWorkflowEngine;
  readonly securityHardening: ISecurityHardening;
  // ...
}
```

**Benefit**: Enables true unit testing, swappable implementations.

### Priority 2: Abstract State Storage

```typescript
interface IStateStore<T> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  keys(): Promise<string[]>;
}

// Implementations
class MemoryStateStore<T> implements IStateStore<T> { }
class RedisStateStore<T> implements IStateStore<T> { }
class FileStateStore<T> implements IStateStore<T> { }
```

**Benefit**: Enables horizontal scaling, persistence flexibility.

### Priority 3: Modularize Large Commands

```
src/cli/
  doctor/
    index.ts           # Entry point
    checks/
      installation.ts
      project-files.ts
      agents.ts
      skills.ts
      plugin.ts
      security.ts
    display.ts
    types.ts
```

**Benefit**: Smaller files, focused testing, easier maintenance.

### Priority 4: Add Performance Monitoring

```typescript
// Add metrics collection
interface PluginMetrics {
  hookExecutionTime: Histogram;
  securityValidationTime: Histogram;
  stateOperationTime: Histogram;
  errorCount: Counter;
  phaseTransitions: Counter;
}

// Expose via hook
hooks["metrics"] = () => getMetrics();
```

**Benefit**: Detect performance regressions, production observability.

### Priority 5: Implement Circuit Breaker for I/O

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailure: number | null = null;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      throw new CircuitOpenError();
    }
    // ...
  }
}
```

**Benefit**: Graceful handling of file system issues, faster failure recovery.

---

## Conclusion

Atreides OpenCode demonstrates solid architectural foundations for an AI orchestration plugin. The hook-based design, comprehensive type safety, and security hardening are notable strengths. The main areas for improvement center around dependency injection and interface abstraction to improve testability and enable future scaling.

The codebase is production-ready for single-instance deployments. For enterprise or multi-instance scenarios, the recommended architectural improvements should be prioritized.

### Rating Breakdown

| Category | Grade | Weight | Score |
|----------|-------|--------|-------|
| Design Patterns | B+ | 15% | 3.3 |
| Modularity | B | 15% | 3.0 |
| Scalability | C+ | 10% | 2.3 |
| Maintainability | B+ | 15% | 3.3 |
| Extensibility | B | 10% | 3.0 |
| Testability | B | 10% | 3.0 |
| Resilience | B | 10% | 3.0 |
| Configuration | A- | 5% | 3.7 |
| Dependencies | A | 5% | 4.0 |
| Documentation | A | 5% | 4.0 |

**Overall GPA**: 3.2 / 4.0 = **B+**

---

*This review was conducted following the System Architecture mindset: thinking holistically about systems with 10x growth in mind, considering ripple effects across all components, and prioritizing loose coupling, clear boundaries, and future adaptability.*
