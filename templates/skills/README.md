# Skill Templates

This directory contains templates for the MVP skills used by Atreides OpenCode.

## Overview

Skills are reusable capabilities that agents can invoke. Each skill has a specific context type that determines how it executes:

- **main**: Executes in the main conversation context with full session state
- **fork**: Executes in a forked context for parallel/isolated operations

## MVP Skills

| Skill | Context Type | Purpose |
|-------|--------------|---------|
| `base` | main | Foundation template and documentation |
| `orchestrate` | main | Workflow orchestration and agent delegation |
| `explore` | fork | Codebase exploration and context gathering |
| `validate` | fork | Code validation and quality checks |

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
    └── validate/
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
6. Update `MVP_SKILL_NAMES` in `skill-types.ts` if it's an MVP skill
