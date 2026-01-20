# [MVP-P6] Implement CompactionHandler & State Preservation

## Context

Implement the CompactionHandler component that preserves critical session state during OpenCode's context compaction. This ensures workflow phase, todos, and error state survive compaction events.

**References**:
- Component Spec: spec:bf063507-9358-4515-afbb-3080f2099467/2b47fd09-6d7f-46bd-9e1d-f07c29d89bf5
- Technical Plan: spec:bf063507-9358-4515-afbb-3080f2099467/5cdb5788-a716-4cb2-a301-6ccd6f64a488 (Section 3.1.7)

**Dependencies**:
- ticket:bf063507-9358-4515-afbb-3080f2099467/02b4c158-4452-4da0-bc01-bb5cf7b5de6e (SessionManager)

---

## Scope

### In Scope
- CompactionHandler class implementation
- Integration with `experimental.session.compacting` hook
- Serialize critical state (workflow phase, todos, strike counter)
- Inject serialized state into compacted context
- State restoration after compaction

### Out of Scope
- Custom compaction strategies
- Compression of state data
- Selective state preservation (preserve all critical state)

---

## Implementation Guidance

```typescript
class CompactionHandler {
  constructor(private sessionManager: SessionManager) {}
  
  async preserveState(sessionId: string): Promise<string> {
    try {
      const state = this.sessionManager.getState(sessionId)
      
      // Serialize critical state
      const preserved = {
        workflowPhase: state.workflow.currentPhase,
        pendingTodos: state.todos.pending,
        strikeCount: state.errorRecovery.strikeCount,
        recentTools: state.toolHistory.slice(-10)
      }
      
      // Format as markdown for injection
      const markdown = this.formatAsMarkdown(preserved)
      
      return markdown
    } catch (error) {
      logger.error('State preservation error', error)
      return '<!-- Atreides state preservation failed -->'
    }
  }
  
  private formatAsMarkdown(state: any): string {
    return `
<!-- ATREIDES STATE -->
Workflow Phase: ${state.workflowPhase}

Pending Todos: ${state.pendingTodos.length}
${state.pendingTodos.map(todo => `- [ ] ${todo.description}`).join('\n')}

Error Recovery: ${state.strikeCount} strike${state.strikeCount !== 1 ? 's' : ''}

Recent Tool History:
${state.recentTools.map(t => `- ${t.tool} (${t.success ? 'success' : 'error'})`).join('\n')}
<!-- END ATREIDES STATE -->
`
  }
}
```

---

## Acceptance Criteria

### Functional
- [ ] CompactionHandler class implemented
- [ ] Integration with `experimental.session.compacting` hook working
- [ ] Workflow phase preserved
- [ ] Pending todos preserved
- [ ] Strike counter preserved
- [ ] Recent tool history preserved (last 10)
- [ ] State formatted as markdown
- [ ] State injected into compacted context

### Quality
- [ ] Unit tests for state serialization
- [ ] Unit tests for markdown formatting
- [ ] Integration tests with hook
- [ ] Error handling tested
- [ ] Performance: <10ms per compaction

### Documentation
- [ ] TSDoc comments on all public methods
- [ ] State format documented

---

## Testing Strategy

```typescript
describe('CompactionHandler', () => {
  test('serializes workflow phase', async () => {
    const markdown = await handler.preserveState('session-1')
    expect(markdown).toContain('Workflow Phase: implementation')
  })
  
  test('serializes pending todos', async () => {
    // Add todos to session
    addTodo('session-1', 'Update tests')
    
    const markdown = await handler.preserveState('session-1')
    expect(markdown).toContain('- [ ] Update tests')
  })
  
  test('includes recent tool history', async () => {
    const markdown = await handler.preserveState('session-1')
    expect(markdown).toContain('Recent Tool History')
  })
})
```

---

## Effort Estimate

**From Master Plan**: 1 day (Week 4)