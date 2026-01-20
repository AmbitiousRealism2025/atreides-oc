# [MVP-T2] Implement Integration Test Suite (150 tests)

## Context

Implement integration test suite covering hook execution, plugin loading, and component interactions. Target: 150 integration tests requiring actual OpenCode installation.

**References**:
- Component Spec: spec:bf063507-9358-4515-afbb-3080f2099467/9ed0f511-54fb-4b20-99cd-f418b041bb80
- Technical Plan: spec:bf063507-9358-4515-afbb-3080f2099467/5cdb5788-a716-4cb2-a301-6ccd6f64a488 (Section 4)

**Dependencies**:
- ticket:bf063507-9358-4515-afbb-3080f2099467/2529f0a9-41c5-476d-8e34-9adedc09d512 (Plugin entry point)
- All MVP component tickets

---

## Scope

### In Scope
- 150 integration tests
- Hook registration tests (10 tests)
- Event handling tests (15 tests)
- Tool interception tests (40 tests)
- System prompt injection tests (20 tests)
- Session lifecycle tests (25 tests)
- Error recovery flow tests (20 tests)
- Workflow transition tests (20 tests)
- OpenCode integration setup

### Out of Scope
- Unit tests (separate ticket)
- E2E tests (separate ticket)
- Performance benchmarks

---

## Implementation Guidance

### Test Organization

```
tests/integration/
├── hooks/
│   ├── registration.test.ts (10 tests)
│   ├── tool-interception.test.ts (40 tests)
│   ├── system-prompt.test.ts (20 tests)
│   └── compaction.test.ts (10 tests)
├── lifecycle/
│   ├── session.test.ts (25 tests)
│   └── plugin-loading.test.ts (10 tests)
├── flows/
│   ├── error-recovery.test.ts (20 tests)
│   └── workflow.test.ts (20 tests)
└── fixtures/
    └── test-project/
```

### OpenCode Integration Setup

```typescript
// tests/integration/setup.ts
import { loadPlugin } from '@opencode-ai/plugin'

let pluginInstance: any

export async function setupOpenCode() {
  // Load plugin
  pluginInstance = await loadPlugin('./dist/plugin/index.js')
  
  // Create test project
  await createTestProject()
  
  return pluginInstance
}

export async function teardownOpenCode() {
  // Cleanup test project
  await cleanupTestProject()
}
```

### Example Integration Tests

```typescript
describe('Plugin Integration', () => {
  let plugin: any
  
  beforeAll(async () => {
    plugin = await setupOpenCode()
  })
  
  afterAll(async () => {
    await teardownOpenCode()
  })
  
  test('registers all required hooks', () => {
    expect(plugin.event).toBeDefined()
    expect(plugin['tool.execute.before']).toBeDefined()
    expect(plugin['tool.execute.after']).toBeDefined()
    expect(plugin['experimental.chat.system.transform']).toBeDefined()
    expect(plugin.stop).toBeDefined()
  })
  
  test('creates session state on session.created event', async () => {
    await plugin.event({ type: 'session.created', sessionId: 'test-1' })
    
    const state = getSessionState('test-1')
    expect(state).toBeDefined()
    expect(state.workflow.currentPhase).toBe('intent')
  })
})

describe('Tool Interception', () => {
  test('blocks dangerous bash command', async () => {
    const result = await plugin['tool.execute.before']({
      tool: 'bash',
      input: { command: 'rm -rf /' },
      sessionId: 'test-1'
    })
    
    expect(result.action).toBe('deny')
    expect(result.reason).toContain('dangerous')
  })
  
  test('allows safe bash command', async () => {
    const result = await plugin['tool.execute.before']({
      tool: 'bash',
      input: { command: 'ls -la' },
      sessionId: 'test-1'
    })
    
    expect(result.action).toBe('allow')
  })
})
```

---

## Acceptance Criteria

### Functional
- [ ] 150 integration tests implemented
- [ ] All test categories covered
- [ ] OpenCode integration setup working
- [ ] Test fixtures created
- [ ] All tests passing

### Quality
- [ ] Tests run against actual OpenCode
- [ ] Clean setup/teardown
- [ ] No test pollution (isolated sessions)
- [ ] Execution time <30s

### Documentation
- [ ] Integration test setup documented
- [ ] OpenCode requirements documented

---

## Effort Estimate

**From Master Plan**: 2 days (Week 6)