# [MVP-P1] Implement WorkflowEngine & Phase Tracking

## Context

Implement the WorkflowEngine component that tracks and enforces the 5-phase workflow progression (Intent → Assessment → Exploration → Implementation → Verification). This is a core orchestration feature that guides AI through structured problem-solving.

**References**:
- Component Spec: spec:bf063507-9358-4515-afbb-3080f2099467/{core-plugin-arch-spec-id}
- Technical Plan: spec:bf063507-9358-4515-afbb-3080f2099467/5cdb5788-a716-4cb2-a301-6ccd6f64a488 (Section 3.1.2)
- Master Plan: file:ATREIDES_OC_MASTER_PLAN.md (Appendix B: Workflow Phases)

**Dependencies**:
- ticket:bf063507-9358-4515-afbb-3080f2099467/02b4c158-4452-4da0-bc01-bb5cf7b5de6e (SessionManager must exist)

---

## Scope

### In Scope
- WorkflowEngine class implementation
- 5 workflow phases with transition logic
- Intent classification (heuristic-based)
- Phase detection from tool usage patterns
- Integration with `tool.execute.after` and `stop` hooks
- Phase history tracking in session state
- Phase-specific guidance generation

### Out of Scope
- ML-based intent classification (heuristic only for MVP)
- Advanced phase prediction
- Phase visualization UI
- Custom workflow definitions

---

## Implementation Guidance

### Workflow Phases

```typescript
type WorkflowPhase = 'intent' | 'assessment' | 'exploration' | 'implementation' | 'verification'

interface WorkflowState {
  currentPhase: WorkflowPhase
  phaseHistory: PhaseTransition[]
  intentClassification?: string
}

interface PhaseTransition {
  from: WorkflowPhase
  to: WorkflowPhase
  timestamp: number
  reason?: string
}
```

### Phase Transition Logic

**Heuristics**:
- **Intent → Assessment**: After initial message, before tool use
- **Assessment → Exploration**: First `read`, `grep_search`, or `list_dir` call
- **Exploration → Implementation**: First `edit` or `bash` call
- **Implementation → Verification**: After changes, when validation tools used
- **Verification → Intent**: After successful validation, ready for new task

**Tool Pattern Mapping**:
```typescript
const phasePatterns = {
  exploration: ['read', 'grep_search', 'file_search', 'list_dir'],
  implementation: ['edit', 'bash', 'write'],
  verification: ['bash' /* test commands */, 'read' /* verify changes */]
}
```

### Hook Integration

```typescript
class WorkflowEngine {
  constructor(private sessionManager: SessionManager) {}
  
  async updatePhase(tool: string, sessionId: string): Promise<void> {
    const state = this.sessionManager.getState(sessionId)
    const currentPhase = state.workflow.currentPhase
    
    // Detect phase transition based on tool
    const newPhase = this.detectPhaseTransition(currentPhase, tool)
    
    if (newPhase !== currentPhase) {
      this.transitionPhase(sessionId, currentPhase, newPhase)
    }
  }
  
  private detectPhaseTransition(current: WorkflowPhase, tool: string): WorkflowPhase {
    // Implement heuristic logic
  }
  
  private transitionPhase(sessionId: string, from: WorkflowPhase, to: WorkflowPhase): void {
    const state = this.sessionManager.getState(sessionId)
    
    state.workflow.currentPhase = to
    state.workflow.phaseHistory.push({
      from,
      to,
      timestamp: Date.now()
    })
  }
}
```

### Error Handling

- Wrap all logic in try-catch
- Default to current phase if detection fails
- Log errors but never throw
- Graceful degradation if classification fails

---

## Acceptance Criteria

### Functional
- [ ] WorkflowEngine class implemented with all 5 phases
- [ ] Phase transitions detected from tool usage patterns
- [ ] Phase history tracked in session state
- [ ] Integration with `tool.execute.after` hook working
- [ ] Integration with `stop` hook working
- [ ] Intent classification (basic heuristic) implemented
- [ ] Phase-specific guidance generated

### Quality
- [ ] Unit tests for phase transition logic (>90% coverage)
- [ ] Integration tests for hook integration
- [ ] Error handling tested (invalid inputs, edge cases)
- [ ] Performance: <5ms per phase update

### Documentation
- [ ] TSDoc comments on all public methods
- [ ] Phase transition logic documented
- [ ] Examples in code comments

---

## Testing Strategy

**Unit Tests**:
```typescript
describe('WorkflowEngine', () => {
  test('transitions from intent to exploration on read', () => {
    const engine = new WorkflowEngine(mockSessionManager)
    engine.updatePhase('read', 'session-1')
    expect(getPhase('session-1')).toBe('exploration')
  })
  
  test('transitions from exploration to implementation on edit', () => {
    // Set current phase to exploration
    engine.updatePhase('edit', 'session-1')
    expect(getPhase('session-1')).toBe('implementation')
  })
})
```

**Integration Tests**:
```typescript
describe('WorkflowEngine Integration', () => {
  test('hook updates phase on tool execution', async () => {
    const plugin = await loadPlugin()
    await plugin['tool.execute.after']({ tool: 'read', sessionId: 'test' })
    expect(getPhase('test')).toBe('exploration')
  })
})
```

---

## Effort Estimate

**From Master Plan**: 2 days (Week 2)

**Breakdown**:
- Core logic: 1 day
- Hook integration: 0.5 days
- Testing: 0.5 days