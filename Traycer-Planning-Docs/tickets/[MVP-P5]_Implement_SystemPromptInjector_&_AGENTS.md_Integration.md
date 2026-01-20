# [MVP-P5] Implement SystemPromptInjector & AGENTS.md Integration

## Context

Implement the SystemPromptInjector component that reads AGENTS.md from the file system and injects orchestration rules into the system prompt via the `experimental.chat.system.transform` hook. This is the core mechanism for providing AI with orchestration guidance.

**References**:
- Component Spec: spec:bf063507-9358-4515-afbb-3080f2099467/2b47fd09-6d7f-46bd-9e1d-f07c29d89bf5
- Technical Plan: spec:bf063507-9358-4515-afbb-3080f2099467/5cdb5788-a716-4cb2-a301-6ccd6f64a488 (Section 3.1.6)
- Core Flows: spec:bf063507-9358-4515-afbb-3080f2099467/f32d7c5a-99f4-4e9f-99f3-c04d552db8c7

**Dependencies**:
- ticket:bf063507-9358-4515-afbb-3080f2099467/571324aa-79f0-4026-bccd-8602bf38968f (Init wizard must generate AGENTS.md)

---

## Scope

### In Scope
- SystemPromptInjector class implementation
- AGENTS.md file reading and parsing
- Markdown syntax validation
- System prompt injection via `experimental.chat.system.transform` hook
- Identity formatting (persona name, response prefix)
- Graceful degradation (use defaults if AGENTS.md invalid)
- Warning injection if file invalid
- Caching validated AGENTS.md

### Out of Scope
- File watching (post-MVP)
- Dynamic AGENTS.md updates during session
- Custom validation rules
- AGENTS.md editor UI

---

## Implementation Guidance

```typescript
class SystemPromptInjector {
  private cachedAgentsMd: string | null = null
  private cacheTimestamp: number = 0
  
  constructor(private identityManager: IdentityManager) {}
  
  async inject(originalPrompt: string, sessionId: string): Promise<string> {
    try {
      // Read AGENTS.md
      const agentsMd = await this.readAgentsMd()
      
      // Validate syntax
      if (!this.validateMarkdown(agentsMd)) {
        logger.warn('Invalid AGENTS.md syntax, using defaults')
        return this.injectDefaults(originalPrompt)
      }
      
      // Build enhanced prompt
      const identityHeader = this.identityManager.formatHeader()
      const enhancedPrompt = `${originalPrompt}\n\n${identityHeader}\n\n${agentsMd}`
      
      return enhancedPrompt
    } catch (error) {
      logger.error('System prompt injection error', error)
      return this.injectDefaults(originalPrompt)
    }
  }
  
  private async readAgentsMd(): Promise<string> {
    // Check cache (valid for 60 seconds)
    if (this.cachedAgentsMd && Date.now() - this.cacheTimestamp < 60000) {
      return this.cachedAgentsMd
    }
    
    // Read from file system
    const path = join(process.cwd(), 'AGENTS.md')
    const content = await readFile(path, 'utf-8')
    
    // Update cache
    this.cachedAgentsMd = content
    this.cacheTimestamp = Date.now()
    
    return content
  }
  
  private validateMarkdown(content: string): boolean {
    // Basic validation: check for required sections
    const requiredSections = ['# Orchestration', '## Workflow', '## Agents']
    return requiredSections.every(section => content.includes(section))
  }
  
  private injectDefaults(originalPrompt: string): string {
    const defaultRules = `
# Atreides Orchestration (Default Rules)

⚠️ Warning: AGENTS.md not found or invalid. Using default orchestration rules.

## Workflow
Follow structured problem-solving: Intent → Assessment → Exploration → Implementation → Verification

## Agents
Delegate specialized work to appropriate agents when needed.
`
    return `${originalPrompt}\n\n${defaultRules}`
  }
}
```

### Identity Formatting

```typescript
class IdentityManager {
  formatHeader(): string {
    const config = this.getConfig()
    
    if (!config.identity.responsePrefix) {
      return ''
    }
    
    return `[${config.identity.personaName}]: I am your AI orchestration assistant.`
  }
  
  formatDelegationAnnouncement(agentName: string, before: boolean): string {
    if (!this.getConfig().identity.delegationAnnouncements) {
      return ''
    }
    
    const persona = this.getConfig().identity.personaName
    
    if (before) {
      return `[${persona}]: Delegating to ${agentName} agent...`
    } else {
      return `[${persona}]: ${agentName} agent has completed the task.`
    }
  }
}
```

---

## Acceptance Criteria

### Functional
- [ ] SystemPromptInjector class implemented
- [ ] AGENTS.md read from file system
- [ ] Markdown validation working
- [ ] System prompt injection via hook working
- [ ] Identity formatting applied (persona name, prefix)
- [ ] Graceful degradation if AGENTS.md invalid
- [ ] Warning shown if using defaults
- [ ] Caching implemented (60s TTL)

### Quality
- [ ] Unit tests for file reading
- [ ] Unit tests for validation logic
- [ ] Unit tests for prompt injection
- [ ] Integration tests with hook
- [ ] Error handling tested (file not found, invalid syntax)
- [ ] Performance: <50ms per injection

### Documentation
- [ ] TSDoc comments on all public methods
- [ ] AGENTS.md format documented
- [ ] Validation rules documented

---

## Testing Strategy

```typescript
describe('SystemPromptInjector', () => {
  test('reads and injects AGENTS.md', async () => {
    const prompt = await injector.inject('Original prompt', 'session-1')
    expect(prompt).toContain('Orchestration')
    expect(prompt).toContain('[Muad\'Dib]')
  })
  
  test('uses defaults if AGENTS.md invalid', async () => {
    // Mock invalid AGENTS.md
    mockReadFile.mockResolvedValue('Invalid content')
    
    const prompt = await injector.inject('Original', 'session-1')
    expect(prompt).toContain('Default Rules')
    expect(prompt).toContain('Warning')
  })
  
  test('caches AGENTS.md for 60 seconds', async () => {
    await injector.inject('Prompt', 'session-1')
    await injector.inject('Prompt', 'session-1')
    
    expect(mockReadFile).toHaveBeenCalledTimes(1)
  })
})
```

---

## Effort Estimate

**From Master Plan**: 2 days (Week 3-4)