# Atreides OC: Master Plan

> **Project**: atreides-opencode (Atreides OC)
> **Version**: 1.0.0-final
> **Created**: 2026-01-18
> **Status**: Planning Complete - Ready for Implementation

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Key Decisions](#2-key-decisions)
3. [Technical Architecture](#3-technical-architecture)
   - 3.5.1 [Hook Fallback Strategy](#351-hook-fallback-strategy)
4. [Component Migration Map](#4-component-migration-map)
5. [MVP Scope](#5-mvp-scope)
6. [Post-MVP Features](#6-post-mvp-features)
7. [Detailed Phase Breakdown](#7-detailed-phase-breakdown)
   - 7.4 [Phase Acceptance Criteria](#74-phase-acceptance-criteria)
8. [Package Structure](#8-package-structure)
9. [Onboarding Flow Design](#9-onboarding-flow-design)
   - 9.6 [CLI Operational Runbook](#96-cli-operational-runbook)
10. [Risk Assessment](#10-risk-assessment)
11. [Success Criteria](#11-success-criteria)
    - 11.2 [Security-to-Test Traceability](#112-security-to-test-traceability)
12. [Appendices](#12-appendices)
    - [Appendix A: OpenCode Hook Reference](#appendix-a-opencode-hook-reference)
    - [Appendix B: Atreides Workflow Phases](#appendix-b-atreides-workflow-phases)
    - [Appendix C: Model Selection Defaults](#appendix-c-model-selection-defaults)
    - [Appendix D: Permission Presets](#appendix-d-permission-presets)
    - [Appendix E: Security Hardening Reference](#appendix-e-security-hardening-reference)
    - [Appendix F: Skill Context Types](#appendix-f-skill-context-types)
    - [Appendix G: MVP Guardrails](#appendix-g-mvp-guardrails)
    - [Appendix H: Compatibility Rules](#appendix-h-compatibility-rules)

---

## 1. Executive Summary

### What We're Building

**atreides-opencode** is a comprehensive OpenCode plugin that brings Atreides' systematic orchestration capabilities to the OpenCode ecosystem. It transforms ad-hoc AI coding sessions into disciplined, multi-phase development workflows with intelligent agent delegation, error recovery, and quality enforcement.

### Why This Migration

- **OpenCode's Native Extensibility**: OpenCode provides first-class support for plugins, agents, skills, and tools—features that Atreides had to emulate through template generation
- **Simplified Architecture**: No more template rendering, wrapper scripts, or dual-environment complexity
- **TypeScript-First**: Replace shell scripts with type-safe hooks
- **Community Ecosystem**: Integrate with OpenCode's growing plugin ecosystem

### Core Value Proposition

| Capability | How Atreides Delivers It |
|-----------|-------------------------|
| Systematic Workflows | 4-phase development cycle (Intent → Assessment → Exploration → Implementation → Verification) |
| Intelligent Delegation | 8 specialized agents with model selection and tool restrictions |
| Error Recovery | 3-strikes protocol with automatic revert and escalation |
| Quality Enforcement | Pre/post tool hooks, LSP diagnostics, build verification |
| Context Preservation | Session compaction with critical state persistence |
| Skill-Based Patterns | 12 reusable skill modules for common workflows |
| **Agent Identity System** | Configurable persona (default: "Muad'Dib") with branded response prefixes and delegation announcements |
| **Security Hardening** | Command obfuscation detection, blocked file patterns, log sanitization, error pattern detection |

---

## 2. Key Decisions

Captured from requirements gathering:

| Decision Area | Choice | Rationale |
|--------------|--------|-----------|
| **Distribution Model** | npm package + local generation | Best of both worlds: easy updates via npm, user customization via local files |
| **Orchestration Scope** | Split: AGENTS.md (visible) + Plugin hooks (core) | Users can customize rules while core behavior remains stable |
| **Agent Model Selection** | Configurable with defaults + onboarding wizard | Flexibility without complexity; guided setup for new users |
| **Backward Compatibility** | Hybrid mode (reads CLAUDE.md if present) | Smooth migration path for existing Atreides/Claude Code users |
| **Shell Scripts** | Fully replace with TypeScript hooks | Type safety, testability, cross-platform compatibility |
| **Feature Scope** | Full parity (MVP + post-MVP phases) | Long-term project; MVP ships core, iterations add features |

---

## 3. Technical Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         OpenCode Runtime                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   Plugin Core   │  │  Agent Configs  │  │  Skill Files    │  │
│  │  (TypeScript)   │  │   (Markdown)    │  │   (Markdown)    │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │           │
│           ▼                    ▼                    ▼           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    OpenCode Event Bus                        ││
│  │  (session.*, tool.*, message.*, permission.*, file.*)       ││
│  └─────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │    Commands     │  │   AGENTS.md     │  │  opencode.json  │  │
│  │   (Markdown)    │  │    (Rules)      │  │   (Config)      │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      atreides-opencode CLI                       │
├─────────────────────────────────────────────────────────────────┤
│  npx atreides init     │  Interactive onboarding wizard         │
│  npx atreides doctor   │  Verify installation & diagnose issues │
│  npx atreides update   │  Update to latest version              │
│  npx atreides migrate  │  Convert existing Atreides projects    │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Plugin Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Atreides Plugin Core                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │ Session      │    │ Workflow     │    │ Error        │       │
│  │ Manager      │    │ Engine       │    │ Recovery     │       │
│  │              │    │              │    │              │       │
│  │ - State map  │    │ - Phase      │    │ - Strike     │       │
│  │ - Lifecycle  │    │   tracking   │    │   counter    │       │
│  │ - Cleanup    │    │ - Intent     │    │ - Revert     │       │
│  │              │    │   classify   │    │ - Escalate   │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │ Tool         │    │ System       │    │ Compaction   │       │
│  │ Interceptor  │    │ Prompt       │    │ Handler      │       │
│  │              │    │ Injector     │    │              │       │
│  │ - Validation │    │ - Rules      │    │ - Context    │       │
│  │ - Logging    │    │ - Context    │    │   preserve   │       │
│  │ - Metrics    │    │ - Dynamic    │    │ - State      │       │
│  │              │    │   injection  │    │   serialize  │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │ Todo         │    │ Quality      │    │ Migration    │       │
│  │ Enforcer     │    │ Gates        │    │ Layer        │       │
│  │              │    │              │    │              │       │
│  │ - Creation   │    │ - Diagnostics│    │ - CLAUDE.md  │       │
│  │   tracking   │    │ - Build      │    │   reading    │       │
│  │ - Completion │    │ - Tests      │    │ - Settings   │       │
│  │   checks     │    │ - Evidence   │    │   compat     │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │ Identity     │    │ Security     │    │ Project      │       │
│  │ Manager      │    │ Hardening    │    │ Detection    │       │
│  │              │    │              │    │              │       │
│  │ - Persona    │    │ - Obfuscation│    │ - Language   │       │
│  │   name       │    │   detection  │    │   detection  │       │
│  │ - Response   │    │ - Blocked    │    │ - Maturity   │       │
│  │   prefix     │    │   patterns   │    │   scoring    │       │
│  │ - Delegation │    │ - Log        │    │ - Config     │       │
│  │   announce   │    │   sanitize   │    │   generation │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Security Hardening Architecture

The security layer implements defense-in-depth with multiple protection mechanisms:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Security Hardening Layer                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                 Command Validation Pipeline                  ││
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    ││
│  │  │ URL      │→ │ Hex      │→ │ Octal    │→ │ Quote    │    ││
│  │  │ Decode   │  │ Escape   │  │ Escape   │  │ Strip    │    ││
│  │  │ (%XX)    │  │ (\xNN)   │  │ (\NNN)   │  │ (r'm')   │    ││
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘    ││
│  │       ↓                                                      ││
│  │  ┌──────────────────────────────────────────────────────┐   ││
│  │  │              Pattern Matching Engine                  │   ││
│  │  │  Blocked: rm -rf /, mkfs, fork bomb, curl|bash       │   ││
│  │  │  Warning: sudo, chmod, git push --force              │   ││
│  │  └──────────────────────────────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                 File Operation Guards                        ││
│  │  Blocked: .env*, secrets.*, credentials.*, *.pem, *.key    ││
│  │           id_rsa, .ssh/*, .aws/*, .npmrc, .pypirc          ││
│  │           kubeconfig, *.tfvars, *.tfstate                   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                 Log Sanitization                             ││
│  │  - Control character removal                                 ││
│  │  - Length limits (500 chars)                                 ││
│  │  - Log rotation (1000 lines max)                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                 Error Pattern Detection                      ││
│  │  22 patterns: command not found, permission denied,         ││
│  │  module not found, TypeError, SyntaxError, timeout...       ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.4 Identity System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Agent Identity System                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Configuration:                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  personaName: "Muad'Dib"  (configurable in onboarding)      ││
│  │  responsePrefix: "[{personaName}]:"                          ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Response Formatting:                                            │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Major actions:     [Muad'Dib]: Analyzing codebase...       ││
│  │  Before delegation: [Muad'Dib]: Delegating to Oracle...     ││
│  │  After delegation:  [Muad'Dib]: Received results from...    ││
│  │  Completion:        [Muad'Dib]: Task complete.              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Agent Display Names (for delegation announcements):             │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  explore → "Explore agent"                                   ││
│  │  oracle → "Oracle"                                           ││
│  │  librarian → "Librarian"                                     ││
│  │  frontend-ui-ux → "Frontend Architect"                       ││
│  │  document-writer → "Documentation Writer"                    ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.5 Hook Integration Points

| OpenCode Hook | Atreides Feature | Priority |
|--------------|------------------|----------|
| `event` (session.created) | Session initialization, state setup | MVP |
| `event` (session.idle) | Completion checks, notifications | MVP |
| `event` (session.deleted) | Cleanup, state disposal | MVP |
| `stop` | Workflow enforcement, todo checks, uncommitted changes | MVP |
| `tool.execute.before` | Command validation, permission checks, file guards | MVP |
| `tool.execute.after` | Logging, state tracking, error detection | MVP |
| `experimental.chat.system.transform` | Orchestration rules injection | MVP |
| `experimental.session.compacting` | Context preservation | MVP |
| `chat.params` | Model switching (think mode) | Post-MVP |
| `chat.message` | Message interception | Post-MVP |
| `permission.ask` | Custom permission logic | Post-MVP |
| `config` | Dynamic configuration | Post-MVP |

#### 3.5.1 Hook Fallback Strategy

Since MVP relies on experimental hooks, fallback strategies are required:

| Hook | Fallback Behavior |
|------|-------------------|
| `experimental.chat.system.transform` | Inject rules via AGENTS.md only (no dynamic injection) |
| `experimental.session.compacting` | Log warning; allow default compaction behavior |

**Hook Detection Logic:**

```typescript
async function detectHooks(): Promise<HookAvailability> {
  return {
    systemTransform: await probeHook('experimental.chat.system.transform'),
    compacting: await probeHook('experimental.session.compacting'),
  };
}

function applyFallbacks(availability: HookAvailability): void {
  if (!availability.systemTransform) {
    logger.warn('System transform hook unavailable; using static AGENTS.md rules');
  }
  if (!availability.compacting) {
    logger.warn('Compaction hook unavailable; state persistence may be limited');
  }
}
```

**Monitoring:**
- Subscribe to OpenCode release notes and changelog
- Flag breaking changes in experimental APIs during weekly review

---

## 4. Component Migration Map

### 4.1 Full Migration Matrix

| Atreides Component | Source Location | OpenCode Target | Migration Approach | Priority |
|-------------------|-----------------|-----------------|-------------------|----------|
| **CLI - install** | `src/lib/commands/install.js` | N/A (npm handles) | Eliminated | - |
| **CLI - init** | `src/lib/commands/init.js` | `src/cli/init.ts` | Rewrite with wizard | MVP |
| **CLI - update** | `src/lib/commands/update.js` | `src/cli/update.ts` | Simplify (npm + file sync) | MVP |
| **CLI - doctor** | `src/lib/commands/doctor.js` | `src/cli/doctor.ts` | Port diagnostics | MVP |
| **CLI - uninstall** | `src/lib/commands/uninstall.js` | `src/cli/uninstall.ts` | Simple cleanup | Post-MVP |
| **Template Engine** | `src/lib/template-engine.js` | N/A | Eliminated (direct files) | - |
| **Handlebars Helpers** | `src/lib/handlebars-helpers.js` | N/A | Eliminated | - |
| **Settings Merge** | `src/lib/settings-merge.js` | `src/lib/config-merge.ts` | Adapt for opencode.json | MVP |
| **File Manager** | `src/lib/file-manager.js` | `src/lib/file-manager.ts` | Port with async/await | MVP |
| **Project Init** | `src/lib/project-init.js` | `src/cli/init.ts` | Merge into wizard | MVP |
| **CLAUDE.md.hbs** | `templates/CLAUDE.md.hbs` | `AGENTS.md` + plugin hooks | Split | MVP |
| **settings.json.hbs** | `templates/settings.json.hbs` | `opencode.json` | Direct config | MVP |
| **agent-definitions.hbs** | `templates/partials/agent-definitions.hbs` | `.opencode/agent/*.md` | 7 separate files | MVP |
| **workflow-phases.hbs** | `templates/partials/workflow-phases.hbs` | Plugin + AGENTS.md | Split | MVP |
| **context-management.hbs** | `templates/partials/context-management.hbs` | Plugin compaction hook | Hook implementation | MVP |
| **error-recovery.hbs** | `templates/partials/error-recovery.hbs` | Plugin + AGENTS.md | Split | MVP |
| **validate-bash-command.sh** | `scripts/validate-bash-command.sh` | `src/hooks/tool-interceptor.ts` | TypeScript rewrite | MVP |
| **pre-edit-check.sh** | `scripts/pre-edit-check.sh` | `src/hooks/tool-interceptor.ts` | TypeScript rewrite | MVP |
| **post-edit-log.sh** | `scripts/post-edit-log.sh` | `src/hooks/tool-interceptor.ts` | TypeScript rewrite | MVP |
| **error-detector.sh** | `scripts/error-detector.sh` | `src/hooks/error-recovery.ts` | TypeScript rewrite | MVP |
| **notify-idle.sh** | `scripts/notify-idle.sh` | `src/hooks/session-notification.ts` | TypeScript rewrite | Post-MVP |
| **orchestrate.md** | `skills/muaddib/orchestrate.md` | `.opencode/skill/orchestrate/SKILL.md` | Direct port | MVP |
| **explore.md** | `skills/muaddib/explore.md` | `.opencode/skill/explore/SKILL.md` | Direct port | MVP |
| **validate.md** | `skills/muaddib/validate.md` | `.opencode/skill/validate/SKILL.md` | Direct port | MVP |
| **lsp.md** | `skills/muaddib/lsp.md` | `.opencode/skill/lsp/SKILL.md` | Direct port | Post-MVP |
| **refactor.md** | `skills/muaddib/refactor.md` | `.opencode/skill/refactor/SKILL.md` | Direct port | Post-MVP |
| **checkpoint.md** | `skills/muaddib/checkpoint.md` | `.opencode/skill/checkpoint/SKILL.md` | Direct port | Post-MVP |
| **tdd.md** | `skills/muaddib/tdd.md` | `.opencode/skill/tdd/SKILL.md` | Direct port | Post-MVP |
| **parallel-explore.md** | `skills/muaddib/parallel-explore.md` | `.opencode/skill/parallel-explore/SKILL.md` | Direct port | Post-MVP |
| **incremental-refactor.md** | `skills/muaddib/incremental-refactor.md` | `.opencode/skill/incremental-refactor/SKILL.md` | Direct port | Post-MVP |
| **doc-sync.md** | `skills/muaddib/doc-sync.md` | `.opencode/skill/doc-sync/SKILL.md` | Direct port | Post-MVP |
| **quality-gate.md** | `skills/muaddib/quality-gate.md` | `.opencode/skill/quality-gate/SKILL.md` | Direct port | Post-MVP |
| **Wrapper Script** | `/usr/local/bin/atreides` | N/A | Eliminated | - |
| **Dual Environment** | Profile switching | N/A | Eliminated (agents handle) | - |

### 4.2 Agent Definition Migration

| Atreides Agent | OpenCode File | Model Default | Tool Restrictions | Mode | Display Name |
|---------------|---------------|---------------|-------------------|------|--------------|
| Oracle | `.opencode/agent/oracle.md` | `anthropic/claude-sonnet-4` | Read-only (no write/edit) | subagent | Oracle |
| Explore | `.opencode/agent/explore.md` | `anthropic/claude-haiku-4-5` | Read + grep + glob only | subagent | Explore agent |
| Librarian | `.opencode/agent/librarian.md` | `anthropic/claude-haiku-4-5` | Read + web tools | subagent | Librarian |
| Frontend-UI-UX | `.opencode/agent/frontend-ui-ux.md` | `anthropic/claude-sonnet-4` | Full access | subagent | Frontend Architect |
| Document-Writer | `.opencode/agent/document-writer.md` | `anthropic/claude-sonnet-4` | Write markdown only | subagent | Documentation Writer |
| General | `.opencode/agent/general.md` | `anthropic/claude-sonnet-4` | Full access | subagent | Research agent |
| Build | `.opencode/agent/build.md` | (inherit global) | Full access | primary | Build agent |
| Plan | `.opencode/agent/plan.md` | (inherit global) | Read-only | primary | Plan agent |

### 4.3 Skill Migration Map (12 Skills)

| Skill | OpenCode File | Context Type | Model | Priority | Description |
|-------|---------------|--------------|-------|----------|-------------|
| **SKILL.md** | `.opencode/skill/base/SKILL.md` | main | opus | MVP | Base skill definition |
| **orchestrate** | `.opencode/skill/orchestrate/SKILL.md` | main | opus | MVP | Main workflow coordinator |
| **explore** | `.opencode/skill/explore/SKILL.md` | fork | sonnet | MVP | Isolated codebase exploration |
| **validate** | `.opencode/skill/validate/SKILL.md` | main | sonnet | MVP | Quality gate execution |
| **lsp** | `.opencode/skill/lsp/SKILL.md` | fork | sonnet | Post-MVP | Semantic code operations |
| **refactor** | `.opencode/skill/refactor/SKILL.md` | fork | opus | Post-MVP | AST-grep transformations |
| **checkpoint** | `.opencode/skill/checkpoint/SKILL.md` | main | haiku | Post-MVP | State management |
| **tdd** | `.opencode/skill/tdd/SKILL.md` | fork | sonnet | Post-MVP | Test-driven development |
| **parallel-explore** | `.opencode/skill/parallel-explore/SKILL.md` | fork | sonnet | Post-MVP | Multi-agent exploration |
| **incremental-refactor** | `.opencode/skill/incremental-refactor/SKILL.md` | fork | opus | Post-MVP | Safe refactoring |
| **doc-sync** | `.opencode/skill/doc-sync/SKILL.md` | main | sonnet | Post-MVP | Documentation sync |
| **quality-gate** | `.opencode/skill/quality-gate/SKILL.md` | main | sonnet | Post-MVP | Comprehensive validation |

**Context Types Explained**:
- **main**: Operates in primary session context, can modify session state directly
- **fork**: Operates in isolated context (forked), returns summary only - prevents context bloat

---

## 5. MVP Scope

### 5.1 MVP Definition

**Goal**: Deliver a functional Atreides experience on OpenCode that covers the core workflow, essential agents, and key protections.

**Timeline**: 6 weeks

### 5.2 MVP Features

#### Core Plugin (Must Have)

- [ ] **Session Management**
  - Session state initialization on `session.created`
  - State cleanup on `session.deleted`
  - State persistence across messages

- [ ] **Workflow Engine**
  - Phase tracking (Intent → Assessment → Exploration → Implementation → Verification)
  - Intent classification logic
  - Phase transition rules

- [ ] **Error Recovery**
  - Failure counter per session
  - 3-strikes protocol
  - Stop hook enforcement
  - Escalation to Oracle

- [ ] **Tool Interception**
  - Bash command validation (dangerous patterns)
  - **Command obfuscation detection** (URL decode, hex, octal, quote splitting)
  - File operation guards (.env, secrets)
  - Edit/write logging
  - Git operation tracking
  - **Safe recovery commands** (use `git restore` instead of `git checkout`)

- [ ] **Security Hardening**
  - **Obfuscation detection pipeline** (see Appendix E)
  - **22 error patterns detection** (see Appendix E)
  - **Log sanitization** (control char removal, 500 char limit)
  - **Blocked file patterns** (credentials, keys, secrets)

- [ ] **System Prompt Injection**
  - Core orchestration rules
  - Workflow phase instructions
  - Agent delegation guidelines

- [ ] **Identity System**
  - **Configurable persona name** (default: "Muad'Dib")
  - **Response prefix formatting** (`[{personaName}]:`)
  - **Delegation announcements** (before/after delegation)

- [ ] **Compaction Handler**
  - State serialization
  - Critical context preservation
  - Todo status persistence

- [ ] **Todo Enforcement**
  - Track todo creation
  - Enforce completion before stop
  - Multi-step task detection

- [ ] **Init Modes**
  - **Minimal mode**: AGENTS.md only
  - **Standard mode**: Full config, no agent delegation
  - **Full mode**: Everything including agent delegation

- [ ] **Project Detection**
  - **Automatic language detection** (package.json → node, tsconfig → typescript, etc.)
  - **Language-specific permission presets**
  - **Language-specific formatters** (prettier, black, gofmt, rustfmt)

#### Agents (Must Have)

- [ ] **Oracle** - Architecture decisions, complex debugging
- [ ] **Explore** - Fast codebase exploration
- [ ] **Librarian** - Documentation and OSS research
- [ ] **Build** - Default full-access agent
- [ ] **Plan** - Read-only planning mode

#### Skills (Must Have - 4 MVP Skills)

- [ ] **base** - Core skill definition (SKILL.md)
- [ ] **orchestrate** - Main workflow coordinator
- [ ] **explore** - Parallel exploration patterns (fork context)
- [ ] **validate** - Quality gate execution

#### CLI (Must Have)

- [ ] **init** - Interactive onboarding wizard
- [ ] **doctor** - Installation verification
- [ ] **update** - Version updates

#### Configuration (Must Have)

- [ ] **opencode.json** - Permissions, plugin config
- [ ] **AGENTS.md** - User-customizable rules
- [ ] **Agent model selection** - Onboarding wizard

#### Backward Compatibility (Must Have)

- [ ] **CLAUDE.md reader** - Import existing rules
- [ ] **settings.json migration** - Convert permissions

### 5.3 MVP Exclusions (Post-MVP)

- Remaining 3 agents (Frontend-UI-UX, Document-Writer, General)
- Remaining 8 skills (lsp, refactor, checkpoint, tdd, parallel-explore, incremental-refactor, doc-sync, quality-gate)
- Maturity scoring system (0-13 points)
- Checkpoint system with full template
- Backup rotation (maxBackups, maxAgeDays)
- Session logging (`~/.atreides/logs/`, `~/.atreides/state/`)
- Session notifications
- Think mode (model switching)
- Chat message interception
- Custom permission logic
- Dynamic configuration
- Uninstall command
- Advanced metrics/logging

---

## 6. Post-MVP Features

### 6.1 Phase 2: Extended Agents & Skills (Weeks 7-9)

- [ ] **Frontend-UI-UX Agent** - Visual/styling delegation
- [ ] **Document-Writer Agent** - Documentation generation
- [ ] **General Agent** - Multi-purpose subagent
- [ ] **lsp Skill** - Semantic code operations (fork context)
- [ ] **refactor Skill** - AST-grep transformations (fork context)
- [ ] **checkpoint Skill** - State management

### 6.2 Phase 3: Advanced Workflows (Weeks 10-12)

- [ ] **tdd Skill** - Test-driven development workflow (fork context)
- [ ] **parallel-explore Skill** - Multi-agent exploration (fork context)
- [ ] **incremental-refactor Skill** - Safe refactoring (fork context)
- [ ] **doc-sync Skill** - Documentation synchronization
- [ ] **quality-gate Skill** - Comprehensive validation

### 6.3 Phase 4: Enhanced UX (Weeks 13-15)

- [ ] **Session Notifications** - Cross-platform alerts
- [ ] **Think Mode** - Automatic model upgrade on complexity
- [ ] **Context Window Monitor** - Usage tracking and warnings
- [ ] **Uninstall Command** - Clean removal
- [ ] **Migration Wizard** - Bulk project conversion

### 6.4 Phase 5: Advanced Features (Weeks 16-18)

- [ ] **Maturity Scoring System** - 0-13 point codebase assessment
  - Test Coverage: High(+3) / Medium(+2) / Low(+1) / None(0)
  - Code Consistency: Very consistent(+3) / Mostly(+2) / Mixed(+1) / Inconsistent(0)
  - Documentation: Comprehensive(+3) / Partial(+2) / Minimal(+1) / None(0)
  - CI/CD: Full pipeline(+2) / Basic CI(+1) / None(0)
  - Type Safety: Strict types(+2) / Partial(+1) / No types(0)
  - Level: 10-13 → DISCIPLINED, 6-9 → TRANSITIONAL, 3-5 → LEGACY, 0-2 → GREENFIELD

- [ ] **Checkpoint System**
  - Full checkpoint.md template
  - Backup rotation (maxBackups, maxAgeDays settings)
  - Checkpoint recovery on idle/timeout

- [ ] **Session Logging Infrastructure**
  - `~/.atreides/logs/edits.log` - Edit history
  - `~/.atreides/logs/sessions.log` - Session history
  - `~/.atreides/state/` - Persistent state
  - Log rotation (keep last 1000 lines)

- [ ] **Agent Display Names** - User-friendly delegation announcements
- [ ] **Language-Specific Formatters** - PostToolUse auto-formatting

### 6.5 Phase 6: Enterprise Features (Weeks 19+)

- [ ] **Custom Permission Logic** - Programmatic permission handling
- [ ] **Dynamic Configuration** - Runtime config changes
- [ ] **Metrics Dashboard** - Usage analytics
- [ ] **Plugin Marketplace Integration** - Easy discovery
- [ ] **Team/Enterprise Features** - Shared configurations

---

## 7. Detailed Phase Breakdown

### Phase 1: Foundation (Weeks 1-2)

#### Week 1: Project Setup & Core Plugin

| Task | Description | Estimate | Deliverable |
|------|-------------|----------|-------------|
| 1.1 | Initialize npm package structure | 2h | `package.json`, `tsconfig.json`, directory structure |
| 1.2 | Set up build pipeline (Bun) | 2h | Working `bun build` command |
| 1.3 | Create plugin entry point | 4h | `src/plugin/index.ts` with Plugin type |
| 1.4 | Implement SessionManager | 8h | Session state Map, lifecycle hooks |
| 1.5 | Implement basic tool interceptor | 8h | `tool.execute.before/after` stubs |
| 1.6 | Set up test framework | 4h | Bun test configuration, first test |
| 1.7 | Create development workflow | 4h | Hot reload, local testing setup |

**Week 1 Deliverable**: Loadable plugin that tracks sessions and intercepts tools.

#### Week 2: CLI Foundation & Onboarding

| Task | Description | Estimate | Deliverable |
|------|-------------|----------|-------------|
| 2.1 | CLI framework setup (Commander.js) | 4h | `bin/atreides.js`, command structure |
| 2.2 | `init` command - basic flow | 8h | Project detection, file generation |
| 2.3 | Onboarding wizard - prompts | 8h | Agent selection, model configuration |
| 2.4 | Generate `.opencode/` structure | 8h | Plugin, agents, opencode.json |
| 2.5 | `doctor` command - basic checks | 4h | Installation verification |

**Week 2 Deliverable**: `npx atreides init` creates working OpenCode project.

### Phase 2: Core Features (Weeks 3-4)

#### Week 3: Workflow Engine, Error Recovery & Security Hardening

| Task | Description | Estimate | Deliverable |
|------|-------------|----------|-------------|
| 3.1 | Implement WorkflowEngine | 12h | Phase tracking, transitions |
| 3.2 | Intent classification logic | 8h | Request type detection |
| 3.3 | Implement ErrorRecovery | 8h | 3-strikes, failure tracking |
| 3.4 | Stop hook enforcement | 4h | Block stop on pending work |
| 3.5 | **Security: Obfuscation detection** | 6h | URL decode, hex, octal, quote strip |
| 3.6 | **Security: Blocked patterns** | 4h | Dangerous command patterns |
| 3.7 | Integration tests | 8h | Workflow + error recovery + security tests |

**Week 3 Deliverable**: Complete workflow enforcement with error recovery and security hardening.

#### Week 4: System Prompt, Compaction & Identity

| Task | Description | Estimate | Deliverable |
|------|-------------|----------|-------------|
| 4.1 | System prompt injection | 8h | `experimental.chat.system.transform` |
| 4.2 | Extract rules from CLAUDE.md.hbs | 8h | AGENTS.md content |
| 4.3 | Compaction handler | 8h | `experimental.session.compacting` |
| 4.4 | Todo enforcement | 6h | Creation tracking, completion checks |
| 4.5 | CLAUDE.md backward compat | 4h | Read and merge existing rules |
| 4.6 | **Identity system** | 4h | Persona name, response prefix, delegation announcements |
| 4.7 | **Project type detection** | 4h | Auto-detect language, generate appropriate config |

**Week 4 Deliverable**: Full runtime orchestration with context preservation and identity system.

### Phase 3: Agents & Skills (Weeks 5-6)

#### Week 5: Agent Definitions

| Task | Description | Estimate | Deliverable |
|------|-------------|----------|-------------|
| 5.1 | Port Oracle agent definition | 4h | `.opencode/agent/oracle.md` |
| 5.2 | Port Explore agent definition | 4h | `.opencode/agent/explore.md` |
| 5.3 | Port Librarian agent definition | 4h | `.opencode/agent/librarian.md` |
| 5.4 | Port Build agent definition | 4h | `.opencode/agent/build.md` |
| 5.5 | Port Plan agent definition | 4h | `.opencode/agent/plan.md` |
| 5.6 | Agent model configuration | 8h | Wizard integration, defaults |
| 5.7 | Agent permission mapping | 8h | Tool restrictions per agent |

**Week 5 Deliverable**: 5 MVP agents with configurable models.

#### Week 6: Skills, CLI & Polish

| Task | Description | Estimate | Deliverable |
|------|-------------|----------|-------------|
| 6.1 | Port base skill (SKILL.md) | 2h | `.opencode/skill/base/SKILL.md` |
| 6.2 | Port orchestrate skill | 6h | `.opencode/skill/orchestrate/SKILL.md` |
| 6.3 | Port explore skill | 4h | `.opencode/skill/explore/SKILL.md` |
| 6.4 | Port validate skill | 4h | `.opencode/skill/validate/SKILL.md` |
| 6.5 | `update` command | 6h | Version checking, file sync |
| 6.6 | End-to-end testing | 8h | Full workflow tests |
| 6.7 | Security test suite | 6h | Path traversal, injection, DoS tests |
| 6.8 | Documentation | 6h | README, migration guide |
| **6.9** | **Performance benchmarks** | 4h | Plugin load, hook overhead measurement |

**Week 6 Deliverable**: MVP complete - ready for beta testing.

#### 6.9 Performance Validation (Week 6)

| Metric | Target | Tool |
|--------|--------|------|
| Plugin load time | <100ms | `performance.now()` in test harness |
| Hook overhead (per call) | <10ms | Benchmark suite with 1000 iterations |
| CLI init time | <2s | End-to-end timing |
| Doctor command | <1s | End-to-end timing |

**Baseline Environment:**
- Node.js 20 LTS / Bun 1.x
- macOS 14+ / Ubuntu 22.04
- SSD storage
- 8GB RAM minimum

**Measurement Execution:**
- Run benchmarks in Week 6 after core features stabilize
- Document baseline numbers in test output
- Fail CI if targets exceeded by >20%

### 7.4 Phase Acceptance Criteria

#### Phase 1: Foundation (Weeks 1-2)

| Criterion | Validation |
|-----------|------------|
| Plugin loads without error | `bun test plugin/load.test.ts` |
| Session state initializes | Integration test: session.created event |
| Tool interceptor registers | Hook registration logged |
| CLI framework operational | `npx atreides --help` returns 0 |
| Init wizard completes | E2E test: full wizard flow |

**Documentation Deliverable**: README draft

#### Phase 2: Core Features (Weeks 3-4)

| Criterion | Validation |
|-----------|------------|
| Workflow engine tracks phases | Unit tests for phase transitions |
| Error recovery triggers at 3 strikes | Integration test: failure sequence |
| Security pipeline blocks dangerous commands | 56 security tests pass |
| System prompt injection works | Hook output verified |
| Identity system operational | Response prefix in output |

**Documentation Deliverable**: Configuration reference draft

#### Phase 3: Agents & Skills (Weeks 5-6)

| Criterion | Validation |
|-----------|------------|
| 5 MVP agents defined and callable | Agent invocation tests |
| 4 MVP skills operational | Skill loading tests |
| Update command works | Version check + file sync test |
| Full E2E workflow passes | Complete session test |
| Performance targets met | Benchmark suite passes |

**Documentation Deliverables**: README final, Migration guide, Config reference final

---

## 8. Package Structure

### 8.1 npm Package Layout

```
atreides-opencode/
├── package.json
├── tsconfig.json
├── bunfig.toml
├── README.md
├── LICENSE
├── CHANGELOG.md
│
├── bin/
│   └── atreides.js                 # CLI entry point
│
├── src/
│   ├── index.ts                    # Package exports
│   │
│   ├── plugin/
│   │   ├── index.ts                # Plugin entry point
│   │   ├── types.ts                # Type definitions
│   │   │
│   │   ├── managers/
│   │   │   ├── session-manager.ts  # Session state management
│   │   │   ├── workflow-engine.ts  # Phase tracking & transitions
│   │   │   └── error-recovery.ts   # 3-strikes protocol
│   │   │
│   │   ├── hooks/
│   │   │   ├── tool-interceptor.ts # tool.execute.before/after
│   │   │   ├── system-prompt.ts    # chat.system.transform
│   │   │   ├── compaction.ts       # session.compacting
│   │   │   ├── stop-handler.ts     # stop hook
│   │   │   └── event-handler.ts    # Generic event handling
│   │   │
│   │   ├── rules/
│   │   │   ├── workflow-phases.ts  # Phase definitions
│   │   │   ├── intent-classification.ts
│   │   │   ├── delegation-rules.ts # Agent delegation logic
│   │   │   └── quality-gates.ts    # Verification rules
│   │   │
│   │   └── compat/
│   │       ├── claude-md-reader.ts # CLAUDE.md parsing
│   │       └── settings-migrator.ts # settings.json conversion
│   │
│   ├── cli/
│   │   ├── index.ts                # CLI setup
│   │   ├── init.ts                 # init command
│   │   ├── doctor.ts               # doctor command
│   │   ├── update.ts               # update command
│   │   └── wizard/
│   │       ├── prompts.ts          # Inquirer prompts
│   │       ├── agent-selector.ts   # Agent configuration
│   │       └── model-selector.ts   # Model selection
│   │
│   ├── generators/
│   │   ├── index.ts                # Generator orchestration
│   │   ├── opencode-json.ts        # opencode.json generation
│   │   ├── agents-md.ts            # AGENTS.md generation
│   │   ├── agent-files.ts          # .opencode/agent/*.md
│   │   ├── skill-files.ts          # .opencode/skill/*/SKILL.md
│   │   └── plugin-file.ts          # .opencode/plugin/atreides.ts
│   │
│   └── lib/
│       ├── config.ts               # Configuration utilities
│       ├── file-manager.ts         # File operations
│       ├── logger.ts               # Structured logging
│       └── constants.ts            # Shared constants
│
├── templates/
│   ├── agents/
│   │   ├── oracle.md
│   │   ├── explore.md
│   │   ├── librarian.md
│   │   ├── build.md
│   │   ├── plan.md
│   │   ├── frontend-ui-ux.md       # Post-MVP
│   │   ├── document-writer.md      # Post-MVP
│   │   └── general.md              # Post-MVP
│   │
│   ├── skills/
│   │   ├── orchestrate/
│   │   │   └── SKILL.md
│   │   ├── explore/
│   │   │   └── SKILL.md
│   │   ├── validate/
│   │   │   └── SKILL.md
│   │   └── ... (8 more post-MVP)
│   │
│   ├── AGENTS.md.template          # Base rules template
│   ├── opencode.json.template      # Base config template
│   └── plugin.ts.template          # Local plugin template
│
├── test/
│   ├── plugin/
│   │   ├── session-manager.test.ts
│   │   ├── workflow-engine.test.ts
│   │   ├── error-recovery.test.ts
│   │   └── tool-interceptor.test.ts
│   │
│   ├── cli/
│   │   ├── init.test.ts
│   │   └── doctor.test.ts
│   │
│   └── integration/
│       └── full-workflow.test.ts
│
└── docs/
    ├── MIGRATION.md                # Migration guide from Atreides
    ├── CONFIGURATION.md            # Configuration reference
    ├── AGENTS.md                   # Agent customization guide
    └── SKILLS.md                   # Skill development guide
```

### 8.2 Generated Project Structure

After running `npx atreides init`:

```
project-root/
├── AGENTS.md                       # User-customizable rules
├── opencode.json                   # OpenCode configuration
│
└── .opencode/
    ├── package.json                # Plugin dependencies
    │
    ├── plugin/
    │   └── atreides.ts             # Local plugin (thin wrapper)
    │
    ├── agent/
    │   ├── oracle.md
    │   ├── explore.md
    │   ├── librarian.md
    │   ├── build.md
    │   └── plan.md
    │
    ├── skill/
    │   ├── orchestrate/
    │   │   └── SKILL.md
    │   ├── explore/
    │   │   └── SKILL.md
    │   └── validate/
    │       └── SKILL.md
    │
    └── command/                    # Optional custom commands
        └── .gitkeep
```

---

## 9. Onboarding Flow Design

### 9.1 Wizard Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    npx atreides init                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 1: Project Detection                                       │
│  ─────────────────────────────────────────────────────────────  │
│  Detected: TypeScript/React project                              │
│  Language: typescript (from tsconfig.json)                       │
│  Existing: CLAUDE.md found (will import rules)                   │
│                                                                  │
│  [Continue] [Cancel]                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 2: Installation Mode                                       │
│  ─────────────────────────────────────────────────────────────  │
│  Choose installation mode:                                       │
│                                                                  │
│  ( ) Minimal  - AGENTS.md only (for existing projects)           │
│  (x) Standard - Full config, no agent delegation                 │
│  ( ) Full     - Everything including agent delegation            │
│                                                                  │
│  [Continue]                                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 3: Persona Configuration                                   │
│  ─────────────────────────────────────────────────────────────  │
│  Configure your AI assistant's identity:                         │
│                                                                  │
│  Persona Name: [Muad'Dib____________]                            │
│                                                                  │
│  Response Prefix: [Muad'Dib]: (auto-generated)                   │
│                                                                  │
│  [Use Default] [Continue]                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 4: Agent Selection                                         │
│  ─────────────────────────────────────────────────────────────  │
│  Select agents to enable:                                        │
│                                                                  │
│  [x] Oracle     - Architecture decisions, complex debugging      │
│  [x] Explore    - Fast codebase exploration                      │
│  [x] Librarian  - Documentation and OSS research                 │
│  [ ] Frontend   - UI/UX specialized development                  │
│  [ ] DocWriter  - Documentation generation                       │
│                                                                  │
│  [Select All] [Continue]                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 5: Model Configuration                                     │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  Oracle Agent:                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ anthropic/claude-sonnet-4          (recommended)     ▼ │    │
│  │ anthropic/claude-sonnet-4                              │    │
│  │ anthropic/claude-opus-4                                │    │
│  │ openai/gpt-4.1                                         │    │
│  │ (use global default)                                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Explore Agent:                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ anthropic/claude-haiku-4-5         (recommended)     ▼ │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  [Use All Defaults] [Continue]                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 6: Permission Preset                                       │
│  ─────────────────────────────────────────────────────────────  │
│  Choose permission level:                                        │
│                                                                  │
│  ( ) Strict   - Ask for most operations                          │
│  (x) Balanced - Allow safe operations, ask for risky ones        │
│  ( ) Relaxed  - Allow most operations, deny dangerous ones       │
│                                                                  │
│  [Continue]                                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 7: Skills Selection                                        │
│  ─────────────────────────────────────────────────────────────  │
│  Select skills to include:                                       │
│                                                                  │
│  [x] base             - Core skill definition                    │
│  [x] orchestrate      - Main workflow coordinator                │
│  [x] explore          - Parallel exploration patterns (fork)     │
│  [x] validate         - Quality gate execution                   │
│  [ ] lsp              - Semantic code operations (fork)          │
│  [ ] refactor         - AST-based transformations (fork)         │
│  [ ] tdd              - Test-driven development (fork)           │
│                                                                  │
│  [Continue]                                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 8: Confirmation                                            │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  Installation Mode: standard                                     │
│  Persona Name: Muad'Dib                                          │
│  Language: typescript (auto-detected)                            │
│                                                                  │
│  Will create:                                                    │
│    ✓ AGENTS.md                                                   │
│    ✓ opencode.json (with typescript permissions)                 │
│    ✓ .opencode/plugin/atreides.ts                                │
│    ✓ .opencode/agent/ (3 agents)                                 │
│    ✓ .opencode/skill/ (4 skills)                                 │
│                                                                  │
│  Will import:                                                    │
│    ✓ Rules from existing CLAUDE.md                               │
│                                                                  │
│  [Generate Files] [Back]                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  ✅ Atreides initialized successfully!                           │
│                                                                  │
│  Created:                                                        │
│    • AGENTS.md                                                   │
│    • opencode.json                                               │
│    • .opencode/plugin/atreides.ts                                │
│    • .opencode/agent/oracle.md                                   │
│    • .opencode/agent/explore.md                                  │
│    • .opencode/agent/librarian.md                                │
│    • .opencode/skill/orchestrate/SKILL.md                        │
│    • .opencode/skill/explore/SKILL.md                            │
│    • .opencode/skill/validate/SKILL.md                           │
│    • .opencode/skill/base/SKILL.md                               │
│                                                                  │
│  Next steps:                                                     │
│    1. Review AGENTS.md and customize rules                       │
│    2. Run 'opencode' to start coding with Atreides               │
│    3. Run 'npx atreides doctor' to verify installation           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 CLI Flags for Non-Interactive Mode

```bash
# Full interactive wizard
npx atreides init

# Quick setup with defaults
npx atreides init --defaults

# Specify installation mode
npx atreides init --mode minimal
npx atreides init --mode standard
npx atreides init --mode full

# Specify options via flags
npx atreides init \
  --mode standard \
  --persona "Muad'Dib" \
  --agents oracle,explore,librarian \
  --skills base,orchestrate,explore,validate \
  --permission-level balanced \
  --import-claude-md

# Skip specific prompts
npx atreides init --skip-agents --skip-models --skip-persona
```

### 9.3 Init Mode File Generation

| File | Mode: minimal | Mode: standard | Mode: full |
|------|---------------|----------------|------------|
| AGENTS.md | ✓ | ✓ | ✓ |
| opencode.json | ✗ | ✓ | ✓ |
| .opencode/plugin/atreides.ts | ✗ | ✓ | ✓ |
| .opencode/agent/*.md | ✗ | ✓ | ✓ |
| .opencode/skill/*/SKILL.md | ✗ | ✗ | ✓ |
| Language-specific permissions | ✗ | ✓ | ✓ |

### 9.4 Project Type Detection

| Detection File | Language | Permission Patterns |
|----------------|----------|---------------------|
| `package.json` | node | `npm *`, `npx *`, `node *` |
| `tsconfig.json` | typescript | `npm *`, `npx *`, `tsc *` |
| `pyproject.toml` / `setup.py` | python | `python *`, `pip *`, `pytest *` |
| `go.mod` | go | `go *` |
| `Cargo.toml` | rust | `cargo *` |

### 9.5 Doctor Command Output

```
┌─────────────────────────────────────────────────────────────────┐
│                    npx atreides doctor                           │
└─────────────────────────────────────────────────────────────────┘

Atreides OpenCode Health Check
══════════════════════════════

Installation
  ✓ atreides-opencode package installed (v1.0.0)
  ✓ OpenCode detected (v1.2.3)
  ✓ Bun runtime available (v1.1.45)

Project Files
  ✓ AGENTS.md exists
  ✓ opencode.json exists and valid
  ✓ .opencode/plugin/atreides.ts exists

Agents (3 configured)
  ✓ oracle.md - valid frontmatter
  ✓ explore.md - valid frontmatter
  ✓ librarian.md - valid frontmatter

Skills (3 configured)
  ✓ orchestrate/SKILL.md - valid
  ✓ explore/SKILL.md - valid
  ✓ validate/SKILL.md - valid

Plugin Integration
  ✓ Plugin loads without errors
  ✓ Hooks registered: 6
  ✓ No conflicts with other plugins

Backward Compatibility
  ✓ CLAUDE.md detected - rules imported
  ⚠ .claude/settings.json found - run 'npx atreides migrate' to convert

══════════════════════════════
Result: 15 checks passed, 1 warning

Recommendations:
  1. Run 'npx atreides migrate' to convert legacy settings
```

### 9.6 CLI Operational Runbook

#### 9.6.1 Doctor Remediation Playbook

| Warning/Error | Cause | Remediation |
|---------------|-------|-------------|
| `Plugin not found` | Missing .opencode/plugin/atreides.ts | Run `npx atreides init` |
| `AGENTS.md missing` | File deleted or not generated | Run `npx atreides init --force` |
| `Outdated version` | npm package newer than local | Run `npx atreides update` |
| `Hook registration failed` | OpenCode version mismatch | Check OpenCode version compatibility |
| `CLAUDE.md detected` | Legacy file present | Run `npx atreides migrate` |
| `settings.json found` | Legacy config present | Run `npx atreides migrate` |

#### 9.6.2 Migration Troubleshooting

| Failure Mode | Cause | Recovery |
|--------------|-------|----------|
| Merge conflict | Both CLAUDE.md and AGENTS.md have conflicting rules | Manually resolve; AGENTS.md takes precedence |
| Permission denied | File system permissions | Check write access to project root |
| Partial migration | Interrupted process | Re-run `npx atreides migrate --force` |
| Invalid settings.json | Malformed JSON | Fix JSON syntax; re-run migrate |

---

## 10. Risk Assessment

### 10.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| OpenCode API changes | Medium | High | Pin to stable API versions; abstract hook interfaces |
| Experimental hooks removed | Medium | High | Fallback implementations; feature flags |
| Performance overhead | Low | Medium | Lazy loading; efficient state management |
| Bun compatibility issues | Low | Medium | Test on multiple Bun versions; Node.js fallback |
| Complex state serialization | Medium | Medium | Use simple JSON; avoid circular refs |

### 10.2 Product Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Adoption resistance | Medium | High | Clear migration path; import existing CLAUDE.md |
| Feature parity gaps | Medium | Medium | Prioritize core features; clear MVP scope |
| Learning curve | Medium | Medium | Comprehensive docs; wizard-based onboarding |
| Competing solutions | Low | Medium | Differentiate on systematic workflows |

### 10.3 Project Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Scope creep | High | High | Strict MVP definition; phase gates |
| Timeline slip | Medium | Medium | Buffer time; prioritize ruthlessly |
| Dependency on Atreides source | Low | Low | Document all source references |

---

## 11. Success Criteria

### 11.1 MVP Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Functional** | | |
| Core workflow operational | 100% | All 4 phases execute correctly |
| Agent delegation works | 100% | 5 MVP agents callable |
| Error recovery triggers | 100% | 3-strikes protocol fires |
| Todo enforcement | 100% | Stop blocked on pending todos |
| Identity system works | 100% | Response prefixes, delegation announcements |
| Security hardening | 100% | Obfuscation detection, blocked patterns |
| **Quality** | | |
| Test coverage | >80% | bun test --coverage |
| **Security tests** | **Match Atreides (466 tests)** | Path traversal, injection, DoS, prototype pollution |
| No critical bugs | 0 | GitHub issues labeled 'critical' |
| TypeScript strict | 100% | No `any` types |
| **Usability** | | |
| Init wizard completion | >90% | Analytics on wizard steps |
| Doctor passes | 100% | Clean bill of health |
| Migration success | >90% | Existing projects convert |
| **Performance** | | |
| Plugin load time | <100ms | Startup benchmark |
| Hook overhead | <10ms | Per-hook benchmark |

### 11.2 Security-to-Test Traceability

#### 11.2.1 Security Control → Test Mapping

| Security Control | Test Category | Min Tests |
|------------------|---------------|-----------|
| URL decode obfuscation | Command injection | 5 |
| Hex escape detection | Command injection | 5 |
| Octal escape detection | Command injection | 3 |
| Quote stripping | Command injection | 3 |
| Blocked patterns (rm -rf, fork bomb, etc.) | Destructive commands | 10 |
| File guards (.env, secrets, keys) | Path traversal | 15 |
| Log sanitization | Log injection | 5 |
| Error pattern detection | Error recovery | 10 |
| **Total** | | **56** |

#### 11.2.2 466-Test Parity Breakdown

| Category | Target | Priority |
|----------|--------|----------|
| Security | 60 | Critical |
| CLI commands | 50 | High |
| File operations | 120 | High |
| Hook handling | 60 | High |
| Template/generation | 80 | Medium |
| Settings merge | 45 | Medium |
| Workflow engine | 25 | Medium |
| Integration/E2E | 26 | Medium |
| **Total** | **466** | |

#### 11.2.3 Security Validation Checklist

Before MVP release:
- [ ] Obfuscation decoding tested (URL, hex, octal, quote)
- [ ] All blocked patterns have corresponding tests
- [ ] File guards tested for each blocked pattern
- [ ] Error patterns trigger recovery correctly
- [ ] Log sanitization removes control characters

### 11.3 Post-MVP Success Criteria

| Metric | Target | Timeline |
|--------|--------|----------|
| npm weekly downloads | >100 | Week 8 |
| GitHub stars | >50 | Week 10 |
| Active issues/PRs | Healthy ratio | Ongoing |
| User testimonials | >5 positive | Week 12 |
| All agents ported | 8/8 | Week 12 |
| All skills ported | 11/11 | Week 15 |

---

## 12. Appendices

### Appendix A: OpenCode Hook Reference

```typescript
interface Hooks {
  // Event subscription (25+ event types)
  event?: (input: { event: Event }) => Promise<void>
  
  // Configuration modification
  config?: (input: Config) => Promise<void>
  
  // Custom tools
  tool?: { [key: string]: ToolDefinition }
  
  // Authentication providers
  auth?: AuthHook
  
  // Message handling
  "chat.message"?: (input: ChatMessageInput, output: ChatMessageOutput) => Promise<void>
  
  // LLM parameters
  "chat.params"?: (input: ChatParamsInput, output: ChatParamsOutput) => Promise<void>
  
  // Permission handling
  "permission.ask"?: (input: Permission, output: PermissionOutput) => Promise<void>
  
  // Tool execution
  "tool.execute.before"?: (input: ToolInput, output: ToolOutput) => Promise<void>
  "tool.execute.after"?: (input: ToolInput, output: ToolAfterOutput) => Promise<void>
  
  // Stop interception
  stop?: (input: StopInput) => Promise<void>
  
  // System prompt injection (experimental)
  "experimental.chat.system.transform"?: (input: SystemInput, output: SystemOutput) => Promise<void>
  
  // Message transformation (experimental)
  "experimental.chat.messages.transform"?: (input: {}, output: MessagesOutput) => Promise<void>
  
  // Session compaction (experimental)
  "experimental.session.compacting"?: (input: CompactInput, output: CompactOutput) => Promise<void>
  
  // Text completion (experimental)
  "experimental.text.complete"?: (input: TextInput, output: TextOutput) => Promise<void>
}
```

### Appendix B: Atreides Workflow Phases

```
Phase 0: Intent Gate
├── Classify request type (Trivial, Explicit, Exploratory, Open-ended, Ambiguous)
├── Check for skill matches
├── Fire background agents if needed
└── Validate before acting

Phase 1: Codebase Assessment (for open-ended tasks)
├── Check config files (linter, formatter, types)
├── Sample similar files for consistency
├── Classify state (Disciplined, Transitional, Legacy, Greenfield)
└── Determine behavior mode

Phase 2A: Exploration & Research
├── Select tools vs agents
├── Fire parallel background tasks
├── Collect results
└── Stop when sufficient context

Phase 2B: Implementation
├── Create todos for multi-step tasks
├── Mark in_progress before starting
├── Complete todos immediately
├── Verify with lsp_diagnostics
└── Delegate to specialists

Phase 2C: Failure Recovery
├── Track consecutive failures
├── After 3 failures: STOP
├── Revert to last working state
├── Document attempts
├── Consult Oracle or escalate

Phase 3: Completion
├── All todos marked done
├── Diagnostics clean
├── Build passes
├── Cancel background tasks
└── Report completion
```

### Appendix C: Model Selection Defaults

| Agent | Recommended Model | Rationale |
|-------|------------------|-----------|
| Oracle | anthropic/claude-sonnet-4 | Complex reasoning, architecture |
| Explore | anthropic/claude-haiku-4-5 | Speed, cost efficiency |
| Librarian | anthropic/claude-haiku-4-5 | Speed, cost efficiency |
| Frontend-UI-UX | anthropic/claude-sonnet-4 | Creative, detailed output |
| Document-Writer | anthropic/claude-sonnet-4 | Quality prose |
| General | anthropic/claude-sonnet-4 | Balanced capability |
| Build | (inherit global) | User preference |
| Plan | (inherit global) | User preference |

### Appendix D: Permission Presets

**Strict Preset**
```json
{
  "permission": {
    "*": "ask",
    "read": "allow",
    "glob": "allow",
    "grep": "allow",
    "list": "allow"
  }
}
```

**Balanced Preset (Default)**
```json
{
  "permission": {
    "*": "ask",
    "read": "allow",
    "glob": "allow",
    "grep": "allow",
    "list": "allow",
    "edit": "ask",
    "write": "ask",
    "bash": {
      "*": "ask",
      "git *": "allow",
      "npm test": "allow",
      "npm run *": "allow",
      "bun test": "allow",
      "bun run *": "allow",
      "rm -rf *": "deny",
      "sudo *": "deny"
    },
    "task": "allow",
    "websearch": "allow",
    "webfetch": "allow"
  }
}
```

**Relaxed Preset**
```json
{
  "permission": {
    "*": "allow",
    "bash": {
      "*": "allow",
      "rm -rf /": "deny",
      "rm -rf ~": "deny",
      "sudo *": "deny",
      "curl * | sh": "deny",
      "curl * | bash": "deny"
    },
    "external_directory": "ask"
  }
}
```

### Appendix E: Security Hardening Reference

#### E.1 Command Obfuscation Detection

The security layer normalizes commands before pattern matching to detect obfuscation attempts:

```typescript
// Obfuscation normalization pipeline
function normalizeCommand(cmd: string): string {
  let normalized = cmd;
  
  // 1. URL decode (%XX hex sequences)
  normalized = normalized.replace(/%([0-9A-Fa-f]{2})/g, (_, hex) => 
    String.fromCharCode(parseInt(hex, 16))
  );
  
  // 2. Hex escapes (\xNN)
  normalized = normalized.replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  
  // 3. Octal escapes (\NNN)
  normalized = normalized.replace(/\\([0-7]{1,3})/g, (_, oct) =>
    String.fromCharCode(parseInt(oct, 8))
  );
  
  // 4. Quote stripping (r'm' → rm)
  normalized = normalized.replace(/(['"])(.)(['"])/g, '$2');
  
  // 5. Backslash continuations
  normalized = normalized.replace(/\\\n/g, '');
  
  // 6. $'\xNN' bash quoting style
  normalized = normalized.replace(/\$'([^']+)'/g, (_, content) => {
    return content.replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
  });
  
  return normalized;
}
```

#### E.2 Blocked Command Patterns

| Category | Patterns | Action |
|----------|----------|--------|
| **Filesystem Destruction** | `rm -rf /`, `rm -rf ~`, `rm -rf $HOME`, `rm -rf /*` | BLOCK |
| **Disk Operations** | `> /dev/sd*`, `mkfs.*`, `dd if=` | BLOCK |
| **Fork Bomb** | `:(){:|:&};:` | BLOCK |
| **Permission Escalation** | `chmod -R 777 /` | BLOCK |
| **Remote Code Execution** | `curl *\| bash`, `wget *\| bash`, `curl *\| sh` | BLOCK |
| **Eval Injection** | `eval $(`, `eval "$(` | BLOCK |

#### E.3 Warning Patterns (Logged, Not Blocked)

| Pattern | Reason |
|---------|--------|
| `sudo` | Privilege escalation |
| `chmod` | Permission changes |
| `chown` | Ownership changes |
| `rm -rf` (not root) | Destructive operation |
| `git push --force` | History rewrite |
| `git reset --hard` | State loss |

#### E.4 Blocked File Patterns

| Category | Patterns |
|----------|----------|
| **Environment** | `.env`, `.env.*`, `.envrc` |
| **Secrets Directory** | `/secrets/`, `/.secrets/` |
| **Credentials Files** | `secrets.json`, `secrets.yaml`, `credentials.json`, `credentials.yaml`, `.credentials` |
| **Keys** | `*.pem`, `*.key`, `id_rsa`, `id_ed25519` |
| **SSH** | `.ssh/config`, `.ssh/*` |
| **Cloud Credentials** | `.aws/credentials`, `.aws/config` |
| **Package Manager Auth** | `.npmrc`, `.pypirc`, `.yarnrc` |
| **Kubernetes** | `kubeconfig`, `*.kubeconfig` |
| **Terraform** | `*.tfvars`, `*.tfstate` |

#### E.5 Error Pattern Detection (22 Patterns)

```typescript
const ERROR_PATTERNS = [
  'command not found',
  'permission denied',
  'no such file',
  'module not found',
  'cannot find module',
  'Error:',
  'ERROR:',
  'failed',
  'FAILED',
  'exception',
  'Exception',
  'traceback',
  'Traceback',
  'SyntaxError',
  'TypeError',
  'ReferenceError',
  'undefined',
  'null pointer',
  'segmentation fault',
  'out of memory',
  'connection refused',
  'timeout'
];
```

#### E.6 Log Sanitization

```typescript
function sanitizeLog(input: string): string {
  // Remove control characters (except newline, tab)
  let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Limit length to prevent log flooding
  if (sanitized.length > 500) {
    sanitized = sanitized.substring(0, 500) + '... [truncated]';
  }
  
  return sanitized;
}
```

#### E.7 Language-Specific Configurations

##### Node.js / TypeScript

```json
{
  "permission": {
    "bash": {
      "npm *": "allow",
      "npx *": "allow",
      "node *": "allow",
      "yarn *": "allow",
      "pnpm *": "allow",
      "bun *": "allow"
    }
  },
  "formatters": ["npx prettier --write", "npx eslint --fix"],
  "qualityChecks": ["npm test", "tsc --noEmit", "eslint", "prettier --check"]
}
```

##### Python

```json
{
  "permission": {
    "bash": {
      "python *": "allow",
      "python3 *": "allow",
      "pip *": "allow",
      "pip3 *": "allow",
      "pytest *": "allow",
      "poetry *": "allow",
      "uv *": "allow"
    }
  },
  "formatters": ["black", "ruff check --fix"],
  "qualityChecks": ["pytest", "mypy", "ruff check", "black --check"]
}
```

##### Go

```json
{
  "permission": {
    "bash": {
      "go *": "allow"
    }
  },
  "formatters": ["gofmt -w", "go vet"],
  "qualityChecks": ["go test ./...", "go vet", "golangci-lint run"]
}
```

##### Rust

```json
{
  "permission": {
    "bash": {
      "cargo *": "allow",
      "rustc *": "allow"
    }
  },
  "formatters": ["rustfmt", "cargo clippy --fix"],
  "qualityChecks": ["cargo test", "cargo check", "cargo clippy"]
}
```

### Appendix F: Skill Context Types

#### F.1 Main Context Skills

Skills that operate in the primary session context and can modify session state directly.

| Skill | Purpose | State Access |
|-------|---------|--------------| 
| base | Core skill definition | Full |
| orchestrate | Workflow coordination | Full |
| validate | Quality gate execution | Full |
| checkpoint | State management | Full |
| doc-sync | Documentation sync | Full |
| quality-gate | Comprehensive validation | Full |

#### F.2 Fork Context Skills

Skills that operate in isolated (forked) context. Returns summary only to prevent context bloat.

| Skill | Purpose | Isolation Reason |
|-------|---------|------------------|
| explore | Codebase exploration | Prevents search results from bloating context |
| lsp | Semantic code operations | LSP responses can be large |
| refactor | AST-grep transformations | Change previews are verbose |
| tdd | Test-driven development | Test output is verbose |
| parallel-explore | Multi-agent exploration | Multiple agent outputs |
| incremental-refactor | Safe refactoring | Step-by-step output |

#### F.3 Skill Frontmatter Schema

```yaml
---
name: skill-name
description: Brief description of what the skill does
context: main | fork
model: anthropic/claude-sonnet-4 | anthropic/claude-haiku-4-5 | anthropic/claude-opus-4
triggers:
  - keyword or phrase that activates this skill
  - another trigger phrase
---

# Skill content follows...
```

### Appendix G: MVP Guardrails

#### G.1 MVP Cut Line

All items below are explicitly **deferred to post-MVP**:

**Deferred Agents:**
- Frontend-UI-UX
- Document-Writer
- General

**Deferred Skills:**
- lsp, refactor, checkpoint, tdd, parallel-explore, incremental-refactor, doc-sync, quality-gate

**Deferred Features:**
- Maturity scoring (0-13 points)
- Session notifications
- Think mode (model switching)
- Custom permission logic
- Metrics dashboard
- Uninstall command
- Checkpoint system with rotation
- Session logging infrastructure

#### G.2 MVP Non-Goals

Explicitly what MVP will **NOT** do:

- Will not support custom permission handlers
- Will not implement model switching based on complexity
- Will not provide metrics/analytics dashboards
- Will not support team/enterprise configurations
- Will not implement checkpoint rotation or backup policies

#### G.3 Scope Gate Policy

**Any feature not in MVP scope requires explicit sign-off before branch merge.**

This prevents scope creep and ensures the 6-week timeline is maintained.

### Appendix H: Compatibility Rules

#### H.1 CLAUDE.md vs AGENTS.md Precedence

| Scenario | Behavior |
|----------|----------|
| Only AGENTS.md exists | Use AGENTS.md |
| Only CLAUDE.md exists | Import CLAUDE.md rules into runtime |
| Both exist | AGENTS.md takes precedence; CLAUDE.md rules merged as fallback |
| Conflict on same rule | AGENTS.md wins; log warning about override |

#### H.2 settings.json → opencode.json Migration

| settings.json Field | opencode.json Mapping | Override Behavior |
|---------------------|----------------------|-------------------|
| `allowedTools` | `permissions.allow` | Merge (union) |
| `blockedTools` | `permissions.deny` | Merge (union) |
| `model` | `model.default` | settings.json wins if present |
| Custom fields | Ignored | Log warning |

#### H.3 Compatibility Matrix

| Feature | MVP | Post-MVP | Deprecated |
|---------|-----|----------|------------|
| CLAUDE.md import | Yes | - | - |
| settings.json migration | Yes | - | - |
| Wrapper script (`/usr/local/bin/atreides`) | - | - | Yes |
| Template engine | - | - | Yes |
| Handlebars helpers | - | - | Yes |
| Shell scripts | - | - | Yes (replaced by hooks) |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-01-18 | AI Assistant | Initial planning document |
| 0.2.0 | 2026-01-18 | AI Assistant | Integrated deep dive findings: identity system, security hardening, skill context types, init modes, project detection, 466 test coverage target |
| 1.0.0 | 2026-01-18 | AI Assistant | **Final planning version**: Integrated ATREIDES_OC_LAST_STEP_PLAN.md - added hook fallbacks (3.5.1), phase acceptance criteria (7.4), performance validation (6.9), CLI runbook (9.6), security traceability (11.2), MVP guardrails (Appendix G), compatibility rules (Appendix H) |

---

*This document is the authoritative, consolidated reference for the Atreides OC implementation. It supersedes MASTER_MIGRATION_PLAN.md and ATREIDES_OC_LAST_STEP_PLAN.md. Ready for implementation.*
