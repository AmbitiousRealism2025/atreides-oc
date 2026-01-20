# [MVP-F2] Implement Plugin Entry Point & Hook Registry

## Objective

Create the plugin entry point that exports the Atreides plugin function and implements the hook registry system.

## Context

This ticket implements the core plugin structure that OpenCode will load. It establishes the pattern for all hook implementations.

**References**:
- Technical Plan: spec:bf063507-9358-4515-afbb-3080f2099467/5cdb5788-a716-4cb2-a301-6ccd6f64a488 (Section 1.2, 3.1)
- Master Plan: file:ATREIDES_OC_MASTER_PLAN.md (Section 3.2)

## Scope

**In Scope**:
- Plugin function signature with OpenCode context
- Hook registry pattern
- Type definitions for all hooks
- Error boundary wrapper for hooks
- Plugin initialization logic
- Basic logging setup

**Out of Scope**:
- Actual hook implementations (separate tickets)
- Session state management (separate ticket)
- Configuration loading (separate ticket)

## Implementation Guidance

### Plugin Function Structure

**src/plugin/index.ts**:
```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const AtreidesPlugin: Plugin = async ({ project, client, $, directory, worktree }) => {
  // Initialize plugin
  // Load configuration
  // Set up logging
  
  return {
    event: wrapHook(eventHandler),
    stop: wrapHook(stopHandler),
    "tool.execute.before": wrapHook(toolBeforeHandler),
    "tool.execute.after": wrapHook(toolAfterHandler),
    "experimental.chat.system.transform": wrapHook(systemTransformHandler),
    "experimental.session.compacting": wrapHook(compactionHandler),
  }
}
```

### Error Boundary Pattern

**Hook Wrapper** (enforces "never throw" principle):
```typescript
function wrapHook<T extends (...args: any[]) => any>(
  handler: T
): T {
  return (async (...args) => {
    try {
      return await handler(...args)
    } catch (error) {
      logger.error('Hook error:', error)
      return getSafeDefault(handler.name)
    }
  }) as T
}
```

### Type Definitions

**src/plugin/types.ts**:
- SessionState interface
- AtreidesConfig interface
- Hook handler types
- Error types
- Utility types

## Acceptance Criteria

- [ ] Plugin exports function with correct signature
- [ ] Plugin function receives OpenCode context (project, client, $, directory, worktree)
- [ ] All 6 hooks registered (event, stop, tool.execute.before/after, system.transform, compacting)
- [ ] Error boundary wraps all hooks (try-catch + safe defaults)
- [ ] Type definitions complete for all data structures
- [ ] Plugin loads in OpenCode without errors
- [ ] Logging system initialized
- [ ] Unit test: Plugin function returns valid hooks object
- [ ] Integration test: Plugin loads in test OpenCode environment

## Dependencies

**Depends On**: 
- [MVP-F1] Initialize Package Structure & Build Pipeline

**Blocks**: 
- All plugin component tickets (SessionManager, WorkflowEngine, etc.)

## Estimated Effort

**8 hours** (4h plugin structure + 4h error handling + types)

## Testing

**Unit Tests**:
- Plugin function returns hooks object
- Error boundary catches exceptions
- Safe defaults returned on error
- Type definitions compile

**Integration Tests**:
- Plugin loads in OpenCode
- Hooks are registered correctly
- Error boundary works in runtime