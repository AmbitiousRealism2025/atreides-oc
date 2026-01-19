# Atreides Repository Deep Dive: Findings for Migration Plan Integration

> **Analysis Date**: 2026-01-18
> **Repository**: https://github.com/AmbitiousRealism2025/Atreides
> **Commit**: 0499bfafa664679fa5b079fa879016836b144be7
> **Purpose**: Document discoveries that require integration into the OpenCode migration plan

---

## Executive Summary

The deep analysis of the Atreides repository revealed **significant additional details** not captured in the initial migration plan. Key findings include:

1. **Muad'Dib Identity System** - Agent identity with `[Muad'Dib]:` prefix for responses
2. **12 Skills (not 11)** - Includes base SKILL.md definition file
3. **5 Shell Scripts with sophisticated security** - Command obfuscation detection, log injection prevention
4. **Maturity Assessment Framework** - Scoring system for codebase classification
5. **14 Template Partials** - Modular orchestration rules requiring careful migration
6. **466 Tests** - Comprehensive test coverage we should match
7. **Safe Git Recovery** - Prefers `git restore` over `git checkout`

---

## SECTION 1: Critical Identity Feature - Muad'Dib Agent Persona

### Finding

The orchestrator agent has a **distinct identity** named "Muad'Dib" with specific response formatting requirements.

### Evidence

From `lib/core/orchestration-rules.md`:
```
All responses must start with [Muad'Dib]: prefix (non-negotiable)
```

From `lib/skills/muaddib/orchestrate.md`:
```
Agent Identity Enforcement:
- Start responses with [Muad'Dib]: for major actions
- Before Task delegation: [Muad'Dib]: Delegating to <agent>...
- After delegation returns: [Muad'Dib]: Received results from <agent>...
- On completion: [Muad'Dib]: Task complete.
```

### Impact on Migration Plan

| Current Plan | Required Update |
|--------------|-----------------|
| No agent identity system | Add Muad'Dib identity with configurable name |
| Generic delegation messages | Add delegation announcement hooks |
| No persona branding | Consider making persona name configurable in onboarding |

### Recommendation

**Add to MVP**: The identity system is a core user experience feature. Implement as:
```typescript
// In system prompt injection
"experimental.chat.system.transform": async (input, output) => {
  const personaName = config.personaName || "Muad'Dib";
  output.system.push(`
    You are ${personaName}, an AI orchestrator...
    All major responses should be prefixed with [${personaName}]:
  `);
}
```

---

## SECTION 2: Complete Skills Inventory (12 Skills)

### Finding

The repository contains **12 skill files** (not 11 as documented), with specific context types (main vs fork).

### Complete Skills List

| Skill | File | Context | Model | Priority |
|-------|------|---------|-------|----------|
| **SKILL.md** | `SKILL.md` | main | opus | MVP (core definition) |
| **orchestrate** | `orchestrate.md` | main | opus | MVP |
| **explore** | `explore.md` | fork | sonnet | MVP |
| **validate** | `validate.md` | main | sonnet | MVP |
| **checkpoint** | `checkpoint.md` | main | haiku | Post-MVP |
| **doc-sync** | `doc-sync.md` | main | sonnet | Post-MVP |
| **quality-gate** | `quality-gate.md` | main | sonnet | Post-MVP |
| **lsp** | `lsp.md` | fork | sonnet | Post-MVP |
| **refactor** | `refactor.md` | fork | opus | Post-MVP |
| **tdd** | `tdd.md` | fork | sonnet | Post-MVP |
| **parallel-explore** | `parallel-explore.md` | fork | sonnet | Post-MVP |
| **incremental-refactor** | `incremental-refactor.md` | fork | opus | Post-MVP |

### Context Types Explained

- **main**: Operates in primary session context, can modify session state
- **fork**: Operates in isolated context (forked), returns summary only - prevents context bloat

### Impact on Migration Plan

| Current Plan | Required Update |
|--------------|-----------------|
| 11 skills listed | Add SKILL.md as base definition |
| No context type distinction | Document fork vs main behavior |
| Generic skill structure | Add context field to skill frontmatter |

### Recommendation

**Update skill structure** to include context specification:
```yaml
# .opencode/skill/explore/SKILL.md
---
name: explore
description: Isolated codebase exploration
context: fork  # NEW: fork or main
model: anthropic/claude-haiku-4-5
---
```

---

## SECTION 3: Shell Script Security Features

### Finding

The 5 shell scripts implement **sophisticated security measures** including command obfuscation detection, log injection prevention, and safe recovery commands.

### Script Details

#### 1. validate-bash-command.sh (169 lines)

**Security Features**:
- **Command Normalization** - Decodes obfuscation:
  - URL decode (%XX hex sequences)
  - Hex escapes (\xNN)
  - Octal escapes (\NNN)
  - Quote splitting (r'm' → rm)
  - Backslash continuations
  - $'\xNN' bash quoting style

**Blocked Patterns** (case-insensitive):
```bash
rm -rf /
rm -rf ~
rm -rf $HOME
> /dev/sd
mkfs
dd if=
:(){:|:&};:  # fork bomb
chmod -R 777 /
curl [...]| bash
wget [...]| bash
eval $(
```

**Warning Patterns** (allowed but logged):
```bash
sudo
chmod
chown
rm -rf
git push --force
git reset --hard
```

#### 2. pre-edit-check.sh (118 lines)

**Blocked File Patterns**:
```bash
.env, .env.*, .envrc
/secrets/, /.secrets/
secrets.json, secrets.yaml
credentials.json, credentials.yaml, .credentials
.pem, .key
id_rsa, id_ed25519
.ssh/config
.aws/credentials, .aws/config
.npmrc, .pypirc, .yarnrc
kubeconfig
.tfvars, .tfstate
```

#### 3. post-edit-log.sh (100 lines)

**Features**:
- Log sanitization (removes control chars, limits length to 500)
- Automatic formatter integration (prettier, black, gofmt, rustfmt)
- Persistent log: `~/.muaddib/logs/edits.log`
- Log rotation (keep last 1000 lines)

#### 4. error-detector.sh (93 lines)

**Detected Patterns** (22 patterns):
```
command not found, permission denied, no such file,
module not found, cannot find module, Error:, ERROR:,
failed, FAILED, exception, Exception, traceback, Traceback,
SyntaxError, TypeError, undefined, null pointer,
segmentation fault, out of memory, connection refused, timeout
```

#### 5. notify-idle.sh (48 lines)

**Features**:
- Session stop logging
- Checkpoint backup on idle/timeout
- Log rotation (keep last 100 entries)

### Impact on Migration Plan

| Current Plan | Required Update |
|--------------|-----------------|
| Basic command validation | Add obfuscation detection |
| Simple file blocking | Add comprehensive blocked patterns list |
| No log sanitization | Add control char stripping, length limits |
| No formatter integration | Add post-edit formatters |
| No error pattern detection | Add 22-pattern error detector |

### Recommendation

**Critical for MVP**: Port all security features to TypeScript hooks:

```typescript
// Obfuscation detection example
function normalizeCommand(cmd: string): string {
  let normalized = cmd;
  // URL decode
  normalized = normalized.replace(/%([0-9A-Fa-f]{2})/g, (_, hex) => 
    String.fromCharCode(parseInt(hex, 16))
  );
  // Hex escapes
  normalized = normalized.replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  // Quote stripping (r'm' → rm)
  normalized = normalized.replace(/(['"])(.)\1/g, '$2');
  return normalized;
}
```

---

## SECTION 4: Template Partials (14 Files)

### Finding

The templates are highly modular with **14 partial files** that compose the main CLAUDE.md.

### Partials Inventory

| Partial | Lines | Purpose |
|---------|-------|---------|
| `intent-classification.hbs` | 202 | Request classification decision tree |
| `workflow-phases.hbs` | 302 | 4-phase workflow definitions |
| `orchestration-rules.hbs` | 187 | Core rules (TodoWrite, 3-strikes, recovery) |
| `agent-definitions.hbs` | 477 | Agent matrix, 7-section template, cost tiers |
| `exploration-patterns.hbs` | 239 | Parallel agent patterns, termination conditions |
| `completion-checking.hbs` | 220 | 4-step completion checklist |
| `context-management.hbs` | 271 | Memory hierarchy, preservation strategies |
| `maturity-assessment.hbs` | 231 | Codebase maturity scoring |
| `session-continuity.hbs` | 221 | Session start/end protocols |
| `quality-standards.hbs` | 102 | Quality rules, check sequences |
| `ast-grep-patterns.hbs` | ~100 | AST-grep refactoring patterns |
| `lsp-operations.hbs` | ~80 | LSP operation fallbacks |
| `checkpoint-system.hbs` | ~60 | Checkpoint creation/recovery |
| `skill-composition.hbs` | ~50 | Skill combination patterns |

### Key Content Discoveries

#### Maturity Assessment Scoring System

```
Scoring (0-13 points):
- Test Coverage: High(+3) / Medium(+2) / Low(+1) / None(0)
- Code Consistency: Very consistent(+3) / Mostly(+2) / Mixed(+1) / Inconsistent(0)
- Documentation: Comprehensive(+3) / Partial(+2) / Minimal(+1) / None(0)
- CI/CD: Full pipeline(+2) / Basic CI(+1) / None(0)
- Type Safety: Strict types(+2) / Partial(+1) / No types(0)

Level Determination:
- 10-13 → DISCIPLINED
- 6-9 → TRANSITIONAL
- 3-5 → LEGACY
- 0-2 → Check if GREENFIELD
```

#### Safe Recovery Commands (git restore preferred)

```markdown
Why `git restore` instead of `git checkout`?
- `git restore` is the modern replacement (Git 2.23+)
- Clearer intent: restore is explicitly for restoring files
- Safer: `git checkout` can switch branches if used incorrectly
- Avoids accidental branch operations when recovering from errors
```

### Impact on Migration Plan

| Current Plan | Required Update |
|--------------|-----------------|
| Single AGENTS.md | Consider modular structure |
| No maturity scoring | Add scoring system |
| git checkout for recovery | Use git restore |
| Generic quality checks | Add language-specific sequences |

### Recommendation

**Split orchestration rules** into logical sections in AGENTS.md with clear headers matching the partial structure.

---

## SECTION 5: Test Coverage Analysis (466 Tests)

### Finding

The repository has **comprehensive test coverage** across 9 test files with 466 tests.

### Test Distribution

| Test File | Tests | Focus |
|-----------|-------|-------|
| `file-manager.test.js` | ~120 | File ops, DoS protection, path traversal |
| `shell-scripts.test.js` | ~80 | Script validation, security patterns |
| `template-engine.test.js` | ~81 | Rendering, validation, JSON parsing |
| `init.test.js` | ~70 | All init modes, flag normalization |
| `hooks.test.js` | ~60 | Hook argument handling, file blocking |
| `cli.test.js` | ~50 | Command structure, validators |
| `settings-merge.test.js` | ~45 | Deep merge, prototype pollution |
| `e2e.test.js` | ~35 | Full workflow tests |
| `security-verification.test.js` | ~25 | Security fixes verification |

### Security Tests (Critical)

| Security Area | Test Count |
|---------------|------------|
| Path Traversal Protection | 6 |
| Command Injection | 15+ |
| Prototype Pollution | 8 |
| Template Injection | 4 |
| Log Injection | 2 |
| DoS Protection (maxFiles, maxDepth) | 10+ |
| Input Validation | 15+ |

### Impact on Migration Plan

| Current Plan | Required Update |
|--------------|-----------------|
| >80% test coverage target | Maintain parity with 466 tests |
| Generic test categories | Add security-specific test suite |
| No DoS protection testing | Add file/depth limit tests |

### Recommendation

**Add to test plan**: Security test suite matching Atreides coverage:
- Path traversal tests
- Command obfuscation tests
- Prototype pollution tests
- Input length validation tests

---

## SECTION 6: Configuration Details

### Finding

The configuration system has **multiple levels** and **flag normalization logic**.

### Init Modes

| Mode | --minimal | --standard (default) | --full |
|------|-----------|---------------------|--------|
| useHooks | false | true | true |
| useAgentDelegation | false | false | true |
| orchestrationLevel | minimal | standard | full |

### Flag Precedence

```
--minimal takes precedence when both --minimal and --full provided
--full takes precedence over standard default
```

### Configuration Files Generated

| File | Mode: minimal | Mode: standard | Mode: full |
|------|---------------|----------------|------------|
| CLAUDE.md | ✓ | ✓ | ✓ |
| .claude/settings.json | ✗ | ✓ | ✓ |
| .claude/context.md | ✗ | ✓ | ✓ |
| .claude/critical-context.md | ✗ | ✓ | ✓ |
| .claude/scripts/* | ✗ | ✓ | ✓ |
| .claude/skills/muaddib/* | ✗ | ✗ | ✓ |
| .muaddib/config.json | ✗ | ✓ | ✓ |

### Project Type Detection

Automatic detection based on files:
- `package.json` → node
- `tsconfig.json` → typescript
- `pyproject.toml` or `setup.py` → python
- `go.mod` → go
- `Cargo.toml` → rust

### Impact on Migration Plan

| Current Plan | Required Update |
|--------------|-----------------|
| Three permission presets | Add init mode concept |
| No project type auto-detection | Add detection logic |
| Single config file set | Mode-dependent file generation |

### Recommendation

**Add init modes** to wizard:
```
Step 2: Installation Mode
( ) Minimal - AGENTS.md only (for existing projects)
(x) Standard - Full config, no agent delegation
( ) Full - Everything including agent delegation
```

---

## SECTION 7: Hook Integration Details

### Finding

The hooks system uses **specific environment variables** and **matchers**.

### Environment Variables

| Variable | Hook Type | Purpose |
|----------|-----------|---------|
| `$COMMAND` | PreToolUse (Bash) | The command being executed |
| `$FILE` | PreToolUse (Edit/Write) | File being modified |
| `TOOL_INPUT` | All | Fallback input source |
| `TOOL_EXIT_CODE` | PostToolUse | Command exit code |
| `TOOL_OUTPUT` | PostToolUse | Command output |
| `STOP_REASON` | Stop | Why session stopped |
| `MUADDIB_SESSION_LOG` | PostToolUse | Optional session log path |

### Hook Matchers

| Matcher | Matches |
|---------|---------|
| `Bash` | Bash tool only |
| `Edit\|Write` | Edit or Write tools |
| `*` | All tools |

### Hook Types Used

| Hook Type | Purpose |
|-----------|---------|
| `PreToolUse` | Validate before execution |
| `PostToolUse` | Log/format after execution |
| `SessionStart` | Load context.md |
| `Stop` | Notify idle, save checkpoint |
| `PreCompact` | Load critical-context.md |

### Impact on Migration Plan

| Current Plan | Required Update |
|--------------|-----------------|
| Generic hook descriptions | Document specific env vars |
| No matcher patterns | Add matcher pattern support |
| 6 hooks listed | Add PreCompact hook |

### Recommendation

**Map to OpenCode hooks**:
- PreToolUse → `tool.execute.before`
- PostToolUse → `tool.execute.after`
- SessionStart → `event` (session.created)
- Stop → `stop`
- PreCompact → `experimental.session.compacting`

---

## SECTION 8: Agent Display Names

### Finding

Agents have **specific display names** for user-facing messages.

### Display Name Mapping

| subagent_type | Display Name |
|---------------|--------------|
| `Explore` | Explore agent |
| `general-purpose` | Research agent |
| `Plan` | Plan agent |
| `security-engineer` | Security Engineer |
| `performance-engineer` | Performance Engineer |
| `frontend-architect` | Frontend Architect |
| `backend-architect` | Backend Architect |
| `quality-engineer` | Quality Engineer |
| `refactoring-expert` | Refactoring Expert |

### Delegation Announcement Format

```
Before: [Muad'Dib]: Delegating to <display_name>...
After:  [Muad'Dib]: Received results from <display_name>. <brief summary>
```

### Impact on Migration Plan

| Current Plan | Required Update |
|--------------|-----------------|
| 8 agents listed | Add display name mapping |
| No announcement format | Add delegation announcement hooks |

### Recommendation

**Add display names** to agent configuration:
```yaml
# .opencode/agent/explore.md
---
name: explore
displayName: Explore agent
description: Fast codebase exploration
---
```

---

## SECTION 9: Language-Specific Configurations

### Finding

Configurations are **highly language-specific** with different tools, patterns, and permissions.

### Permission Patterns by Language

| Language | Allow Patterns |
|----------|----------------|
| Node | `Bash(npm *)`, `Bash(npx *)`, `Bash(node *)` |
| Python | `Bash(python *)`, `Bash(pip *)`, `Bash(pytest *)` |
| Go | `Bash(go *)` |
| Rust | `Bash(cargo *)` |

### PostToolUse Formatters by Language

| Language | Formatters |
|----------|-----------|
| Node | `npx prettier --write`, `npx eslint --fix` |
| Python | `black`, `ruff check --fix` |
| Go | `gofmt -w`, `go vet` |
| Rust | `rustfmt`, `cargo clippy --fix` |

### Quality Check Commands by Language

| Language | Commands |
|----------|----------|
| Node/TS | `npm test`, `tsc --noEmit`, `eslint`, `prettier` |
| Python | `pytest`, `mypy`, `ruff check`, `black --check` |
| Go | `go test ./...`, `go vet`, `golangci-lint run` |
| Rust | `cargo test`, `cargo check`, `cargo clippy` |

### Impact on Migration Plan

| Current Plan | Required Update |
|--------------|-----------------|
| Generic permission presets | Language-specific presets |
| No formatter integration | Add PostToolUse formatters |
| Generic quality checks | Language-specific check sequences |

### Recommendation

**Generate language-specific configurations** during init based on project type detection.

---

## SECTION 10: Documentation Gaps Discovered

### Finding

Some features are **implemented but under-documented** in the migration plan.

### Under-Documented Features

| Feature | Status in Plan | Required Addition |
|---------|---------------|-------------------|
| Checkpoint system | Mentioned | Add full checkpoint.md template |
| Critical context | Mentioned | Add PreCompact hook behavior |
| Session logs | Not mentioned | Add `~/.muaddib/logs/` structure |
| State directory | Not mentioned | Add `~/.muaddib/state/` structure |
| Backup rotation | Not mentioned | Add maxBackups, maxAgeDays settings |
| Project detection | Not mentioned | Add detection logic |
| Flag normalization | Not mentioned | Add precedence rules |
| Obfuscation detection | Not mentioned | Add security patterns |

---

## Summary: Required Plan Updates

### MVP Additions

1. **Muad'Dib Identity** - Add persona name and response prefix
2. **Security Hardening** - Add obfuscation detection, log sanitization
3. **Blocked File Patterns** - Complete list from pre-edit-check.sh
4. **Error Pattern Detection** - 22-pattern list from error-detector.sh
5. **Init Modes** - minimal/standard/full
6. **Project Type Detection** - Automatic detection logic
7. **PreCompact Hook** - Map to session.compacting

### Post-MVP Additions

1. **Maturity Scoring** - Add scoring system from maturity-assessment.hbs
2. **Checkpoint System** - Full checkpoint.md template
3. **Backup Rotation** - maxBackups, maxAgeDays settings
4. **Agent Display Names** - Display name mapping
5. **Delegation Announcements** - Before/after delegation messages
6. **Session Logging** - `~/.muaddib/logs/` and `~/.muaddib/state/`

### Test Coverage Requirements

- Match 466 tests (prioritize security tests)
- Add path traversal tests
- Add command obfuscation tests
- Add prototype pollution tests
- Add DoS protection tests

---

## Appendix: File Counts

| Category | Count |
|----------|-------|
| Template Files | 20 (6 main + 14 partials) |
| Skill Files | 12 |
| Shell Scripts | 5 |
| Core Rule Files | 10 |
| Test Files | 9 (466 tests) |
| Documentation Files | 35 |
| Total Template Lines | 3,885 |

---

*Document generated from 5 parallel librarian agent analyses of the Atreides repository.*
