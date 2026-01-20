# Atreides OpenCode

AI orchestration plugin for OpenCode providing structured workflows, agent delegation, error recovery, and security hardening.

## Features

- **Structured Workflows**: 5-phase workflow (Intent → Assessment → Exploration → Implementation → Verification)
- **Agent Delegation**: 5 specialized agents (Stilgar, Explore, Librarian, Build, Plan)
- **Security Hardening**: Multi-layer command validation and obfuscation detection
- **Error Recovery**: 3-strike protocol with automatic escalation
- **Todo Enforcement**: Track and enforce task completion
- **Context Preservation**: Session compaction with state persistence

## Quick Start

```bash
# Install via npx (recommended)
npx atreides-opencode init

# Or install globally
npm install -g atreides-opencode
atreides-opencode init
```

The init wizard will guide you through:
1. Project type detection
2. Installation mode selection
3. Model configuration for agents
4. Permission setup

## Installation

### Prerequisites

- **Node.js** >= 20.0.0 or **Bun** >= 1.0.0
- **OpenCode** with plugin support

### Install from npm

```bash
# Using npm
npm install atreides-opencode

# Using bun
bun add atreides-opencode

# Using pnpm
pnpm add atreides-opencode
```

### Verify Installation

```bash
npx atreides-opencode doctor
```

## Configuration

### opencode.json

Atreides configuration lives under the `atreides` key:

```json
{
  "atreides": {
    "identity": {
      "personaName": "Muad'Dib",
      "responsePrefix": true,
      "delegationAnnouncements": true
    },
    "agents": {
      "stilgar": {
        "model": "claude-sonnet-4",
        "enabled": true
      },
      "explore": {
        "model": "claude-haiku-4-5",
        "enabled": true
      }
    },
    "skills": {
      "orchestrate": { "enabled": true },
      "validate": { "enabled": true }
    }
  }
}
```

### AGENTS.md

The `AGENTS.md` file in your project root defines orchestration rules that get injected into the AI's system prompt:

```markdown
# Orchestration

## Workflow
Follow 5-phase development: Intent → Assessment → Exploration → Implementation → Verification

## Agents
- **Explore**: Fast codebase exploration
- **Plan**: Architecture decisions
- **Build**: Compilation and testing
...
```

See the [Configuration Guide](docs/configuration.md) for detailed options.

## CLI Commands

### `atreides-opencode init`

Interactive onboarding wizard that sets up Atreides for your project.

```bash
npx atreides-opencode init

# Options
--mode <minimal|standard|full>  Installation mode (default: standard)
--skip-detection                Skip project type detection
--yes                           Accept all defaults
```

### `atreides-opencode doctor`

Diagnose installation issues and verify configuration.

```bash
npx atreides-opencode doctor

# Options
--verbose  Show detailed breakdown
--fix      Attempt automatic fixes
```

### `atreides-opencode update`

Update to the latest version while preserving customizations.

```bash
npx atreides-opencode update

# Options
--check    Check for updates without applying
--force    Force update even if current
```

See the [CLI Reference](docs/cli-reference.md) for all commands and options.

## Workflow Phases

Atreides guides the AI through a structured 5-phase workflow:

| Phase | Purpose |
|-------|---------|
| **Intent** | Understand what the user is asking for |
| **Assessment** | Analyze scope, complexity, and risks |
| **Exploration** | Gather context from the codebase |
| **Implementation** | Make changes systematically |
| **Verification** | Verify changes work correctly |

## Agent Delegation

Atreides includes 5 specialized agents:

| Agent | Model (Recommended) | Purpose |
|-------|---------------------|---------|
| **Stilgar** | claude-sonnet-4 | Architecture decisions, complex debugging |
| **Explore** | claude-haiku-4-5 | Fast codebase exploration |
| **Librarian** | claude-haiku-4-5 | Documentation and OSS research |
| **Build** | claude-haiku-4-5 | Compilation, testing, CI/CD |
| **Plan** | claude-sonnet-4 | Implementation planning |

## Security Features

Atreides includes multi-layer security:

- **Command Validation**: Blocked patterns for dangerous commands
- **Obfuscation Detection**: Detects URL-encoded, hex, and quote-stripped commands
- **File Guards**: Protected paths that require explicit approval
- **Log Sanitization**: Automatic credential scrubbing

## Troubleshooting

### Plugin Not Loading

```bash
# Run diagnostics
npx atreides-opencode doctor

# Verify plugin reference in opencode.json
# Restart OpenCode
```

### AGENTS.md Not Applied

```bash
# Validate syntax
npx atreides-opencode doctor

# Ensure file is in project root
# Restart OpenCode session
```

See the [Troubleshooting Guide](docs/troubleshooting.md) for more solutions.

## Documentation

- [Installation Guide](docs/installation.md)
- [Quick Start Guide](docs/quick-start.md)
- [Configuration Guide](docs/configuration.md)
- [CLI Reference](docs/cli-reference.md)
- [Troubleshooting](docs/troubleshooting.md)
- [FAQ](docs/faq.md)
- [Examples](docs/examples.md)

## Contributing

See [DEVELOPMENT.md](DEVELOPMENT.md) for development setup and guidelines.

## License

MIT
