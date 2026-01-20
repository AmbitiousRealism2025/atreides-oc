# Skill Templates

This directory contains templates for the skills used by Atreides OpenCode.

## Overview

Skills are reusable capabilities that agents can invoke. Each skill has a specific context type that determines how it executes:

- **main**: Executes in the main conversation context with full session state
- **fork**: Executes in a forked context for parallel/isolated operations

## MVP Skills (4 total)

| Skill | Context Type | Purpose |
|-------|--------------|---------|
| `base` | main | Foundation template and documentation |
| `orchestrate` | main | Workflow orchestration and agent delegation |
| `explore` | fork | Codebase exploration and context gathering |
| `validate` | fork | Code validation and quality checks |

## Advanced Skills - Post-MVP Phase 2, Set 1 (4 total)

| Skill | Context Type | Purpose |
|-------|--------------|---------|
| `lsp` | fork | Language Server Protocol integration for intelligent code analysis |
| `refactor` | fork | Code refactoring and restructuring for safe transformations |
| `checkpoint` | main | State checkpointing and backup for workflow recovery |
| `tdd` | fork | Test-driven development workflow for quality-first implementation |

## Extended Skills - Post-MVP Phase 2, Set 2 (4 total)

| Skill | Context Type | Purpose |
|-------|--------------|---------|
| `parallel-explore` | fork | Parallel codebase exploration for faster context gathering |
| `incremental-refactor` | fork | Incremental refactoring with validation between steps |
| `doc-sync` | fork | Documentation synchronization with code changes |
| `quality-gate` | fork | Quality gate enforcement for code standards |

## Template Structure

Each skill template uses YAML frontmatter:

```yaml
---
name: skill-name
contextType: main | fork
enabled: true
description: Human-readable description
---
```

## Template Variables

The following variables are replaced during generation:

| Variable | Description |
|----------|-------------|
| `{{name}}` | Skill identifier (lowercase) |
| `{{contextType}}` | Context type (main or fork) |
| `{{enabled}}` | Whether skill is enabled (true/false) |
| `{{description}}` | Human-readable description |

## Output Structure

Generated skills are placed in:

```
.opencode/
└── skill/
    ├── base/
    │   └── SKILL.md
    ├── orchestrate/
    │   └── SKILL.md
    ├── explore/
    │   └── SKILL.md
    ├── validate/
    │   └── SKILL.md
    ├── lsp/                    (Advanced)
    │   └── SKILL.md
    ├── refactor/               (Advanced)
    │   └── SKILL.md
    ├── checkpoint/             (Advanced)
    │   └── SKILL.md
    ├── tdd/                    (Advanced)
    │   └── SKILL.md
    ├── parallel-explore/       (Extended)
    │   └── SKILL.md
    ├── incremental-refactor/   (Extended)
    │   └── SKILL.md
    ├── doc-sync/               (Extended)
    │   └── SKILL.md
    └── quality-gate/           (Extended)
        └── SKILL.md
```

## Customization

Each template includes a customization zone that is preserved during updates:

```markdown
<!-- CUSTOM IMPLEMENTATION START -->
<!-- User customizations preserved here -->
<!-- CUSTOM IMPLEMENTATION END -->
```

Users can add custom rules, guidelines, or implementation details within this zone. The update mechanism will preserve these customizations when regenerating skill files.

## Adding New Skills

To add a new skill:

1. Create a new directory: `templates/skills/{skill-name}/`
2. Create the template: `SKILL.md.template`
3. Follow the frontmatter schema
4. Include all required sections
5. Add customization zone for user modifications
6. Update `skill-types.ts`:
   - Add to `MVP_SKILL_NAMES` for MVP skills
   - Add to `ADVANCED_SKILL_NAMES` for advanced skills (Phase 2, Set 1)
   - Add to `EXTENDED_SKILL_NAMES` for extended skills (Phase 2, Set 2)
   - Add corresponding config to `MVP_SKILL_CONFIGS`, `ADVANCED_SKILL_CONFIGS`, or `EXTENDED_SKILL_CONFIGS`

## Programmatic Access

```typescript
import {
  // MVP Skills
  MVP_SKILL_NAMES,
  MVP_SKILL_CONFIGS,
  isMVPSkill,
  getDefaultSkillConfig,
  getAllMVPSkillConfigs,

  // Advanced Skills
  ADVANCED_SKILL_NAMES,
  ADVANCED_SKILL_CONFIGS,
  isAdvancedSkill,
  getDefaultAdvancedSkillConfig,
  getAllAdvancedSkillConfigs,

  // Extended Skills
  EXTENDED_SKILL_NAMES,
  EXTENDED_SKILL_CONFIGS,
  isExtendedSkill,
  getDefaultExtendedSkillConfig,
  getAllExtendedSkillConfigs,

  // All Skills (MVP + Advanced + Extended = 12 total)
  ALL_SKILL_NAMES,
  getAllSkillConfigs,
} from '@atreides/opencode';
```
