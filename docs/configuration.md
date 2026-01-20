# Configuration Guide

Complete reference for configuring Atreides OpenCode.

## Configuration Files

Atreides uses several configuration files:

| File | Purpose |
|------|---------|
| `opencode.json` | Main configuration (models, permissions, identity) |
| `AGENTS.md` | Orchestration rules (injected into AI system prompt) |
| `.opencode/agent/*.md` | Individual agent definitions |
| `.opencode/skill/*.md` | Skill definitions (Full mode) |

## opencode.json

### Full Schema

```json
{
  "atreides": {
    "enabled": true,
    "version": "1.0.0",

    "identity": {
      "personaName": "Muad'Dib",
      "responsePrefix": true,
      "delegationAnnouncements": true
    },

    "workflow": {
      "enabled": true,
      "phases": ["intent", "assessment", "exploration", "implementation", "verification"],
      "enforcePhaseOrder": true,
      "autoAdvance": true
    },

    "agents": {
      "stilgar": {
        "enabled": true,
        "model": "claude-sonnet-4",
        "maxTokens": 8192
      },
      "explore": {
        "enabled": true,
        "model": "claude-haiku-4-5",
        "maxTokens": 4096
      },
      "librarian": {
        "enabled": true,
        "model": "claude-haiku-4-5",
        "maxTokens": 4096
      },
      "build": {
        "enabled": true,
        "model": "claude-haiku-4-5",
        "maxTokens": 4096
      },
      "plan": {
        "enabled": true,
        "model": "claude-sonnet-4",
        "maxTokens": 8192
      }
    },

    "skills": {
      "orchestrate": { "enabled": true },
      "validate": { "enabled": true },
      "explore": { "enabled": true },
      "build": { "enabled": true }
    },

    "errorRecovery": {
      "enabled": true,
      "maxStrikes": 3,
      "autoRevert": true,
      "escalationThreshold": 3
    },

    "todoEnforcement": {
      "enabled": true,
      "minStepsForList": 3,
      "requireCompletion": true
    },

    "security": {
      "obfuscationDetection": true,
      "blockedPatterns": true,
      "fileGuards": true,
      "logSanitization": true,
      "customBlockedPatterns": [],
      "customGuardedPaths": []
    },

    "compaction": {
      "enabled": true,
      "preserveState": true,
      "maxContextSize": 100000
    }
  }
}
```

### Identity Configuration

Control how the AI identifies itself:

```json
{
  "atreides": {
    "identity": {
      "personaName": "Muad'Dib",
      "responsePrefix": true,
      "delegationAnnouncements": true
    }
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `personaName` | string | "Muad'Dib" | Name the AI uses to identify itself |
| `responsePrefix` | boolean | true | Prefix responses with persona name |
| `delegationAnnouncements` | boolean | true | Announce when delegating to agents |

### Agent Configuration

Configure each agent individually:

```json
{
  "atreides": {
    "agents": {
      "stilgar": {
        "enabled": true,
        "model": "claude-sonnet-4",
        "maxTokens": 8192
      }
    }
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | true | Enable/disable the agent |
| `model` | string | varies | AI model to use |
| `maxTokens` | number | varies | Maximum response tokens |

#### Available Agents

| Agent | Default Model | Purpose |
|-------|---------------|---------|
| `stilgar` | claude-sonnet-4 | Architecture decisions, complex debugging |
| `explore` | claude-haiku-4-5 | Fast codebase exploration |
| `librarian` | claude-haiku-4-5 | Documentation and research |
| `build` | claude-haiku-4-5 | Compilation, testing, CI/CD |
| `plan` | claude-sonnet-4 | Implementation planning |

### Error Recovery Configuration

```json
{
  "atreides": {
    "errorRecovery": {
      "enabled": true,
      "maxStrikes": 3,
      "autoRevert": true,
      "escalationThreshold": 3
    }
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | true | Enable error recovery |
| `maxStrikes` | number | 3 | Strikes before escalation |
| `autoRevert` | boolean | true | Auto-revert failed changes |
| `escalationThreshold` | number | 3 | When to ask for human help |

### Security Configuration

```json
{
  "atreides": {
    "security": {
      "obfuscationDetection": true,
      "blockedPatterns": true,
      "fileGuards": true,
      "logSanitization": true,
      "customBlockedPatterns": [
        "rm -rf /",
        "mkfs.*"
      ],
      "customGuardedPaths": [
        ".env",
        "**/*.key",
        "**/secrets/*"
      ]
    }
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `obfuscationDetection` | boolean | true | Detect obfuscated commands |
| `blockedPatterns` | boolean | true | Block dangerous commands |
| `fileGuards` | boolean | true | Protect sensitive files |
| `logSanitization` | boolean | true | Scrub credentials from logs |
| `customBlockedPatterns` | string[] | [] | Additional blocked commands |
| `customGuardedPaths` | string[] | [] | Additional protected paths |

## AGENTS.md

The `AGENTS.md` file defines orchestration rules that are injected into the AI's system prompt.

### Structure

```markdown
# Orchestration

## Workflow

[Define workflow phases and rules]

## Agents

[Define agents and delegation guidelines]

## Rules

[Define behavioral rules]

## Custom Rules

[Your project-specific rules]
```

### Example AGENTS.md

```markdown
# Orchestration

## Workflow

Follow structured problem-solving phases:

### Phase 1: Intent
- Understand what the user is asking
- Clarify ambiguous requirements
- Identify task type (feature, bugfix, refactor)

### Phase 2: Assessment
- Analyze scope and complexity
- Identify risks and blockers
- Determine required context

### Phase 3: Exploration
- Read relevant files
- Search for related code
- Understand existing patterns
- Delegate to Explore agent for comprehensive analysis

### Phase 4: Implementation
- Create task list for complex work
- Make changes systematically
- Follow existing code style
- Avoid over-engineering

### Phase 5: Verification
- Verify changes work
- Run tests
- Check for side effects
- Complete all todos

## Agents

| Agent | Use For |
|-------|---------|
| **Stilgar** | Architecture decisions, complex debugging |
| **Explore** | Codebase exploration, finding files |
| **Librarian** | Documentation, OSS research |
| **Build** | Compilation, testing, CI/CD |
| **Plan** | Implementation planning |

## Rules

### Task Management
- Use TodoWrite for 3+ step tasks
- One todo in_progress at a time
- Complete todos immediately

### Code Quality
- Read before modifying
- Prefer editing over creating
- Keep changes focused

### Security
- Never execute obfuscated commands
- Validate file paths
- Don't commit secrets

## Custom Rules

### Project-Specific
[Add your project-specific rules here]
```

### Custom Rules Examples

```markdown
## Custom Rules

### Technology Stack
- Use React with TypeScript for frontend components
- Use Prisma ORM for all database operations
- Follow the REST API patterns in /api directory

### Code Style
- Use functional components with hooks
- Prefer composition over inheritance
- Maximum 200 lines per file

### Testing Requirements
- Unit tests required for all utilities
- Integration tests for API endpoints
- E2E tests for critical user flows

### Documentation
- Update README when adding features
- JSDoc for public functions
- Inline comments for complex logic

### Git Workflow
- Create feature branches from main
- Use conventional commit messages
- Squash commits before merging
```

## Agent Definition Files

Each agent has a definition file in `.opencode/agent/`:

### File Structure

```markdown
---
name: stilgar
displayName: Stilgar
model: claude-sonnet-4
description: Architecture decisions and complex debugging
---

# Stilgar (Oracle Agent)

## Role
Senior architect for design decisions and complex problem-solving.

## Capabilities
- System architecture design
- Complex debugging
- Performance optimization
- Security analysis

## Guidelines
1. Consider long-term implications
2. Provide multiple options when appropriate
3. Explain trade-offs clearly

## When to Use
- Architecture decisions
- Complex debugging sessions
- Performance investigations
- Security reviews
```

### Customizing Agent Definitions

Edit the agent file to customize behavior:

```markdown
---
name: explore
displayName: Explore
model: claude-haiku-4-5
description: Fast codebase exploration
---

# Explore Agent

## Project-Specific Context

When exploring this project:
1. Check /src/components for React patterns
2. Check /api for endpoint conventions
3. Check /lib for shared utilities

## Search Priorities
1. TypeScript files in /src
2. Test files in /__tests__
3. Configuration in root directory

## Ignore Patterns
- node_modules/
- dist/
- .git/
```

## Permission Configuration

### Language-Specific Defaults

Atreides auto-configures permissions based on project type:

**TypeScript/Node.js**
```json
{
  "bash": {
    "allow": ["npm *", "npx *", "node *", "tsc *"],
    "deny": ["rm -rf /", "sudo *"]
  }
}
```

**Python**
```json
{
  "bash": {
    "allow": ["pip *", "python *", "pytest *"],
    "deny": ["rm -rf /", "sudo *"]
  }
}
```

**Go**
```json
{
  "bash": {
    "allow": ["go *"],
    "deny": ["rm -rf /", "sudo *"]
  }
}
```

### Custom Permissions

```json
{
  "atreides": {
    "permissions": {
      "bash": {
        "allow": [
          "npm *",
          "docker-compose *",
          "make *"
        ],
        "ask": [
          "git push *",
          "npm publish *"
        ],
        "deny": [
          "rm -rf *",
          "sudo *",
          "chmod 777 *"
        ]
      },
      "file": {
        "allow": ["**/*.ts", "**/*.md"],
        "ask": ["*.json"],
        "deny": [".env*", "**/*.key"]
      }
    }
  }
}
```

## Environment Variables

Atreides respects these environment variables:

| Variable | Description |
|----------|-------------|
| `ATREIDES_CONFIG_PATH` | Custom config file path |
| `ATREIDES_DISABLE_SECURITY` | Disable security features (not recommended) |
| `ATREIDES_DEBUG` | Enable debug logging |
| `ATREIDES_NO_COLOR` | Disable colored output |

## Configuration Precedence

Configuration is merged in this order (later overrides earlier):

1. Default configuration (built into Atreides)
2. `opencode.json` in project root
3. `.opencode/config.json` (if exists)
4. Environment variables
5. CLI flags

## Validating Configuration

Check your configuration with:

```bash
npx atreides-opencode doctor --verbose
```

This validates:
- JSON syntax
- Schema compliance
- File existence
- Permission patterns
- Agent model availability
