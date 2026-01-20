# Agent Template Format

This document describes the format and structure of agent template files for Atreides OpenCode.

## Overview

Agent templates are markdown files with YAML frontmatter that define AI agent personas, their responsibilities, and configurations. OpenCode loads these files to configure specialized agents for different tasks.

## Template Location

Templates are stored in `templates/agents/` with the naming convention:
```
{agent-name}.md.template
```

Generated agent files are placed in:
```
.opencode/agent/{agent-name}.md
```

## Frontmatter Schema

Each agent file **must** have a YAML frontmatter section at the top:

```yaml
---
name: {agent-name}          # Required: Lowercase identifier (kebab-case)
displayName: {Display Name}  # Required: Human-readable name
model: {model-id}           # Required: AI model to use
enabled: true               # Required: Whether agent is active
---
```

### Frontmatter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Lowercase identifier, used for routing and file naming |
| `displayName` | string | Yes | Human-readable name shown in UI |
| `model` | string | Yes | Model ID (e.g., `claude-sonnet-4`, `claude-haiku-4-5`) |
| `enabled` | boolean | Yes | Whether the agent should be loaded |

## Template Variables

Templates support the following placeholders that are replaced during generation:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{name}}` | Agent name | `stilgar` |
| `{{displayName}}` | Display name | `Stilgar` |
| `{{model}}` | Model configuration | `claude-sonnet-4` |
| `{{enabled}}` | Enabled state | `true` |

## Required Sections

Each agent template should include these sections:

### 1. Title and Description
```markdown
# {Agent Display Name}

{One-line description of the agent's purpose}
```

### 2. Purpose Section
```markdown
## Purpose

{Detailed explanation of what this agent does and when it should be used}
```

### 3. Responsibilities Section
```markdown
## Responsibilities

- {Responsibility 1}
- {Responsibility 2}
- {Responsibility 3}
```

### 4. Tool Permissions Section
```markdown
## Tool Permissions

{Description of what tools this agent can access}

- `read`: allow
- `edit`: allow
- `bash`: deny
```

### 5. Guidelines Section
```markdown
## Guidelines

- {Guideline 1}
- {Guideline 2}
- {Guideline 3}
```

### 6. Customization Zone
```markdown
<!-- CUSTOM RULES START -->
<!-- User customizations preserved here -->
<!-- CUSTOM RULES END -->
```

**Important:** The customization zone markers (`<!-- CUSTOM RULES START -->` and `<!-- CUSTOM RULES END -->`) are required. Content between these markers is preserved during updates.

## MVP Agents

The following 5 MVP agents are included:

| Agent | Purpose | Default Model |
|-------|---------|---------------|
| `stilgar` | High-level orchestration and strategic decisions | `claude-sonnet-4` |
| `explore` | Context gathering and codebase exploration | `claude-haiku-4-5` |
| `librarian` | Documentation and knowledge management | `claude-sonnet-4` |
| `build` | Code implementation and modification | `claude-sonnet-4` |
| `plan` | Project planning and task breakdown | `claude-sonnet-4` |

## Example Template

```markdown
---
name: example
displayName: Example
model: {{model}}
enabled: true
---

# Example Agent

Brief description of the agent's purpose.

## Purpose

Detailed explanation of what this agent does, when it should be used,
and what types of tasks it handles.

## Responsibilities

- Primary responsibility
- Secondary responsibility
- Additional responsibility

## Tool Permissions

- `read`: allow
- `grep_search`: allow
- `edit`: deny
- `bash`: deny

## Guidelines

- Follow consistent patterns
- Provide clear output
- Delegate when appropriate

<!-- CUSTOM RULES START -->
<!-- User customizations preserved here -->
<!-- CUSTOM RULES END -->
```

## Customization Guidelines

Users can customize agent files in several ways:

1. **Add content to customization zone**: Content between `<!-- CUSTOM RULES START -->` and `<!-- CUSTOM RULES END -->` is preserved during updates.

2. **Override model configuration**: Edit the `model` field in frontmatter.

3. **Add new sections**: New sections added by users are detected and preserved.

4. **Disable agents**: Set `enabled: false` in frontmatter.

### What Gets Preserved During Updates

- Content in customization zones
- User-added sections
- Modified frontmatter values

### What Gets Updated

- Template sections outside customization zones
- New sections added in template updates
- Bug fixes in guidelines and responsibilities

## Validation

Generated agent files are validated for:

1. **Valid frontmatter**: Must contain required fields
2. **Name field**: Must be present and non-empty
3. **Model field**: Must be present and non-empty
4. **Markdown structure**: Must be valid markdown

## Integration

Agent files are:

1. Generated during `atreides init` based on wizard configuration
2. Loaded by OpenCode at startup
3. Tracked in `.atreides-manifest.json` for update management
4. Used to configure agent behavior and tool permissions

## Related Files

- `src/generators/agent-generator.ts` - Generation logic
- `src/generators/types.ts` - Type definitions
- `src/lib/manifest.ts` - Customization tracking
- `.atreides-manifest.json` - Generated manifest file
