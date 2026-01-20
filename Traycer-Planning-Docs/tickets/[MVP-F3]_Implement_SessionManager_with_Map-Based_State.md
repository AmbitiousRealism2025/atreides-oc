# [MVP-F3] Implement SessionManager with Map-Based State

## Objective

Implement session lifecycle management using OpenCode's Map-based state pattern.

## Context

SessionManager is the foundation for all stateful orchestration features. It manages session state using an in-memory Map keyed by session ID, following OpenCode's standard plugin pattern.

**References**:
- Technical Plan: spec:bf063507-9358-4515-afbb-3080f2099467/5cdb5788-a716-4cb2-a301-6ccd6f64a488 (Section 1.3, 2.1, 3.1.1)
- OpenCode Plugin Pattern: Verified from plugin examples

## Scope

**In Scope**:
- In-memory Map for session state storage
- Session initialization on `session.created` event
- Session cleanup on `session.deleted` event
- State access API (`getState(sessionId)`)
- Session metadata tracking
- State schema implementation

**Out of Scope**:
- Workflow phase tracking (WorkflowEngine ticket)
- Error recovery state (ErrorRecovery ticket)
- Todo tracking (TodoEnforcer ticket)
- Persistent storage (in-memory only for MVP)

## Implementation Guidance

### State Storage Pattern

**src/plugin/managers/session-manager.ts**:
```typescript
const sessions = new Map<string, SessionState>()

export function getState(sessionId: string): SessionState {
  let state = sessions.get(sessionId)
  if (!state) {
    state = initializeSessionState(sessionId)
    sessions.set(sessionId, state)
  }
  return state
}

export function initializeSessionState(sessionId: string): SessionState {
  return {
    sessionId,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    workflow: { currentPhase: 'intent', phaseHistory: [] },
    errorRecovery: { strikeCount: 0, escalated: false },
    todos: { created: [], completed: [], pending: [] },
    toolHistory: [],
    custom: {}
  }
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId)
}
```

### Event Hook Integration

**Hook handlers**:
- `event(session.created)`: Call `initializeSessionState(sessionId)`
- `event(session.deleted)`: Call `deleteSession(sessionId)`
- `event(session.idle)`: Update `lastActivity` timestamp

### State Schema

Implement SessionState interface from Technical Plan Section 2.1:
- Session metadata (id, timestamps)
- Workflow state (phase, history)
- Error recovery state (strikes, escalation)
- Todo state (created, completed, pending)
- Tool history (recent calls)
- Custom extensible state

## Acceptance Criteria

- [ ] SessionManager maintains Map<string, SessionState>
- [ ] `getState(sessionId)` returns existing or initializes new state
- [ ] State initialized on `session.created` event
- [ ] State deleted on `session.deleted` event
- [ ] State schema matches Technical Plan Section 2.1
- [ ] Multiple concurrent sessions supported (separate state per session)
- [ ] Memory cleanup on session deletion (no leaks)
- [ ] Unit tests: State initialization, retrieval, deletion
- [ ] Unit tests: Concurrent session handling
- [ ] Integration test: Session lifecycle with OpenCode events

## Dependencies

**Depends On**:
- [MVP-F2] Implement Plugin Entry Point & Hook Registry

**Blocks**:
- [MVP-C1] Implement WorkflowEngine
- [MVP-C2] Implement ErrorRecovery
- [MVP-C4] Implement TodoEnforcer

## Estimated Effort

**8 hours** (4h implementation + 2h testing + 2h integration)

## Testing

**Unit Tests**:
- Initialize state for new session
- Retrieve existing state
- Delete state on session end
- Handle multiple concurrent sessions
- State schema validation

**Integration Tests**:
- Session created event triggers initialization
- Session deleted event triggers cleanup
- State persists across multiple hook calls
- No memory leaks after session deletion