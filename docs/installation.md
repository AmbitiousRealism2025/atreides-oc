# Installation Guide

This guide covers all installation options for Atreides OpenCode.

## Prerequisites

Before installing Atreides OpenCode, ensure you have:

### Required

- **Node.js** >= 20.0.0 or **Bun** >= 1.0.0
- **OpenCode** with plugin support enabled

### Recommended

- **Git** for version control integration
- A code editor (VS Code, Cursor, etc.)

## Check Prerequisites

```bash
# Check Node.js version
node --version
# Should output: v20.x.x or higher

# Or check Bun version
bun --version
# Should output: 1.x.x or higher

# Verify OpenCode is installed
opencode --version
```

## Installation Methods

### Method 1: npx (Recommended)

The easiest way to get started is using `npx`, which runs the latest version without global installation:

```bash
cd /path/to/your/project
npx atreides-opencode init
```

This method:
- Always uses the latest version
- No global installation required
- Perfect for trying Atreides

### Method 2: Global Installation

For frequent use across multiple projects:

```bash
# Using npm
npm install -g atreides-opencode

# Using bun
bun add -g atreides-opencode

# Using pnpm
pnpm add -g atreides-opencode
```

Then run:

```bash
cd /path/to/your/project
atreides-opencode init
# or use the short alias
atreides init
```

### Method 3: Project Dependency

Add as a development dependency:

```bash
# Using npm
npm install --save-dev atreides-opencode

# Using bun
bun add -d atreides-opencode

# Using pnpm
pnpm add -D atreides-opencode
```

Then run via npm scripts or npx:

```bash
npx atreides-opencode init
```

## Running the Init Wizard

After installation, run the interactive wizard:

```bash
npx atreides-opencode init
```

The wizard guides you through:

### Step 1: Project Detection

```
Detecting project type...

Detected: TypeScript project
  Found: tsconfig.json, package.json
  Language: TypeScript
  Package Manager: npm

Is this correct? [Y/n]
```

### Step 2: Installation Mode

Choose your installation mode:

| Mode | Files Created | Best For |
|------|---------------|----------|
| **Minimal** | AGENTS.md only | Existing projects with custom setup |
| **Standard** | AGENTS.md, opencode.json, .opencode/ | Most projects (recommended) |
| **Full** | All above + all skills | Maximum functionality |

### Step 3: Model Configuration

Configure AI models for each agent:

```
Agent: Stilgar (Oracle)
Purpose: Architecture decisions, complex debugging
Recommended: claude-sonnet-4
Model: [claude-sonnet-4 v]
```

### Step 4: Permissions

Select which operations Atreides can perform:

- File Operations (read, write, edit)
- Shell Commands (npm, node, git)
- Network Access
- Git Operations

### Step 5: Confirmation

Review your selections and confirm to generate files.

## Files Created

After initialization, you'll have:

```
your-project/
├── AGENTS.md                    # Orchestration rules
├── opencode.json                # OpenCode configuration
└── .opencode/
    ├── plugin/
    │   └── atreides.ts         # Plugin entry point
    └── agent/
        ├── stilgar.md
        ├── explore.md
        ├── librarian.md
        ├── build.md
        └── plan.md
```

## Verify Installation

Run the doctor command to verify everything is set up correctly:

```bash
npx atreides-opencode doctor
```

Expected output:

```
Atreides OpenCode Diagnostics

Overall Status: HEALTHY

Plugin System                              PASS
  Plugin entry point exists
  Plugin loads without errors
  OpenCode integration verified

Agents                                     PASS
  5 agents configured
  All agent files valid
  Model configurations correct

Configuration                              PASS
  AGENTS.md syntax valid
  opencode.json schema valid
  Permissions configured correctly

Security                                   PASS
  Blocked patterns configured
  File guards active
  Command validation enabled
```

## Installing in Existing Projects

If you have an existing OpenCode setup:

```bash
npx atreides-opencode init
```

The wizard will detect existing configuration and offer merge options:

```
Existing Atreides configuration detected

Found:
  - AGENTS.md (modified 2 days ago)
  - opencode.json (modified 2 days ago)

Merge mode: Update templates while preserving your customizations.

  - Template files will be updated to latest version
  - Your customizations in AGENTS.md will be preserved
  - Backup created at: .opencode/.backup-2026-01-19/

Proceed with merge? [Y/n]
```

## Updating

To update to the latest version:

```bash
npx atreides-opencode update
```

This preserves your customizations while updating templates. See the [CLI Reference](cli-reference.md) for update options.

## Uninstalling

To remove Atreides from a project:

```bash
# Remove generated files
rm -rf .opencode/ AGENTS.md

# Remove atreides config from opencode.json manually
# or remove the entire file if it only contains atreides config
```

## Troubleshooting Installation

### Node.js Version Too Low

```
Error: Node.js version must be >= 20.0.0
```

**Solution**: Update Node.js using nvm or download from nodejs.org.

### Permission Denied

```
Error: Cannot write to directory
Permission denied: /path/to/project
```

**Solution**: Check directory permissions or run in a directory you own.

### OpenCode Not Found

```
Warning: OpenCode not detected
Atreides will install but may not function until OpenCode is available.
```

**Solution**: Install OpenCode first, then re-run `atreides doctor`.

## Next Steps

- [Quick Start Guide](quick-start.md) - Get up and running fast
- [Configuration Guide](configuration.md) - Customize Atreides
- [CLI Reference](cli-reference.md) - All commands and options
