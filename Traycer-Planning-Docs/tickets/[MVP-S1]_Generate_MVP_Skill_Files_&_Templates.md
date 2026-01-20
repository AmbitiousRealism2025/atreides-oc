# [MVP-S1] Generate MVP Skill Files & Templates

## Context

Create skill file templates and generation logic for the 4 MVP skills (base, orchestrate, explore, validate). Skills are reusable capabilities that agents can invoke, with context types determining execution mode (main vs fork).

**References**:
- Component Spec: spec:bf063507-9358-4515-afbb-3080f2099467/ff63fc20-7b0f-482a-8a2b-c119d1bda2c1
- Technical Plan: spec:bf063507-9358-4515-afbb-3080f2099467/5cdb5788-a716-4cb2-a301-6ccd6f64a488
- Deep Dive: file:archive/ATREIDES_DEEP_DIVE_FINDINGS.md (Section 3: Skill System)

**Dependencies**:
- ticket:bf063507-9358-4515-afbb-3080f2099467/dfe5e47e-1ae6-46a4-aa40-56d07507a959 (CLI framework)

---

## Scope

### In Scope
- Create 4 skill template files (base, orchestrate, explore, validate)
- Skill file generation logic
- Frontmatter schema (name, contextType, enabled, description)
- Context type definitions (main vs fork)
- Skill directory structure

### Out of Scope
- Post-MVP skills (lsp, refactor, checkpoint, tdd, etc.)
- Dynamic skill creation
- Skill analytics

---

## Implementation Guidance

### Skill Template Structure

**File**: `templates/skills/orchestrate/SKILL.md.template`

```markdown
---
name: orchestrate
contextType: main
enabled: true
description: Workflow orchestration and agent delegation
---

# Orchestrate Skill

High-level workflow orchestration and agent delegation capability.

## Purpose

This skill provides the ability to:
- Classify user intent
- Track workflow phases
- Delegate tasks to specialized agents
- Monitor progress and coordinate work

## Context Type

**main**: Executes in the main conversation context, maintaining full session state and workflow tracking.

## Usage

Invoked by Stilgar (Oracle) agent for high-level orchestration tasks.

## Implementation

The orchestrate skill integrates with:
- WorkflowEngine for phase tracking
- SessionManager for state management
- IdentityManager for delegation announcements

<!-- CUSTOM IMPLEMENTATION START -->
<!-- User customizations preserved here -->
<!-- CUSTOM IMPLEMENTATION END -->
```

### Skill Configurations

```typescript
interface SkillConfig {
  name: string
  contextType: 'main' | 'fork'
  enabled: boolean
  description: string
}

const MVP_SKILLS: SkillConfig[] = [
  {
    name: 'base',
    contextType: 'main',
    enabled: true,
    description: 'Base skill template and documentation'
  },
  {
    name: 'orchestrate',
    contextType: 'main',
    enabled: true,
    description: 'Workflow orchestration and agent delegation'
  },
  {
    name: 'explore',
    contextType: 'fork',
    enabled: true,
    description: 'Codebase exploration and context gathering'
  },
  {
    name: 'validate',
    contextType: 'fork',
    enabled: true,
    description: 'Code validation and quality checks'
  }
]
```

### Generation Logic

```typescript
class SkillGenerator {
  async generateSkillFiles(configs: SkillConfig[]): Promise<void> {
    for (const config of configs) {
      const template = await this.loadTemplate(config.name)
      const rendered = this.renderTemplate(template, config)
      const outputPath = `.opencode/skill/${config.name}/SKILL.md`
      
      await mkdir(dirname(outputPath), { recursive: true })
      await writeFile(outputPath, rendered)
    }
  }
  
  private renderTemplate(template: string, config: SkillConfig): string {
    return template
      .replace(/{{name}}/g, config.name)
      .replace(/{{contextType}}/g, config.contextType)
      .replace(/{{description}}/g, config.description)
  }
}
```

---

## Acceptance Criteria

### Functional
- [ ] 4 skill template files created
- [ ] Skill generation logic implemented
- [ ] Frontmatter schema correct
- [ ] Context types defined (main/fork)
- [ ] Directory structure created (`.opencode/skill/{name}/SKILL.md`)
- [ ] Integration with init wizard working

### Quality
- [ ] Unit tests for template rendering
- [ ] Unit tests for file generation
- [ ] Integration tests with init wizard
- [ ] Template validation (frontmatter, markdown)

### Documentation
- [ ] Skill template format documented
- [ ] Frontmatter schema documented
- [ ] Context type explanation

---

## Testing Strategy

```typescript
describe('Skill Generator', () => {
  test('generates all 4 MVP skill files', async () => {
    await generator.generateSkillFiles(MVP_SKILLS)
    
    expect(existsSync('.opencode/skill/base/SKILL.md')).toBe(true)
    expect(existsSync('.opencode/skill/orchestrate/SKILL.md')).toBe(true)
    expect(existsSync('.opencode/skill/explore/SKILL.md')).toBe(true)
    expect(existsSync('.opencode/skill/validate/SKILL.md')).toBe(true)
  })
  
  test('sets correct context type', async () => {
    await generator.generateSkillFiles(MVP_SKILLS)
    
    const orchestrate = await readFile('.opencode/skill/orchestrate/SKILL.md', 'utf-8')
    expect(orchestrate).toContain('contextType: main')
    
    const explore = await readFile('.opencode/skill/explore/SKILL.md', 'utf-8')
    expect(explore).toContain('contextType: fork')
  })
})
```

---

## Effort Estimate

**From Master Plan**: 2 days (Week 4-5)