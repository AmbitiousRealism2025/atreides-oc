# [MVP-P8] Implement IdentityManager & Persona Formatting

## Context

Implement the IdentityManager component that handles agent identity and branding, including persona name formatting, response prefixes, and delegation announcements. This provides consistent identity across all orchestration interactions.

**References**:
- Component Spec: spec:bf063507-9358-4515-afbb-3080f2099467/2b47fd09-6d7f-46bd-9e1d-f07c29d89bf5
- Technical Plan: spec:bf063507-9358-4515-afbb-3080f2099467/5cdb5788-a716-4cb2-a301-6ccd6f64a488 (Section 3.1.9)
- Deep Dive: file:archive/ATREIDES_DEEP_DIVE_FINDINGS.md (Section 1: Identity System)

**Dependencies**: None (standalone component)

---

## Scope

### In Scope
- IdentityManager class implementation
- Persona name configuration (default: "Muad'Dib")
- Response prefix formatting (`[Persona]:`)
- Delegation announcement generation
- Agent display name mappings
- Configuration loading from opencode.json

### Out of Scope
- Custom identity templates
- Multi-persona support
- Identity switching during session

---

## Implementation Guidance

```typescript
interface IdentityConfig {
  personaName: string          // Default: "Muad'Dib"
  responsePrefix: boolean      // Default: true
  delegationAnnouncements: boolean  // Default: true
}

class IdentityManager {
  private config: IdentityConfig
  private agentDisplayNames: Map<string, string>
  
  constructor(config: IdentityConfig) {
    this.config = config
    this.agentDisplayNames = new Map([
      ['stilgar', 'Stilgar'],
      ['explore', 'Explore'],
      ['librarian', 'Librarian'],
      ['build', 'Build'],
      ['plan', 'Plan']
    ])
  }
  
  formatHeader(): string {
    if (!this.config.responsePrefix) {
      return ''
    }
    
    return `[${this.config.personaName}]:`
  }
  
  formatResponse(message: string): string {
    if (!this.config.responsePrefix) {
      return message
    }
    
    return `[${this.config.personaName}]: ${message}`
  }
  
  formatDelegationAnnouncement(agentName: string, phase: 'before' | 'after'): string {
    if (!this.config.delegationAnnouncements) {
      return ''
    }
    
    const displayName = this.agentDisplayNames.get(agentName) || agentName
    const persona = this.config.personaName
    
    if (phase === 'before') {
      return `[${persona}]: I'll delegate this to the ${displayName} agent to handle this task.`
    } else {
      return `[${persona}]: The ${displayName} agent has completed the task. Here's what we found...`
    }
  }
  
  getAgentDisplayName(agentName: string): string {
    return this.agentDisplayNames.get(agentName) || agentName
  }
  
  setAgentDisplayName(agentName: string, displayName: string): void {
    this.agentDisplayNames.set(agentName, displayName)
  }
}
```

### Configuration Loading

```typescript
function loadIdentityConfig(): IdentityConfig {
  try {
    const configPath = join(process.cwd(), 'opencode.json')
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    
    return {
      personaName: config.atreides?.identity?.personaName || 'Muad\'Dib',
      responsePrefix: config.atreides?.identity?.responsePrefix ?? true,
      delegationAnnouncements: config.atreides?.identity?.delegationAnnouncements ?? true
    }
  } catch (error) {
    logger.warn('Failed to load identity config, using defaults')
    return {
      personaName: 'Muad\'Dib',
      responsePrefix: true,
      delegationAnnouncements: true
    }
  }
}
```

---

## Acceptance Criteria

### Functional
- [ ] IdentityManager class implemented
- [ ] Persona name configurable via opencode.json
- [ ] Response prefix formatting working
- [ ] Delegation announcements generated (before/after)
- [ ] Agent display name mappings working
- [ ] Configuration loaded from opencode.json
- [ ] Defaults used if config missing

### Quality
- [ ] Unit tests for all formatting methods
- [ ] Unit tests for configuration loading
- [ ] Error handling tested (invalid config)
- [ ] Performance: <1ms per format operation

### Documentation
- [ ] TSDoc comments on all public methods
- [ ] Configuration schema documented
- [ ] Agent display names documented

---

## Testing Strategy

```typescript
describe('IdentityManager', () => {
  test('formats response with persona prefix', () => {
    const formatted = manager.formatResponse('Hello')
    expect(formatted).toBe('[Muad\'Dib]: Hello')
  })
  
  test('generates delegation announcement (before)', () => {
    const announcement = manager.formatDelegationAnnouncement('explore', 'before')
    expect(announcement).toContain('delegate')
    expect(announcement).toContain('Explore agent')
  })
  
  test('generates delegation announcement (after)', () => {
    const announcement = manager.formatDelegationAnnouncement('explore', 'after')
    expect(announcement).toContain('completed')
  })
  
  test('loads custom persona from config', () => {
    const config = { personaName: 'Atreides', responsePrefix: true, delegationAnnouncements: true }
    const manager = new IdentityManager(config)
    
    expect(manager.formatHeader()).toBe('[Atreides]:')
  })
})
```

---

## Effort Estimate

**From Master Plan**: 1 day (Week 4)