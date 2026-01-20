# Component Spec: Agent & Skill System

## Overview

This spec defines the agent and skill system for Atreides OpenCode. Agents are specialized AI personas for different tasks, and skills are reusable capabilities that agents can invoke.

**References**:
- Technical Plan: spec:bf063507-9358-4515-afbb-3080f2099467/5cdb5788-a716-4cb2-a301-6ccd6f64a488
- Master Plan: file:ATREIDES_OC_MASTER_PLAN.md (Section 4: Component Migration Map)
- Deep Dive: file:archive/ATREIDES_DEEP_DIVE_FINDINGS.md (Section 2: Agent System, Section 3: Skill System)

---

## Agent System

### MVP Agents (5 total)

#### 1. Stilgar (Oracle Agent)
**Renamed from**: Oracle (per user request)

**Purpose**: High-level orchestration and decision-making

**Model**: `claude-sonnet-4` (default)

**Responsibilities**:
- Intent classification
- Task decomposition
- Agent delegation decisions
- Error escalation handling
- Strategic planning

**Tool Permissions**: Full access (orchestrator role)

**Display Name**: "Stilgar"

---

#### 2. Explore Agent

**Purpose**: Context gathering and codebase exploration

**Model**: `claude-haiku-4-5` (default, fast for exploration)

**Responsibilities**:
- File discovery
- Code analysis
- Dependency mapping
- Pattern detection
- Context summarization

**Tool Permissions**:
- `read`: allow
- `grep_search`: allow
- `file_search`: allow
- `list_dir`: allow
- `edit`: deny
- `bash`: deny

**Display Name**: "Explore"

---

#### 3. Librarian Agent

**Purpose**: Documentation and knowledge management

**Model**: `claude-sonnet-4` (default)

**Responsibilities**:
- Documentation writing
- README generation
- API documentation
- Code comments
- Knowledge base updates

**Tool Permissions**:
- `read`: allow
- `edit`: allow (documentation files only)
- `bash`: deny

**Display Name**: "Librarian"

---

#### 4. Build Agent

**Purpose**: Code implementation and modification

**Model**: `claude-sonnet-4` (default)

**Responsibilities**:
- Code writing
- Refactoring
- Bug fixes
- Feature implementation
- Test writing

**Tool Permissions**:
- `read`: allow
- `edit`: allow
- `bash`: allow (build commands only)

**Display Name**: "Build"

---

#### 5. Plan Agent

**Purpose**: Project planning and task breakdown

**Model**: `claude-sonnet-4` (default)

**Responsibilities**:
- Task decomposition
- Dependency analysis
- Timeline estimation
- Risk assessment
- Milestone planning

**Tool Permissions**:
- `read`: allow
- `edit`: allow (planning docs only)
- `bash`: deny

**Display Name**: "Plan"

---

### Post-MVP Agents (3 additional)

#### 6. Frontend-UI-UX Agent
**Model**: `claude-sonnet-4`
**Purpose**: UI/UX design and frontend implementation
**Phase**: Post-MVP Phase 1

#### 7. Document-Writer Agent
**Model**: `claude-sonnet-4`
**Purpose**: Technical writing and documentation
**Phase**: Post-MVP Phase 1

#### 8. General Agent
**Model**: `claude-haiku-4-5`
**Purpose**: General-purpose tasks and fallback
**Phase**: Post-MVP Phase 1

---

## Agent File Structure

**Location**: `.opencode/agent/{agent-name}.md`

**Template Format**:
```markdown
---
name: {agent-name}
displayName: {display-name}
model: {model-id}
enabled: true
---

# {Agent Display Name}

{Agent description and purpose}

## Responsibilities

- {Responsibility 1}
- {Responsibility 2}
- ...

## Tool Permissions

{Tool permission configuration}

## Guidelines

{Agent-specific guidelines and best practices}

<!-- CUSTOM RULES START -->
{User customizations preserved here}
<!-- CUSTOM RULES END -->
```

**Example** (Stilgar):
```markdown
---
name: stilgar
displayName: Stilgar
model: claude-sonnet-4
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
<!-- CUSTOM RULES END -->
```

---

## Skill System

### MVP Skills (4 total)

#### 1. base (SKILL.md)
**Purpose**: Base skill template and documentation

**Location**: `.opencode/skill/base/SKILL.md`

**Context Type**: `main`

**Description**: Foundational skill that documents the skill system and provides templates for creating new skills.

**Content**:
- Skill system overview
- Skill creation guidelines
- Context type explanation (main vs fork)
- Frontmatter schema
- Best practices

---

#### 2. orchestrate
**Purpose**: Workflow orchestration and agent delegation

**Location**: `.opencode/skill/orchestrate/SKILL.md`

**Context Type**: `main`

**Responsibilities**:
- Intent classification
- Workflow phase tracking
- Agent delegation
- Task decomposition
- Progress monitoring

**Usage**: Invoked by Stilgar for high-level orchestration

---

#### 3. explore
**Purpose**: Codebase exploration and context gathering

**Location**: `.opencode/skill/explore/SKILL.md`

**Context Type**: `fork`

**Responsibilities**:
- File discovery
- Code analysis
- Dependency mapping
- Pattern detection
- Context summarization

**Usage**: Invoked by Explore agent for investigation tasks

---

#### 4. validate
**Purpose**: Code validation and quality checks

**Location**: `.opencode/skill/validate/SKILL.md`

**Context Type**: `fork`

**Responsibilities**:
- Syntax checking
- Linting
- Test execution
- Security scanning
- Quality metrics

**Usage**: Invoked during Verification workflow phase

---

### Post-MVP Skills (8 additional)

#### 5. lsp
**Purpose**: Language Server Protocol integration
**Context Type**: `fork`
**Phase**: Post-MVP Phase 2

#### 6. refactor
**Purpose**: Code refactoring and restructuring
**Context Type**: `fork`
**Phase**: Post-MVP Phase 2

#### 7. checkpoint
**Purpose**: State checkpointing and backup
**Context Type**: `main`
**Phase**: Post-MVP Phase 2

#### 8. tdd
**Purpose**: Test-driven development workflow
**Context Type**: `fork`
**Phase**: Post-MVP Phase 2

#### 9. parallel-explore
**Purpose**: Parallel codebase exploration
**Context Type**: `fork`
**Phase**: Post-MVP Phase 2

#### 10. incremental-refactor
**Purpose**: Incremental refactoring with validation
**Context Type**: `fork`
**Phase**: Post-MVP Phase 2

#### 11. doc-sync
**Purpose**: Documentation synchronization
**Context Type**: `fork`
**Phase**: Post-MVP Phase 2

#### 12. quality-gate
**Purpose**: Quality gate enforcement
**Context Type**: `fork`
**Phase**: Post-MVP Phase 2

---

## Skill File Structure

**Location**: `.opencode/skill/{skill-name}/SKILL.md`

**Frontmatter Schema**:
```yaml
---
name: {skill-name}
contextType: main | fork
enabled: true
description: {brief description}
---
```

**Template Format**:
```markdown
---
name: {skill-name}
contextType: main | fork
enabled: true
description: {brief description}
---

# {Skill Name}

{Detailed description}

## Purpose

{What this skill does and when to use it}

## Context Type

- **main**: Executes in main conversation context
- **fork**: Executes in forked context (parallel)

## Usage

{How to invoke this skill}

## Implementation

{Implementation details and guidelines}

<!-- CUSTOM IMPLEMENTATION START -->
{User customizations preserved here}
<!-- CUSTOM IMPLEMENTATION END -->
```

---

## Agent-Skill Mapping

**Stilgar** (Oracle):
- orchestrate (primary)
- All skills available for delegation

**Explore**:
- explore (primary)
- parallel-explore (post-MVP)

**Librarian**:
- doc-sync (post-MVP)

**Build**:
- refactor (post-MVP)
- tdd (post-MVP)
- incremental-refactor (post-MVP)

**Plan**:
- orchestrate (secondary)

**All Agents**:
- validate (verification phase)
- checkpoint (post-MVP)
- quality-gate (post-MVP)

---

## Configuration in opencode.json

```json
{
  "atreides": {
    "agents": {
      "stilgar": {
        "model": "claude-sonnet-4",
        "displayName": "Stilgar",
        "enabled": true
      },
      "explore": {
        "model": "claude-haiku-4-5",
        "displayName": "Explore",
        "enabled": true
      },
      "librarian": {
        "model": "claude-sonnet-4",
        "displayName": "Librarian",
        "enabled": true
      },
      "build": {
        "model": "claude-sonnet-4",
        "displayName": "Build",
        "enabled": true
      },
      "plan": {
        "model": "claude-sonnet-4",
        "displayName": "Plan",
        "enabled": true
      }
    },
    "skills": {
      "base": { "enabled": true },
      "orchestrate": { "enabled": true },
      "explore": { "enabled": true },
      "validate": { "enabled": true }
    }
  }
}
```

---

## Generation Strategy

**During Init**:
1. Copy agent templates from npm package
2. Apply user-selected models
3. Generate agent markdown files
4. Copy skill templates
5. Update opencode.json with agent/skill config

**During Update**:
1. Detect customized agent files (hash comparison)
2. Preserve custom sections
3. Update template sections
4. Merge new agents/skills
5. Update opencode.json

---

## Testing Strategy

**Agent Tests**:
- Verify agent file generation
- Test model configuration
- Validate permission mappings
- Test display name formatting

**Skill Tests**:
- Verify skill file generation
- Test context type handling
- Validate frontmatter parsing
- Test skill enablement

**Integration Tests**:
- Test agent delegation
- Test skill invocation
- Verify OpenCode loading
- Test permission enforcement