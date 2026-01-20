# [MVP-P2] Implement ErrorRecovery & 3-Strike Protocol

## Context

Implement the ErrorRecovery component that detects errors from tool output and implements a 3-strike protocol for escalation to the Stilgar (Oracle) agent. This provides automatic error handling and recovery guidance.

**References**:
- Component Spec: spec:bf063507-9358-4515-afbb-3080f2099467/{core-plugin-arch-spec-id}
- Technical Plan: spec:bf063507-9358-4515-afbb-3080f2099467/5cdb5788-a716-4cb2-a301-6ccd6f64a488 (Section 3.1.5)
- Deep Dive: file:archive/ATREIDES_DEEP_DIVE_FINDINGS.md (Section 4.3: Error Pattern Detection)

**Dependencies**:
- ticket:bf063507-9358-4515-afbb-3080f2099467/02b4c158-4452-4da0-bc01-bb5cf7b5de6e (SessionManager)

---

## Scope

### In Scope
- ErrorRecovery class implementation
- 22 error pattern detection (from deep dive findings)
- 3-strike counter management
- Escalation to Stilgar agent
- Recovery suggestion generation
- Integration with `tool.execute.after` hook
- Strike counter reset on success

### Out of Scope
- ML-based error detection
- Custom error patterns (use predefined 22)
- Automatic error fixing
- Error analytics/reporting

---

## Implementation Guidance

### Error Patterns (22 total from deep dive)

```typescript
const ERROR_PATTERNS = [
  /command not found/i,
  /permission denied/i,
  /no such file or directory/i,
  /syntax error/i,
  /cannot find module/i,
  /ENOENT/i,
  /EACCES/i,
  /failed to compile/i,
  /test.*failed/i,
  /error:/i,
  // ... 12 more patterns
]
```

### State Management

```typescript
interface ErrorRecoveryState {
  strikeCount: number
  lastError?: {
    timestamp: number
    tool: string
    error: string
  }
  escalated: boolean
}
```

### 3-Strike Protocol

```typescript
class ErrorRecovery {
  async checkForErrors(tool: string, output: string, sessionId: string): Promise<void> {
    const hasError = this.detectError(output)
    
    if (hasError) {
      this.incrementStrikes(sessionId, tool, output)
      const strikes = this.getStrikeCount(sessionId)
      
      if (strikes === 1) {
        // Log error, continue
        logger.warn('Error detected (strike 1)', { tool, sessionId })
      } else if (strikes === 2) {
        // Show warning, suggest fixes
        this.suggestRecovery(sessionId, output)
      } else if (strikes >= 3) {
        // Escalate to Stilgar
        this.escalateToStilgar(sessionId)
      }
    } else {
      // Reset counter on success
      this.resetStrikes(sessionId)
    }
  }
  
  private detectError(output: string): boolean {
    return ERROR_PATTERNS.some(pattern => pattern.test(output))
  }
  
  private escalateToStilgar(sessionId: string): void {
    const state = this.sessionManager.getState(sessionId)
    state.errorRecovery.escalated = true
    
    // Inject escalation message into context
    // (Implementation depends on OpenCode's delegation API)
  }
}
```

### Recovery Suggestions

```typescript
const RECOVERY_SUGGESTIONS = {
  'command not found': 'Verify the command is installed and in PATH',
  'permission denied': 'Check file permissions or use sudo if appropriate',
  'no such file or directory': 'Verify the file path exists',
  'syntax error': 'Review the code syntax for errors',
  // ... more suggestions
}
```

---

## Acceptance Criteria

### Functional
- [ ] ErrorRecovery class implemented
- [ ] All 22 error patterns detected correctly
- [ ] Strike counter increments on errors
- [ ] Strike counter resets on success
- [ ] Escalation triggered at 3 strikes
- [ ] Recovery suggestions generated
- [ ] Integration with `tool.execute.after` hook working

### Quality
- [ ] Unit tests for all 22 error patterns (100% pattern coverage)
- [ ] Unit tests for strike counter logic
- [ ] Integration tests for escalation flow
- [ ] Error handling tested (malformed output, edge cases)
- [ ] Performance: <5ms per error check

### Documentation
- [ ] TSDoc comments on all public methods
- [ ] Error patterns documented
- [ ] Recovery suggestions documented

---

## Testing Strategy

**Unit Tests**:
```typescript
describe('ErrorRecovery', () => {
  test('detects "command not found" error', () => {
    const output = 'bash: foo: command not found'
    expect(detectError(output)).toBe(true)
  })
  
  test('increments strike counter on error', () => {
    recovery.checkForErrors('bash', 'error: failed', 'session-1')
    expect(getStrikes('session-1')).toBe(1)
  })
  
  test('escalates at 3 strikes', () => {
    // Trigger 3 errors
    recovery.checkForErrors('bash', 'error 1', 'session-1')
    recovery.checkForErrors('bash', 'error 2', 'session-1')
    recovery.checkForErrors('bash', 'error 3', 'session-1')
    
    expect(isEscalated('session-1')).toBe(true)
  })
  
  test('resets counter on success', () => {
    recovery.checkForErrors('bash', 'error', 'session-1')
    recovery.checkForErrors('bash', 'success', 'session-1')
    expect(getStrikes('session-1')).toBe(0)
  })
})
```

---

## Effort Estimate

**From Master Plan**: 2 days (Week 2-3)

**Breakdown**:
- Error pattern implementation: 1 day
- Strike counter logic: 0.5 days
- Testing: 0.5 days