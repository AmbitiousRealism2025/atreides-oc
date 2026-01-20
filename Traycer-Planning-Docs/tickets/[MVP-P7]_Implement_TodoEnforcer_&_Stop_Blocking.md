# [MVP-P7] Implement TodoEnforcer & Stop Blocking

## Context

Implement the TodoEnforcer component that tracks todo items from AI responses and blocks session stop if pending todos exist. This ensures work is completed before ending sessions.

**References**:
- Component Spec: spec:bf063507-9358-4515-afbb-3080f2099467/2b47fd09-6d7f-46bd-9e1d-f07c29d89bf5
- Technical Plan: spec:bf063507-9358-4515-afbb-3080f2099467/5cdb5788-a716-4cb2-a301-6ccd6f64a488 (Section 3.1.8)

**Dependencies**:
- ticket:bf063507-9358-4515-afbb-3080f2099467/02b4c158-4452-4da0-bc01-bb5cf7b5de6e (SessionManager)

---

## Scope

### In Scope
- TodoEnforcer class implementation
- Todo detection from AI responses (markdown checkboxes)
- Todo tracking in session state
- Completion detection
- Stop blocking via `stop` hook
- Todo status summary

### Out of Scope
- Custom todo formats (markdown checkboxes only)
- Todo prioritization
- Todo reminders
- Todo analytics

---

## Implementation Guidance

```typescript
interface TodoItem {
  id: string
  description: string
  createdAt: number
  completedAt?: number
}

class TodoEnforcer {
  constructor(private sessionManager: SessionManager) {}
  
  detectTodos(aiResponse: string, sessionId: string): void {
    try {
      const state = this.sessionManager.getState(sessionId)
      
      // Parse markdown checkboxes
      const todoPattern = /- \[ \] (.+)/g
      const matches = [...aiResponse.matchAll(todoPattern)]
      
      for (const match of matches) {
        const description = match[1].trim()
        const todo: TodoItem = {
          id: this.generateId(),
          description,
          createdAt: Date.now()
        }
        
        state.todos.created.push(todo)
        state.todos.pending.push(todo)
      }
    } catch (error) {
      logger.error('Todo detection error', error)
    }
  }
  
  async checkPendingTodos(sessionId: string): Promise<{ allow: boolean, reason?: string }> {
    try {
      const state = this.sessionManager.getState(sessionId)
      const pending = state.todos.pending
      
      if (pending.length === 0) {
        return { allow: true }
      }
      
      const summary = this.formatTodoSummary(pending)
      return {
        allow: false,
        reason: `Cannot stop: ${pending.length} pending todo(s)\n\n${summary}\n\nPlease complete or remove todos before stopping.`
      }
    } catch (error) {
      logger.error('Todo check error', error)
      return { allow: true } // Fail open
    }
  }
  
  private formatTodoSummary(todos: TodoItem[]): string {
    return todos.map(todo => `- [ ] ${todo.description}`).join('\n')
  }
  
  private generateId(): string {
    return `todo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}
```

---

## Acceptance Criteria

### Functional
- [ ] TodoEnforcer class implemented
- [ ] Todo detection from markdown checkboxes working
- [ ] Todos tracked in session state
- [ ] Stop hook blocks if pending todos exist
- [ ] Stop hook allows if no pending todos
- [ ] Todo summary formatted correctly
- [ ] Unique IDs generated for todos

### Quality
- [ ] Unit tests for todo detection
- [ ] Unit tests for stop blocking logic
- [ ] Integration tests with stop hook
- [ ] Error handling tested
- [ ] Performance: <5ms per check

### Documentation
- [ ] TSDoc comments on all public methods
- [ ] Todo format documented

---

## Testing Strategy

```typescript
describe('TodoEnforcer', () => {
  test('detects todos from AI response', () => {
    const response = 'Here are the tasks:\n- [ ] Update tests\n- [ ] Add docs'
    enforcer.detectTodos(response, 'session-1')
    
    const todos = getPendingTodos('session-1')
    expect(todos).toHaveLength(2)
    expect(todos[0].description).toBe('Update tests')
  })
  
  test('blocks stop if pending todos', async () => {
    addTodo('session-1', 'Finish work')
    
    const result = await enforcer.checkPendingTodos('session-1')
    expect(result.allow).toBe(false)
    expect(result.reason).toContain('1 pending todo')
  })
  
  test('allows stop if no pending todos', async () => {
    const result = await enforcer.checkPendingTodos('session-1')
    expect(result.allow).toBe(true)
  })
})
```

---

## Effort Estimate

**From Master Plan**: 1 day (Week 4)