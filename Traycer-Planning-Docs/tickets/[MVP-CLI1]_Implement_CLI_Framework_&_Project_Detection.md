# [MVP-CLI1] Implement CLI Framework & Project Detection

## Objective

Set up CLI framework with command routing and implement project type detection logic.

## Context

The CLI is the primary user interface for Atreides setup and maintenance. Project detection enables language-specific configurations.

**References**:
- Core Flows: spec:bf063507-9358-4515-afbb-3080f2099467/f32d7c5a-99f4-4e9f-99f3-c04d552db8c7 (Flow 1, Flow 2 Step 1)
- Technical Plan: spec:bf063507-9358-4515-afbb-3080f2099467/5cdb5788-a716-4cb2-a301-6ccd6f64a488 (Section 3.1.10, 3.2)
- Deep Dive: file:archive/ATREIDES_DEEP_DIVE_FINDINGS.md (Section 6)

## Scope

**In Scope**:
- CLI framework setup (Commander.js or similar)
- Command routing (init, doctor, update)
- OpenCode installation detection
- Project type detection (Node.js, TypeScript, Python, Go, Rust, Generic)
- Language-specific configuration defaults
- Error handling and user-friendly messages

**Out of Scope**:
- Wizard implementation (separate ticket)
- Doctor diagnostics (separate ticket)
- Update logic (separate ticket)
- File generation (separate ticket)

## Implementation Guidance

### CLI Framework

**bin/atreides.js**:
```typescript
#!/usr/bin/env node
import { Command } from 'commander'

const program = new Command()
program
  .name('atreides-opencode')
  .description('AI orchestration for OpenCode')
  .version('0.1.0')

program
  .command('init')
  .description('Initialize Atreides in current project')
  .action(initCommand)

program
  .command('doctor')
  .description('Verify installation and diagnose issues')
  .action(doctorCommand)

program
  .command('update')
  .description('Update to latest version')
  .action(updateCommand)

program.parse()
```

### OpenCode Detection

**src/lib/opencode-detector.ts**:
- Check for OpenCode installation (command exists)
- Check for `~/.config/opencode/` directory
- Verify OpenCode version compatibility
- Return detection result with guidance if missing

**Behavior**:
- If not found: Show installation instructions, link to docs
- If found: Proceed with initialization
- If version incompatible: Warn user, suggest upgrade

### Project Type Detection

**src/lib/project-detection.ts**:

**Detection Logic**:
```typescript
interface ProjectDetection {
  type: 'node' | 'typescript' | 'python' | 'go' | 'rust' | 'generic'
  confidence: 'high' | 'medium' | 'low'
  evidence: string[]  // Files found
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun'
}

function detectProjectType(directory: string): ProjectDetection {
  // Scan for indicator files
  // Return detection result
}
```

**Detection Rules**:
- `tsconfig.json` → TypeScript (high confidence)
- `package.json` only → Node.js (medium confidence)
- `pyproject.toml` or `setup.py` → Python (high confidence)
- `go.mod` → Go (high confidence)
- `Cargo.toml` → Rust (high confidence)
- Multiple found → Ask user to choose primary
- None found → Default to Generic

**Language-Specific Defaults**:
- TypeScript: `bash: { "npm *": "allow", "npx *": "allow", "node *": "allow" }`
- Python: `bash: { "pip *": "allow", "python *": "allow", "pytest *": "allow" }`
- Go: `bash: { "go *": "allow" }`
- Rust: `bash: { "cargo *": "allow" }`
- Generic: Minimal permissions, user configures manually

## Acceptance Criteria

- [ ] CLI framework operational (`atreides --help` works)
- [ ] Three commands registered (init, doctor, update)
- [ ] OpenCode detection works correctly
- [ ] OpenCode not found: Shows clear installation guidance
- [ ] Project type detection scans for all supported languages
- [ ] Detection handles multiple project types (asks user to choose)
- [ ] Detection handles no project files (defaults to Generic)
- [ ] Language-specific defaults defined for all supported types
- [ ] Unit tests: Detection logic for each project type
- [ ] Unit tests: OpenCode detection (found/not found)
- [ ] Integration test: CLI commands route correctly

## Dependencies

**Depends On**:
- [MVP-F1] Initialize Package Structure & Build Pipeline

**Blocks**:
- [MVP-CLI2] Implement Init Wizard
- [MVP-CLI3] Implement Doctor Command

## Estimated Effort

**8 hours** (4h CLI framework + 4h detection logic)

## Testing

**Unit Tests**:
- Detect TypeScript project (tsconfig.json present)
- Detect Node.js project (package.json only)
- Detect Python project (pyproject.toml)
- Detect Go project (go.mod)
- Detect Rust project (Cargo.toml)
- Handle multiple project types
- Handle no project files (Generic)
- OpenCode detection (found/not found)

**Integration Tests**:
- Run `atreides --help` - shows commands
- Run `atreides --version` - shows version
- Run `atreides init` - routes to init command