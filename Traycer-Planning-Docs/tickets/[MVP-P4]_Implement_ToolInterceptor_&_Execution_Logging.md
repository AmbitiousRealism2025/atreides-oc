# [MVP-P4] Implement ToolInterceptor & Execution Logging

## Context

Implement the ToolInterceptor component that validates and logs all tool executions. This component orchestrates pre-execution validation (delegating to SecurityHardening) and post-execution logging, serving as the central point for tool call tracking.

**References**:
- Component Spec: spec:bf063507-9358-4515-afbb-3080f2099467/2b47fd09-6d7f-46bd-9e1d-f07c29d89bf5
- Technical Plan: spec:bf063507-9358-4515-afbb-3080f2099467/5cdb5788-a716-4cb2-a301-6ccd6f64a488 (Section 3.1.3)

**Dependencies**:
- ticket:bf063507-9358-4515-afbb-3080f2099467/02b4c158-4452-4da0-bc01-bb5cf7b5de6e (SessionManager)
- ticket:bf063507-9358-4515-afbb-3080f2099467/a41be2c4-139a-4d9c-b398-10bfe90ab95a (SecurityHardening)

---

## Scope

### In Scope
- ToolInterceptor class implementation
- Integration with `tool.execute.before` hook
- Integration with `tool.execute.after` hook
- Pre-execution validation (delegates to SecurityHardening)
- Post-execution logging
- Tool call history tracking in session state
- Performance monitoring (execution duration)

### Out of Scope
- Security validation logic (delegated to SecurityHardening)
- Error detection (delegated to ErrorRecovery)
- Workflow phase updates (delegated to WorkflowEngine)

---

## Implementation Guidance

```typescript
interface ToolCall {
  tool: string
  timestamp: number
  success: boolean
  error?: string
  duration?: number
}

class ToolInterceptor {
  constructor(
    private sessionManager: SessionManager,
    private securityHardening: SecurityHardening
  ) {}
  
  async beforeExecute(
    tool: string,
    input: any,
    sessionId: string
  ): Promise<{ action: 'allow' | 'deny' | 'ask', reason?: string }> {
    try {
      // Validate with SecurityHardening
      if (tool === 'bash') {
        const validation = this.securityHardening.validateCommand(input.command)
        if (validation.action !== 'allow') {
          return validation
        }
      }
      
      if (tool === 'edit' || tool === 'write') {
        const validation = this.securityHardening.validateFilePath(input.path)
        if (validation.action !== 'allow') {
          return validation
        }
      }
      
      return { action: 'allow' }
    } catch (error) {
      logger.error('Tool validation error', error)
      return { action: 'deny', reason: 'Validation error' }
    }
  }
  
  async afterExecute(
    tool: string,
    output: any,
    sessionId: string
  ): Promise<void> {
    try {
      const state = this.sessionManager.getState(sessionId)
      
      // Track in history
      state.toolHistory.push({
        tool,
        timestamp: Date.now(),
        success: !output.error,
        error: output.error,
        duration: output.duration
      })
      
      // Limit history size
      if (state.toolHistory.length > 100) {
        state.toolHistory = state.toolHistory.slice(-100)
      }
      
      // Update last activity
      state.lastActivity = Date.now()
    } catch (error) {
      logger.error('Tool logging error', error)
      // Never throw
    }
  }
}
```

---

## Acceptance Criteria

### Functional
- [ ] ToolInterceptor class implemented
- [ ] `tool.execute.before` hook integration working
- [ ] `tool.execute.after` hook integration working
- [ ] Security validation delegated correctly
- [ ] Tool call history tracked in session state
- [ ] History size limited (last 100 calls)
- [ ] Performance metrics captured (duration)

### Quality
- [ ] Unit tests for validation flow (>90% coverage)
- [ ] Unit tests for logging flow
- [ ] Integration tests with SecurityHardening
- [ ] Error handling tested
- [ ] Performance: <5ms overhead per call

### Documentation
- [ ] TSDoc comments on all public methods
- [ ] Hook integration documented

---

## Testing Strategy

```typescript
describe('ToolInterceptor', () => {
  test('delegates bash validation to SecurityHardening', async () => {
    const result = await interceptor.beforeExecute('bash', { command: 'rm -rf /' }, 'session-1')
    expect(result.action).toBe('deny')
  })
  
  test('logs tool execution in history', async () => {
    await interceptor.afterExecute('read', { success: true }, 'session-1')
    const history = getToolHistory('session-1')
    expect(history).toHaveLength(1)
    expect(history[0].tool).toBe('read')
  })
  
  test('limits history to 100 entries', async () => {
    // Execute 150 tools
    for (let i = 0; i < 150; i++) {
      await interceptor.afterExecute('read', {}, 'session-1')
    }
    expect(getToolHistory('session-1')).toHaveLength(100)
  })
})
```

---

## Effort Estimate

**From Master Plan**: 1.5 days (Week 3)