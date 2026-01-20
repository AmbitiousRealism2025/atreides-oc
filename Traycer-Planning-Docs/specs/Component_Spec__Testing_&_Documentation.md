# Component Spec: Testing & Documentation

## Overview

This spec defines the testing infrastructure and documentation strategy for Atreides OpenCode, targeting 466 tests with >80% coverage to match the original Atreides quality standards.

**References**:
- Technical Plan: spec:bf063507-9358-4515-afbb-3080f2099467/5cdb5788-a716-4cb2-a301-6ccd6f64a488 (Section 4)
- Master Plan: file:ATREIDES_OC_MASTER_PLAN.md (Section 6: Phase Breakdown, Section 7: Acceptance Criteria)
- Deep Dive: file:archive/ATREIDES_DEEP_DIVE_FINDINGS.md (Section 5: Testing Infrastructure)

---

## Testing Infrastructure

### Test Categories

#### 1. Unit Tests (Business Logic)
**Target**: ~200 tests

**Coverage**:
- Security pattern matching (56 tests)
- Obfuscation detection (20 tests)
- Error pattern detection (22 tests)
- Configuration merging (15 tests)
- State management (30 tests)
- Template processing (25 tests)
- Workflow phase logic (20 tests)
- Todo tracking (12 tests)

**Framework**: Bun's built-in test runner

**Pattern**:
```typescript
import { describe, test, expect } from 'bun:test'

describe('SecurityHardening', () => {
  test('detects URL-encoded rm command', () => {
    const command = 'rm%20-rf%20/'
    const result = detectObfuscation(command)
    expect(result.normalized).toBe('rm -rf /')
    expect(result.dangerous).toBe(true)
  })
})
```

---

#### 2. Integration Tests (Hook Execution)
**Target**: ~150 tests

**Coverage**:
- Hook registration (10 tests)
- Event handling (15 tests)
- Tool interception (40 tests)
- System prompt injection (20 tests)
- Session lifecycle (25 tests)
- Error recovery flow (20 tests)
- Workflow transitions (20 tests)

**Requirements**: OpenCode installation

**Pattern**:
```typescript
import { describe, test, expect } from 'bun:test'
import { loadPlugin } from '@opencode-ai/plugin'

describe('Plugin Integration', () => {
  test('registers all hooks', async () => {
    const plugin = await loadPlugin('./dist/plugin/index.js')
    expect(plugin.event).toBeDefined()
    expect(plugin['tool.execute.before']).toBeDefined()
    expect(plugin['tool.execute.after']).toBeDefined()
  })
})
```

---

#### 3. CLI Tests
**Target**: ~50 tests

**Coverage**:
- Init wizard flow (15 tests)
- Doctor diagnostics (15 tests)
- Update command (10 tests)
- Project detection (10 tests)

**Mocking**: File system, user input

**Pattern**:
```typescript
import { describe, test, expect } from 'bun:test'
import { runInit } from '../src/cli/commands/init'

describe('Init Command', () => {
  test('generates all required files', async () => {
    const result = await runInit({ mode: 'standard' })
    expect(result.files).toContain('opencode.json')
    expect(result.files).toContain('AGENTS.md')
    expect(result.files).toContain('.opencode/agent/stilgar.md')
  })
})
```

---

#### 4. End-to-End Tests
**Target**: ~30 tests

**Coverage**:
- Complete init flow (5 tests)
- Full AI session with orchestration (10 tests)
- Update with customizations (5 tests)
- Error recovery scenarios (10 tests)

**Requirements**: OpenCode installation, test project

**Pattern**:
```typescript
import { describe, test, expect } from 'bun:test'

describe('E2E: Init to First Session', () => {
  test('complete onboarding flow', async () => {
    // Run init
    await runInit()
    
    // Start OpenCode session
    const session = await startSession()
    
    // Verify plugin loaded
    expect(session.plugins).toContain('atreides-opencode')
    
    // Verify AGENTS.md injected
    expect(session.systemPrompt).toContain('Muad\'Dib')
  })
})
```

---

#### 5. Security Tests
**Target**: ~36 tests (56 total security patterns)

**Coverage**:
- Obfuscation detection (20 tests)
- Blocked patterns (22 tests)
- File guards (14 tests)

**Pattern**:
```typescript
describe('Security: Obfuscation Detection', () => {
  test('detects hex-encoded rm', () => {
    const command = '\\x72\\x6d -rf /'
    expect(isBlocked(command)).toBe(true)
  })
  
  test('detects quote-stripped rm', () => {
    const command = "r'm' -rf /"
    expect(isBlocked(command)).toBe(true)
  })
})
```

---

### Test Infrastructure Setup

**Directory Structure**:
```
tests/
├── unit/
│   ├── security/
│   │   ├── obfuscation.test.ts
│   │   ├── patterns.test.ts
│   │   └── file-guards.test.ts
│   ├── workflow/
│   │   ├── phase-tracking.test.ts
│   │   └── transitions.test.ts
│   ├── error-recovery/
│   │   └── strike-counter.test.ts
│   └── state/
│       └── session-manager.test.ts
├── integration/
│   ├── hooks/
│   │   ├── tool-interception.test.ts
│   │   └── system-prompt.test.ts
│   └── lifecycle/
│       └── session.test.ts
├── cli/
│   ├── init.test.ts
│   ├── doctor.test.ts
│   └── update.test.ts
├── e2e/
│   ├── onboarding.test.ts
│   └── orchestration.test.ts
└── fixtures/
    ├── templates/
    ├── projects/
    └── mocks/
```

**Test Utilities**:
```typescript
// tests/utils/mock-context.ts
export function createMockContext(overrides = {}) {
  return {
    project: { root: '/test/project' },
    client: mockClient,
    $: mockShell,
    ...overrides
  }
}

// tests/utils/mock-session.ts
export function createMockSession(sessionId = 'test-session') {
  return {
    sessionId,
    createdAt: Date.now(),
    workflow: { currentPhase: 'intent', phaseHistory: [] },
    errorRecovery: { strikeCount: 0, escalated: false },
    todos: { created: [], completed: [], pending: [] },
    toolHistory: [],
    custom: {}
  }
}
```

---

### Coverage Targets

**Overall**: >80% code coverage

**Critical Components**: >90% coverage
- SecurityHardening
- ErrorRecovery
- SessionManager
- ToolInterceptor

**Measurement**: Bun's built-in coverage tool

**CI Integration**: Coverage reports on every PR

---

## Documentation Strategy

### User Documentation

#### 1. README.md
**Location**: Root of npm package

**Sections**:
- Quick start
- Installation
- Features overview
- Basic usage
- Configuration
- Troubleshooting
- Contributing

**Audience**: New users, quick reference

---

#### 2. AGENTS.md Template
**Location**: `templates/AGENTS.md.template`

**Sections**:
- Orchestration overview
- Workflow phases
- Agent descriptions
- Delegation guidelines
- Custom rules section

**Audience**: AI (injected into system prompt)

---

#### 3. CLI Help
**Location**: Inline in CLI commands

**Commands**:
- `atreides-opencode --help`
- `atreides-opencode init --help`
- `atreides-opencode doctor --help`
- `atreides-opencode update --help`

**Format**: Standard CLI help format

---

#### 4. Configuration Guide
**Location**: `docs/configuration.md`

**Sections**:
- opencode.json structure
- Agent configuration
- Skill configuration
- Permission setup
- Identity customization

**Audience**: Power users, customization

---

### Developer Documentation

#### 1. Architecture Overview
**Location**: `docs/architecture.md`

**Sections**:
- System architecture
- Component diagram
- Hook flow
- State management
- Security architecture

**Audience**: Contributors, maintainers

---

#### 2. Plugin Development Guide
**Location**: `docs/plugin-development.md`

**Sections**:
- Plugin structure
- Hook implementation
- Testing guidelines
- Performance considerations
- Error handling patterns

**Audience**: Contributors

---

#### 3. API Reference
**Location**: `docs/api.md`

**Sections**:
- Public APIs
- Hook signatures
- Configuration schema
- State interfaces
- Utility functions

**Audience**: Advanced users, contributors

---

#### 4. Contributing Guide
**Location**: `CONTRIBUTING.md`

**Sections**:
- Development setup
- Code style
- Testing requirements
- PR process
- Release process

**Audience**: Contributors

---

### Code Documentation

**TSDoc Comments**: All public APIs

**Example**:
```typescript
/**
 * Detects command obfuscation using multiple transformation techniques.
 * 
 * @param command - The command string to analyze
 * @returns Normalized command and danger assessment
 * 
 * @example
 * ```typescript
 * const result = detectObfuscation('rm%20-rf%20/')
 * console.log(result.normalized) // 'rm -rf /'
 * console.log(result.dangerous) // true
 * ```
 */
export function detectObfuscation(command: string): ObfuscationResult {
  // Implementation
}
```

---

## Quality Gates

### Pre-Commit
- Linting (ESLint)
- Type checking (TypeScript)
- Formatting (Prettier)

### Pre-Push
- Unit tests pass
- Coverage >80%

### CI/CD
- All tests pass
- Integration tests pass
- E2E tests pass
- Coverage report generated
- Security scan (npm audit)

### Release
- All quality gates pass
- Documentation updated
- Changelog generated
- Version bumped

---

## Performance Benchmarks

**Test Suite Performance**:
- Unit tests: <5s
- Integration tests: <30s
- E2E tests: <2min
- Full suite: <3min

**Measurement**: Bun's built-in benchmarking

**CI Timeout**: 5min

---

## Test Data & Fixtures

**Security Patterns**: `tests/fixtures/security-patterns.json`
```json
{
  "dangerous": [
    "rm -rf /",
    "mkfs /dev/sda",
    ":(){ :|:& };:"
  ],
  "obfuscated": [
    "rm%20-rf%20/",
    "\\x72\\x6d -rf /",
    "r'm' -rf /"
  ]
}
```

**Project Templates**: `tests/fixtures/projects/`
- `node-project/`
- `typescript-project/`
- `python-project/`
- `empty-project/`

**Mock Responses**: `tests/fixtures/mocks/`
- `opencode-context.json`
- `tool-outputs.json`
- `ai-responses.json`