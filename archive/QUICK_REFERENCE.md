# Atreides → OpenCode Migration: Quick Reference

## Key Decisions Summary

| Area | Decision |
|------|----------|
| Distribution | npm package (`atreides-opencode`) + local `.opencode/` generation |
| Orchestration | Split: `AGENTS.md` (user-visible) + Plugin hooks (core behavior) |
| Models | Configurable with defaults; onboarding wizard for selection |
| Compatibility | Hybrid mode - imports existing `CLAUDE.md` if present |
| Shell Scripts | Fully replaced with TypeScript hooks |
| Scope | Full feature parity; MVP first, then post-MVP phases |
| **Identity** | Configurable persona name (default: "Muad'Dib") with `[name]:` response prefix |
| **Security** | Command obfuscation detection, blocked file patterns, log sanitization |

## MVP Scope (Weeks 1-6)

### Core Plugin Features
- [x] Session lifecycle management
- [x] Workflow engine (4 phases)
- [x] Error recovery (3-strikes)
- [x] Tool interception (validation, logging)
- [x] System prompt injection
- [x] Compaction/context preservation
- [x] Todo enforcement
- [x] **Identity system** (persona name, response prefix, delegation announcements)
- [x] **Security hardening** (obfuscation detection, blocked patterns, log sanitization)
- [x] **Init modes** (minimal/standard/full)
- [x] **Project type detection** (auto-detect language, generate appropriate config)

### MVP Agents (5)
1. **Oracle** - Architecture decisions, complex debugging
2. **Explore** - Fast codebase exploration
3. **Librarian** - Documentation/OSS research
4. **Build** - Default full-access agent
5. **Plan** - Read-only planning mode

### MVP Skills (4)
1. **base** - Core skill definition (SKILL.md)
2. **orchestrate** - Main workflow coordinator (main context)
3. **explore** - Parallel exploration patterns (fork context)
4. **validate** - Quality gate execution (main context)

### MVP CLI
- `npx atreides init` - Interactive onboarding wizard
- `npx atreides doctor` - Installation verification
- `npx atreides update` - Version updates

## Post-MVP Phases

| Phase | Timeline | Features |
|-------|----------|----------|
| Phase 2 | Weeks 7-9 | 3 more agents, 3 more skills |
| Phase 3 | Weeks 10-12 | 5 more skills (tdd, parallel-explore, etc.) |
| Phase 4 | Weeks 13-15 | Notifications, think mode, context monitor |
| Phase 5 | Weeks 16-18 | **Maturity scoring (0-13 pts)**, checkpoint system, session logging |
| Phase 6 | Weeks 19+ | Custom permissions, metrics, enterprise |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    atreides-opencode                         │
├─────────────────────────────────────────────────────────────┤
│  npm package                    Generated in project        │
│  ─────────────                  ──────────────────          │
│  • Plugin core (TypeScript)     • AGENTS.md (rules)         │
│  • CLI (init/doctor/update)     • opencode.json (config)    │
│  • Templates                    • .opencode/plugin/*.ts     │
│  • Generators                   • .opencode/agent/*.md      │
│  • Security hardening           • .opencode/skill/*/        │
│  • Identity system                                          │
└─────────────────────────────────────────────────────────────┘
```

## OpenCode Hook Mapping

| Atreides Feature | OpenCode Hook | Priority |
|-----------------|---------------|----------|
| Session init/cleanup | `event` (session.*) | MVP |
| Stop enforcement | `stop` | MVP |
| Bash validation | `tool.execute.before` | MVP |
| Edit logging | `tool.execute.after` | MVP |
| Rules injection | `experimental.chat.system.transform` | MVP |
| Context preservation | `experimental.session.compacting` | MVP |
| Model switching | `chat.params` | Post-MVP |
| Custom permissions | `permission.ask` | Post-MVP |

## File Structure After Init

```
project/
├── AGENTS.md                     # Customizable rules
├── opencode.json                 # Configuration (language-specific)
└── .opencode/
    ├── package.json
    ├── plugin/atreides.ts        # Plugin entry
    ├── agent/
    │   ├── oracle.md
    │   ├── explore.md
    │   ├── librarian.md
    │   ├── build.md
    │   └── plan.md
    └── skill/
        ├── base/SKILL.md
        ├── orchestrate/SKILL.md
        ├── explore/SKILL.md
        └── validate/SKILL.md
```

## Onboarding Wizard Steps (8 Steps)

1. **Project Detection** - Detect project type (node/python/go/rust), find existing CLAUDE.md
2. **Installation Mode** - Minimal / Standard / Full
3. **Persona Configuration** - Set agent identity name (default: "Muad'Dib")
4. **Agent Selection** - Choose which agents to enable
5. **Model Configuration** - Select models per agent (with defaults)
6. **Permission Preset** - Strict / Balanced / Relaxed
7. **Skills Selection** - Choose which skills to include (with context type info)
8. **Confirmation** - Review and generate files

## Security Hardening (MVP)

### Obfuscation Detection
- URL decode (%XX) → ASCII
- Hex escapes (\xNN) → ASCII
- Octal escapes (\NNN) → ASCII
- Quote stripping (r'm' → rm)
- Backslash continuations

### Blocked Patterns
- Filesystem destruction: `rm -rf /`, `mkfs`, `dd if=`
- Fork bomb: `:(){:|:&};:`
- Remote code execution: `curl | bash`, `wget | sh`
- Eval injection: `eval $(`

### Blocked Files
- `.env*`, `secrets.*`, `credentials.*`
- `*.pem`, `*.key`, `id_rsa`
- `.aws/*`, `.ssh/*`, `kubeconfig`

## Skill Context Types

| Context | Behavior | Skills |
|---------|----------|--------|
| **main** | Full session access, can modify state | base, orchestrate, validate, checkpoint, doc-sync, quality-gate |
| **fork** | Isolated, returns summary only | explore, lsp, refactor, tdd, parallel-explore, incremental-refactor |

## Test Coverage Target

Match Atreides' **466 tests** across categories:
- Security (path traversal, injection, DoS): ~60 tests
- Core functionality: ~200 tests
- Plugin logic: ~150 tests
- Integration: ~56 tests

## Quick Commands

```bash
# Initialize new project
npx atreides init

# Quick setup with all defaults
npx atreides init --defaults

# Specify installation mode
npx atreides init --mode minimal|standard|full

# Check installation health
npx atreides doctor

# Update to latest version
npx atreides update

# Migrate from Claude Code Atreides
npx atreides migrate
```

## Links

- [Full Master Plan](./MASTER_MIGRATION_PLAN.md)
- [Deep Dive Findings](./ATREIDES_DEEP_DIVE_FINDINGS.md)
- [OpenCode Plugin Docs](https://open-code.ai/en/docs/plugins)
- [OpenCode Agent Docs](https://open-code.ai/en/docs/agents)
- [OpenCode Skills Docs](https://open-code.ai/en/docs/skills)
- [Original Atreides Repo](https://github.com/AmbitiousRealism2025/Atreides)
