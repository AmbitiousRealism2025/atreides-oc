# [MVP-A1] Generate MVP Agent Files & Templates

## Context

Create agent file templates and generation logic for the 5 MVP agents (Stilgar, Explore, Librarian, Build, Plan). These files define agent personas, responsibilities, and configurations that OpenCode loads automatically.

**References**:
- Component Spec: spec:bf063507-9358-4515-afbb-3080f2099467/ff63fc20-7b0f-482a-8a2b-c119d1bda2c1
- Technical Plan: spec:bf063507-9358-4515-afbb-3080f2099467/5cdb5788-a716-4cb2-a301-6ccd6f64a488
- Deep Dive: file:archive/ATREIDES_DEEP_DIVE_FINDINGS.md (Section 2: Agent System)

**Dependencies**:
- ticket:bf063507-9358-4515-afbb-3080f2099467/dfe5e47e-1ae6-46a4-aa40-56d07507a959 (CLI framework for generation)

---

## Scope

### In Scope
- Create 5 agent template files (Stilgar, Explore, Librarian, Build, Plan)
- Agent file generation logic in init wizard
- Model configuration per agent
- Tool permission definitions
- Agent frontmatter schema
- Customization zone markers

### Out of Scope
- Post-MVP agents (Frontend-UI-UX, Document-Writer, General)
- Dynamic agent creation
- Agent analytics

---

## Implementation Guidance

### Agent Template Structure

**File**: `templates/agents/stilgar.md.template`

```markdown
---
name: stilgar
displayName: Stilgar
model: {{model}}
enabled: true
---

# Stilgar (Oracle)

High-level orchestration and strategic decision-making agent.

## Responsibilities

- Classify user intent and determine appropriate workflow
- Decompose complex tasks into manageable subtasks
- Delegate work to specialized agents
- Handle error escalations and recovery
- Provide strategic guidance and planning

## Tool Permissions

Full access to all tools (orchestrator role).

## Guidelines

- Focus on high-level strategy, not implementation details
- Delegate specialized work to appropriate agents
- Maintain workflow phase awareness
- Escalate only when necessary
- Provide clear delegation announcements

<!-- CUSTOM RULES START -->
<!-- User customizations preserved here -->
<!-- CUSTOM RULES END -->
```

### Generation Logic

```typescript
interface AgentConfig {
  name: string
  displayName: string
  model: string
  enabled: boolean
}

class AgentGenerator {
  async generateAgentFiles(configs: AgentConfig[]): Promise<void> {
    for (const config of configs) {
      const template = await this.loadTemplate(config.name)
      const rendered = this.renderTemplate(template, config)
      const outputPath = `.opencode/agent/${config.name}.md`
      
      await writeFile(outputPath, rendered)
    }
  }
  
  private renderTemplate(template: string, config: AgentConfig): string {
    return template
      .replace(/{{name}}/g, config.name)
      .replace(/{{displayName}}/g, config.displayName)
      .replace(/{{model}}/g, config.model)
  }
}
```

### Agent Configurations

```typescript
const MVP_AGENTS: AgentConfig[] = [
  {
    name: 'stilgar',
    displayName: 'Stilgar',
    model: 'claude-sonnet-4',  // Default, user can override
    enabled: true
  },
  {
    name: 'explore',
    displayName: 'Explore',
    model: 'claude-haiku-4-5',  // Fast for exploration
    enabled: true
  },
  {
    name: 'librarian',
    displayName: 'Librarian',
    model: 'claude-sonnet-4',
    enabled: true
  },
  {
    name: 'build',
    displayName: 'Build',
    model: 'claude-sonnet-4',
    enabled: true
  },
  {
    name: 'plan',
    displayName: 'Plan',
    model: 'claude-sonnet-4',
    enabled: true
  }
]
```

---

## Acceptance Criteria

### Functional
- [ ] 5 agent template files created
- [ ] Agent generation logic implemented
- [ ] Model configuration working
- [ ] Frontmatter schema correct
- [ ] Customization zones marked
- [ ] Files generated in `.opencode/agent/` directory
- [ ] Integration with init wizard working

### Quality
- [ ] Unit tests for template rendering
- [ ] Unit tests for file generation
- [ ] Integration tests with init wizard
- [ ] Template validation (frontmatter, markdown)

### Documentation
- [ ] Agent template format documented
- [ ] Frontmatter schema documented
- [ ] Customization guidelines

---

## Testing Strategy

```typescript
describe('Agent Generator', () => {
  test('generates all 5 MVP agent files', async () => {
    await generator.generateAgentFiles(MVP_AGENTS)
    
    expect(existsSync('.opencode/agent/stilgar.md')).toBe(true)
    expect(existsSync('.opencode/agent/explore.md')).toBe(true)
    expect(existsSync('.opencode/agent/librarian.md')).toBe(true)
    expect(existsSync('.opencode/agent/build.md')).toBe(true)
    expect(existsSync('.opencode/agent/plan.md')).toBe(true)
  })
  
  test('renders template with model configuration', async () => {
    const config = { name: 'stilgar', displayName: 'Stilgar', model: 'claude-opus-4', enabled: true }
    await generator.generateAgentFiles([config])
    
    const content = await readFile('.opencode/agent/stilgar.md', 'utf-8')
    expect(content).toContain('model: claude-opus-4')
  })
})
```

---

## Effort Estimate

**From Master Plan**: 2 days (Week 3-4)