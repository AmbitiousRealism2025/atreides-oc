# CLI Reference

Complete reference for all Atreides OpenCode CLI commands.

## Overview

Atreides OpenCode provides a CLI for setup, diagnostics, and maintenance:

```bash
atreides-opencode <command> [options]
# or use the short alias
atreides <command> [options]
```

## Commands

### init

Initialize Atreides OpenCode in a project.

```bash
atreides-opencode init [options]
```

#### Options

| Option | Description |
|--------|-------------|
| `--mode <mode>` | Installation mode: `minimal`, `standard`, `full` |
| `--skip-detection` | Skip automatic project type detection |
| `--yes`, `-y` | Accept all defaults without prompts |
| `--project-type <type>` | Specify project type manually |
| `--no-agents` | Skip agent file generation |

#### Installation Modes

**Minimal**
```bash
atreides-opencode init --mode minimal
```
Creates only `AGENTS.md`. Best for existing projects with custom setup.

**Standard (Default)**
```bash
atreides-opencode init --mode standard
```
Creates `AGENTS.md`, `opencode.json`, and `.opencode/agent/` directory.

**Full**
```bash
atreides-opencode init --mode full
```
Creates everything including skill definitions.

#### Examples

```bash
# Interactive wizard
atreides-opencode init

# Accept all defaults
atreides-opencode init -y

# Minimal setup
atreides-opencode init --mode minimal

# Skip detection, specify Python project
atreides-opencode init --skip-detection --project-type python

# Full setup with all defaults
atreides-opencode init --mode full -y
```

#### Wizard Flow

1. **Project Detection**: Scans for config files to detect project type
2. **Mode Selection**: Choose minimal, standard, or full installation
3. **Model Configuration**: Configure AI models for each agent
4. **Permission Setup**: Select allowed operations
5. **Confirmation**: Review and confirm before generating files

#### Re-initialization

Running `init` in a directory with existing Atreides files triggers merge mode:

```
Existing Atreides configuration detected
Merge mode: Update templates while preserving customizations
Proceed with merge? [Y/n]
```

---

### doctor

Diagnose installation and verify configuration.

```bash
atreides-opencode doctor [options]
```

#### Options

| Option | Description |
|--------|-------------|
| `--verbose`, `-v` | Show detailed breakdown for all checks |
| `--fix` | Attempt automatic fixes for issues |
| `--json` | Output results as JSON |
| `--check <category>` | Check specific category only |

#### Categories

- `plugin` - Plugin system checks
- `agents` - Agent configuration checks
- `skills` - Skill configuration checks
- `config` - Configuration file checks
- `security` - Security feature checks

#### Output Format

**Summary Mode (default)**
```
Atreides OpenCode Diagnostics

Overall Status: HEALTHY

Plugin System                              PASS
Agents                                     PASS
Skills                                     WARNING
Configuration                              PASS
Security                                   PASS
```

**Verbose Mode**
```
Plugin System                              PASS
  ✓ Plugin entry point exists
  ✓ Plugin loads without errors
  ✓ OpenCode integration verified

Agents                                     PASS
  ✓ 5 agents configured
  ✓ All agent files valid
  ✓ Model configurations correct
```

#### Status Meanings

| Status | Meaning |
|--------|---------|
| PASS | All checks passed |
| WARNING | Non-critical issues found |
| ERROR | Critical issues that need fixing |

#### Examples

```bash
# Basic health check
atreides-opencode doctor

# Detailed breakdown
atreides-opencode doctor --verbose

# Check only security
atreides-opencode doctor --check security

# Auto-fix issues
atreides-opencode doctor --fix

# JSON output for scripting
atreides-opencode doctor --json
```

#### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All checks passed (or warnings only) |
| 1 | Errors found |
| 2 | Invalid command or options |

---

### update

Update Atreides OpenCode to the latest version.

```bash
atreides-opencode update [options]
```

#### Options

| Option | Description |
|--------|-------------|
| `--check` | Check for updates without applying |
| `--force` | Force update even if current version |
| `--backup` | Create backup before updating (default: true) |
| `--no-backup` | Skip backup creation |
| `--version <version>` | Update to specific version |

#### Update Process

1. **Version Check**: Compare current and latest versions
2. **Backup**: Create backup of current configuration
3. **Package Update**: Update npm package
4. **Template Sync**: Update template files
5. **Customization Preservation**: Merge updates with customizations
6. **Verification**: Run doctor to verify update

#### Preserved Customizations

The update process preserves:
- Custom rules in `AGENTS.md`
- Modified permissions in `opencode.json`
- Custom agent model selections
- Persona name customizations
- Any user-added configuration

#### Examples

```bash
# Check for updates
atreides-opencode update --check

# Update to latest
atreides-opencode update

# Update without backup
atreides-opencode update --no-backup

# Update to specific version
atreides-opencode update --version 1.2.0

# Force re-apply current version
atreides-opencode update --force
```

#### Output

```
Checking for updates...

Current version: 1.2.0
Latest version: 1.3.0

Changelog highlights:
  • New agent: Performance Optimizer
  • Enhanced security patterns
  • Bug fixes

Update available! Proceed? [Y/n]

Updating atreides-opencode...
✓ Package updated: 1.2.0 → 1.3.0
✓ Backup created: .opencode/.backup-2026-01-19/
✓ Templates synced
✓ Customizations preserved

Update complete!
Run 'atreides doctor' to verify.
```

---

### version

Display version information.

```bash
atreides-opencode version
# or
atreides-opencode --version
atreides-opencode -v
```

#### Output

```
atreides-opencode v1.2.0
Node.js v20.10.0
Platform: darwin arm64
```

---

### help

Display help information.

```bash
atreides-opencode help [command]
# or
atreides-opencode --help
atreides-opencode -h
```

#### Examples

```bash
# General help
atreides-opencode help

# Command-specific help
atreides-opencode help init
atreides-opencode help doctor
```

---

## Global Options

These options work with any command:

| Option | Description |
|--------|-------------|
| `--help`, `-h` | Show help for command |
| `--version`, `-v` | Show version number |
| `--no-color` | Disable colored output |
| `--debug` | Enable debug logging |
| `--config <path>` | Use custom config file |

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ATREIDES_CONFIG_PATH` | Custom config file path | `./opencode.json` |
| `ATREIDES_DEBUG` | Enable debug logging | `false` |
| `ATREIDES_NO_COLOR` | Disable colored output | `false` |
| `NO_COLOR` | Standard no-color env var | `false` |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error occurred |
| 2 | Invalid command or arguments |
| 130 | Interrupted (Ctrl+C) |

---

## Shell Completion

### Bash

```bash
# Add to ~/.bashrc
eval "$(atreides-opencode completion bash)"
```

### Zsh

```bash
# Add to ~/.zshrc
eval "$(atreides-opencode completion zsh)"
```

### Fish

```fish
# Add to ~/.config/fish/config.fish
atreides-opencode completion fish | source
```

---

## Scripting Examples

### CI/CD Health Check

```bash
#!/bin/bash
if ! npx atreides-opencode doctor --json | jq -e '.status == "healthy"' > /dev/null; then
    echo "Atreides health check failed"
    exit 1
fi
```

### Auto-Update Script

```bash
#!/bin/bash
# Check for updates and apply if available
if npx atreides-opencode update --check | grep -q "Update available"; then
    npx atreides-opencode update -y
fi
```

### Initialization Script

```bash
#!/bin/bash
# Initialize new projects with standard config
cd "$1"
npx atreides-opencode init --mode standard -y
npx atreides-opencode doctor
```
