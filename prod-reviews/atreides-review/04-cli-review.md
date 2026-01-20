# CLI Layer Code Review

**Project**: atreides-opencode
**Review Date**: 2026-01-19
**Reviewer**: Backend Architect
**Scope**: CLI Layer (`src/cli/`)

---

## Executive Summary

**Overall Rating: B+**

The CLI layer demonstrates solid engineering fundamentals with well-structured commands, good TypeScript usage, and thoughtful user experience design. The codebase follows modern CLI patterns with proper separation of concerns and comprehensive help documentation. However, there are several areas requiring attention: security vulnerabilities in input handling, inconsistent error handling patterns, code duplication across commands, and missing input validation in critical paths.

### Scoring Breakdown

| Category | Score | Notes |
|----------|-------|-------|
| Code Quality | B | Good structure, some duplication |
| User Experience | A- | Excellent help text, clear prompts |
| Type Safety | B+ | Good coverage, some `any` type inference |
| Error Handling | B- | Inconsistent patterns, missing edge cases |
| Input Validation | C+ | Missing path validation, injection risks |
| Architecture | B+ | Clean separation, good modularity |
| Performance | B | Synchronous operations in some paths |
| Security | C | Path traversal risks, command injection potential |
| Best Practices | B+ | Modern patterns, needs more testing |

---

## Per-Command Findings Summary

### index.ts (Main Entry)
- **Status**: Good
- **Key Issues**: Hardcoded version, manual argument parsing without library
- **Strengths**: Clean switch structure, proper async handling

### init.ts
- **Status**: Good
- **Key Issues**: No directory path validation, limited error context
- **Strengths**: Clean wizard integration, proper merge mode handling

### doctor.ts
- **Status**: Very Good
- **Key Issues**: `execSync` without sanitization, duplicated utility functions
- **Strengths**: Comprehensive diagnostics, clear status reporting

### update.ts
- **Status**: Good
- **Key Issues**: Template path resolution could fail silently, magic string paths
- **Strengths**: Good backup integration, proper conflict resolution

### migrate.ts
- **Status**: Very Good
- **Key Issues**: Transformation registry is extensible but lacks validation
- **Strengths**: Excellent dry-run support, comprehensive breaking change registry

### maturity.ts
- **Status**: Very Good
- **Key Issues**: File scanning could be slow on large repos, unused variable warning
- **Strengths**: Comprehensive assessment criteria, good recommendations engine

### checkpoint.ts
- **Status**: Good
- **Key Issues**: No checkpoint ID format validation
- **Strengths**: Clean CRUD operations, good JSON output support

### restore.ts
- **Status**: Good
- **Key Issues**: Force restore without validation could overwrite critical files
- **Strengths**: Proper confirmation flow, backup integration

### uninstall.ts
- **Status**: Good
- **Key Issues**: Hardcoded file list, no verification of actual Atreides files
- **Strengths**: Comprehensive cleanup, proper backup before delete

### conflict-resolution.ts
- **Status**: Good
- **Key Issues**: Editor spawn without path escaping
- **Strengths**: Git-style conflict markers, good UX

### project-detection.ts
- **Status**: Very Good
- **Key Issues**: Could be extended for more project types
- **Strengths**: Clean detection logic, proper confidence levels

### wizard/ (all files)
- **Status**: Very Good
- **Key Issues**: Some step functions lack input validation
- **Strengths**: Excellent progressive disclosure, clean step separation

---

## Findings by Severity

### Critical Issues

#### 1. Command Injection Risk in doctor.ts
**Location**: `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/cli/doctor.ts:950-961`

```typescript
function getCommandVersion(command: string, args: string[]): string | null {
  try {
    const result = execSync(`${command} ${args.join(" ")}`, {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim().split("\n")[0] ?? null;
  } catch {
    return null;
  }
}
```

**Issue**: Direct string interpolation in shell command execution. While currently called with hardcoded commands (`opencode`, `bun`, `node`), this pattern is dangerous if the function signature suggests it could accept user input.

**Recommendation**: Use `execFileSync` instead which does not invoke shell:
```typescript
import { execFileSync } from "node:child_process";

function getCommandVersion(command: string, args: string[]): string | null {
  try {
    const result = execFileSync(command, args, {
      encoding: "utf-8",
      timeout: 5000,
    });
    return result.trim().split("\n")[0] ?? null;
  } catch {
    return null;
  }
}
```

#### 2. Path Traversal Vulnerability in Multiple Files
**Location**: Multiple files use user-provided directory paths without validation

**Example from checkpoint.ts**:
```typescript
export async function runCheckpointCommand(
  options: CheckpointCommandOptions = {}
): Promise<CheckpointCommandResult> {
  const directory = options.directory ?? process.cwd();
  // No validation that directory is within expected bounds
```

**Recommendation**: Add path validation utility:
```typescript
import { resolve, relative, isAbsolute } from "node:path";

function validateProjectPath(path: string, basePath: string = process.cwd()): string {
  const resolved = resolve(basePath, path);
  const rel = relative(basePath, resolved);

  // Prevent path traversal outside project
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Invalid path: ${path} is outside project directory`);
  }

  return resolved;
}
```

---

### High Severity Issues

#### 3. Editor Spawn Without Path Escaping
**Location**: `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/cli/conflict-resolution.ts:89-106`

```typescript
async function openEditor(filePath: string): Promise<boolean> {
  const editorCmd = process.env.EDITOR || process.env.VISUAL || "vi";

  return new Promise((resolve) => {
    const child = spawn(editorCmd, [filePath], {
      stdio: "inherit",
    });
    // ...
  });
}
```

**Issue**: If `filePath` contains special characters or spaces, this could fail or behave unexpectedly. The `EDITOR` environment variable could contain malicious commands.

**Recommendation**: Validate editor command and properly handle paths:
```typescript
async function openEditor(filePath: string): Promise<boolean> {
  const editorCmd = process.env.EDITOR || process.env.VISUAL || "vi";

  // Validate editor is a simple command name (no shell metacharacters)
  if (!/^[a-zA-Z0-9_\-./]+$/.test(editorCmd)) {
    console.log(`Invalid editor command: ${editorCmd}`);
    return false;
  }

  // Ensure file path is absolute and exists
  const absolutePath = resolve(filePath);

  return new Promise((resolve) => {
    const child = spawn(editorCmd, [absolutePath], {
      stdio: "inherit",
      shell: false, // Explicitly disable shell
    });
    // ...
  });
}
```

#### 4. Missing Checkpoint ID Validation
**Location**: `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/cli/checkpoint.ts:159-325`

```typescript
case "show": {
  if (!options.checkpointId) {
    const error = "Checkpoint ID is required for 'show' action";
    // ...
  }

  // No format validation on checkpointId
  const checkpoint = await getCheckpoint(options.checkpointId);
```

**Issue**: Checkpoint IDs are passed directly to the manager without format validation. Malformed IDs could cause issues downstream.

**Recommendation**: Add ID format validation:
```typescript
const CHECKPOINT_ID_PATTERN = /^chk_\d{8}_\d{6}_[a-f0-9]{4}$/;

function isValidCheckpointId(id: string): boolean {
  return CHECKPOINT_ID_PATTERN.test(id);
}

// Usage
if (!options.checkpointId || !isValidCheckpointId(options.checkpointId)) {
  const error = "Invalid checkpoint ID format. Expected: chk_YYYYMMDD_HHMMSS_xxxx";
  // ...
}
```

#### 5. Hardcoded Version Number
**Location**: `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/cli/index.ts:12`

```typescript
const VERSION = "0.1.0";
const NAME = "atreides-opencode";
```

**Issue**: Version is hardcoded instead of being read from package.json, leading to version drift.

**Recommendation**: Import version from package.json or constants:
```typescript
import { PACKAGE_VERSION, PACKAGE_NAME } from "../lib/constants.js";
// Already available based on doctor.ts imports
```

---

### Medium Severity Issues

#### 6. Duplicated Utility Functions
**Location**: Multiple files contain identical implementations

**Examples**:
- `fileExists()` - in init.ts (lines 133-140), doctor.ts (lines 932-939), maturity.ts (lines 1403-1410), migrate.ts (lines 344-351), uninstall.ts (lines 123-130)
- `directoryExists()` - in init.ts (lines 142-149), doctor.ts (lines 941-948), maturity.ts (lines 1412-1419), uninstall.ts (lines 132-139)
- `isExitPromptError()` - in init.ts (lines 163-170), update.ts (lines 428-435), migrate.ts (lines 939-946), uninstall.ts (lines 383-390)

**Recommendation**: Extract to shared utilities:
```typescript
// src/cli/utils.ts
export async function fileExists(path: string): Promise<boolean> { /* ... */ }
export async function directoryExists(path: string): Promise<boolean> { /* ... */ }
export function isExitPromptError(error: unknown): boolean { /* ... */ }
```

#### 7. Inconsistent Color/Icon Constants
**Location**: checkpoint.ts and restore.ts define their own COLORS/ICONS instead of using wizard/prompts.ts

**From checkpoint.ts (lines 30-48)**:
```typescript
const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  // ... duplicated
};

const ICONS = {
  checkpoint: "\u2713",
  // ... duplicated
};
```

**Recommendation**: Import from shared prompts.ts in all files:
```typescript
import { COLORS, ICONS } from "./wizard/prompts.js";
```

#### 8. Unused Variable in maturity.ts
**Location**: `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/cli/maturity.ts:237-238`

```typescript
const _patterns = testPatterns[projectType] ?? testPatterns.generic;
void _patterns; // Currently using directory-based detection
```

**Issue**: Variable assigned and explicitly voided - dead code that should be removed or implemented.

**Recommendation**: Either implement pattern-based detection or remove the unused code.

#### 9. Magic Numbers and Strings
**Location**: Throughout maturity.ts

```typescript
const maxScore = 13; // Line 159
const maxFiles = 20; // checkpoint.ts line 99
if (lines.length >= 5) { // maturity.ts line 662
```

**Recommendation**: Extract to named constants:
```typescript
const MATURITY_CONFIG = {
  MAX_SCORE: 13,
  SUBSTANTIAL_README_LINES: 5,
  MAX_DISPLAY_FILES: 20,
} as const;
```

#### 10. Inconsistent Error Return Patterns
**Location**: Various command files

**Some commands return early with error**:
```typescript
// checkpoint.ts
return {
  success: false,
  action: "show",
  error,
};
```

**Others set process.exitCode**:
```typescript
// doctor.ts
process.exitCode = exitCode;
```

**Recommendation**: Establish consistent error handling convention:
1. Commands should return result objects
2. Main entry point should handle exit codes
3. Document the pattern in a CONTRIBUTING guide

---

### Low Severity Issues

#### 11. Missing JSDoc Comments on Public Functions
**Location**: Most exported functions lack JSDoc documentation

**Example from init.ts**:
```typescript
export async function runInitCommand(options: InitOptions = {}): Promise<void> {
  // No JSDoc
```

**Recommendation**: Add JSDoc for all public APIs:
```typescript
/**
 * Run the init command to initialize Atreides in a project.
 *
 * @param options - Configuration options for initialization
 * @param options.directory - Target directory (defaults to cwd)
 * @returns void - prints results to console
 * @throws Will re-throw non-cancellation errors
 */
export async function runInitCommand(options: InitOptions = {}): Promise<void> {
```

#### 12. Non-null Assertions Without Guards
**Location**: Multiple locations using `!` operator

**From wizard/steps/step1-detection.ts (line 82)**:
```typescript
const selectedType = types.find(t => t.type === selected)!;
```

**Recommendation**: Use proper guard or throw meaningful error:
```typescript
const selectedType = types.find(t => t.type === selected);
if (!selectedType) {
  throw new Error(`Unknown project type: ${selected}`);
}
```

#### 13. Console.log for JSON Output
**Location**: Multiple commands output JSON via console.log

```typescript
// checkpoint.ts line 194
console.log(JSON.stringify(result.checkpoint, null, 2));
```

**Recommendation**: Use stdout explicitly for JSON output to separate from stderr logging:
```typescript
process.stdout.write(JSON.stringify(result.checkpoint, null, 2) + '\n');
```

#### 14. Missing TypeScript Strict Null Checks in Array Access
**Location**: `/Users/ambrealismwork/Desktop/coding-projects/atreides-oc/src/cli/index.ts:127-128`

```typescript
for (let i = filesIndex + 1; i < args.length; i++) {
  if (args[i]?.startsWith("-")) break;
  files.push(args[i]!);  // Non-null assertion
}
```

**Recommendation**: Use safer array access:
```typescript
for (let i = filesIndex + 1; i < args.length; i++) {
  const arg = args[i];
  if (!arg || arg.startsWith("-")) break;
  files.push(arg);
}
```

#### 15. Missing Input Length Validation
**Location**: checkpoint.ts, restore.ts - user-provided names and descriptions

```typescript
// No validation on name length
if (options.name) {
  createOptions.name = options.name;
}
```

**Recommendation**: Add reasonable length limits:
```typescript
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;

if (options.name) {
  if (options.name.length > MAX_NAME_LENGTH) {
    throw new Error(`Name must be ${MAX_NAME_LENGTH} characters or less`);
  }
  createOptions.name = options.name;
}
```

---

## Positive Highlights

### Excellent User Experience Design

1. **Progressive Disclosure Wizard**: The 5-step wizard in `wizard/` provides excellent user guidance without overwhelming with options.

2. **Comprehensive Help Text**: Each command has detailed help with examples:
```typescript
export function printRestoreHelp(): void {
  console.log(`
${COLORS.bold}atreides-opencode restore${COLORS.reset}
Restore a project from a checkpoint.

${COLORS.bold}Usage:${COLORS.reset}
  atreides-opencode restore <checkpoint-id> [options]
  atreides-opencode restore --latest [options]

${COLORS.bold}Options:${COLORS.reset}
  --latest              Restore the most recent checkpoint
  ...
```

3. **Confirmation Prompts**: Destructive operations require confirmation with sensible defaults.

### Clean Architecture

1. **Single Responsibility**: Each command file handles one concern.

2. **Type-Safe Results**: Commands return typed result objects:
```typescript
export interface CheckpointCommandResult {
  success: boolean;
  action: string;
  data?: Checkpoint | Checkpoint[] | { deleted: boolean };
  error?: string;
}
```

3. **Proper Async/Await**: Consistent use of async patterns throughout.

### Robust Diagnostic System

The doctor command provides comprehensive health checks with clear remediation guidance:
```typescript
export interface DiagnosticResult {
  category: string;
  status: DiagnosticStatus;
  message: string;
  details?: string[];
  remediation?: string;
}
```

### Excellent Project Detection

The project-detection.ts module handles multiple project types with confidence levels:
```typescript
export interface ProjectDetection {
  type: ProjectType;
  confidence: ConfidenceLevel;
  evidence: string[];
  packageManager?: PackageManager;
  displayName: string;
  language: string;
}
```

### Good Dry-Run Support

The migrate command provides excellent preview capability:
```typescript
if (dryRun) {
  console.log(`${COLORS.cyan}${ICONS.info}${COLORS.reset} Dry run complete. No changes were made.`);
  console.log(`${COLORS.dim}Run without --dry-run to apply changes.${COLORS.reset}`);
}
```

---

## Recommendations Summary

### Immediate Actions (Security)

1. Replace `execSync` with `execFileSync` in doctor.ts
2. Add path validation utility and use throughout
3. Validate checkpoint IDs before use
4. Sanitize editor command in conflict-resolution.ts

### Short-term Improvements

1. Extract duplicated utilities to shared module
2. Use COLORS/ICONS from wizard/prompts.ts everywhere
3. Import version from package.json/constants
4. Add JSDoc to all public functions
5. Establish consistent error handling pattern

### Medium-term Enhancements

1. Consider using a CLI framework (Commander, Yargs, Clipanion)
2. Add unit tests for command handlers
3. Implement structured logging
4. Add telemetry opt-in for usage analytics
5. Consider adding shell completions generation

### Long-term Architecture

1. Add plugin system for custom commands
2. Implement configuration file for CLI preferences
3. Add interactive mode for complex operations
4. Consider TUI library for richer interface (Ink, blessed)

---

## Appendix: Files Reviewed

| File | Lines | Status |
|------|-------|--------|
| src/cli/index.ts | 264 | Reviewed |
| src/cli/init.ts | 183 | Reviewed |
| src/cli/doctor.ts | 1007 | Reviewed |
| src/cli/update.ts | 436 | Reviewed |
| src/cli/migrate.ts | 980 | Reviewed |
| src/cli/maturity.ts | 1448 | Reviewed |
| src/cli/checkpoint.ts | 359 | Reviewed |
| src/cli/restore.ts | 329 | Reviewed |
| src/cli/uninstall.ts | 425 | Reviewed |
| src/cli/conflict-resolution.ts | 275 | Reviewed |
| src/cli/project-detection.ts | 237 | Reviewed |
| src/cli/wizard/index.ts | 87 | Reviewed |
| src/cli/wizard/prompts.ts | 138 | Reviewed |
| src/cli/wizard/types.ts | 187 | Reviewed |
| src/cli/wizard/steps/step1-detection.ts | 99 | Reviewed |
| src/cli/wizard/steps/step2-mode.ts | 40 | Reviewed |
| src/cli/wizard/steps/step3-models.ts | 100 | Reviewed |
| src/cli/wizard/steps/step4-permissions.ts | 88 | Reviewed |
| src/cli/wizard/steps/step5-confirmation.ts | 76 | Reviewed |

**Total Lines Reviewed**: ~6,758

---

*Review completed by Backend Architect*
