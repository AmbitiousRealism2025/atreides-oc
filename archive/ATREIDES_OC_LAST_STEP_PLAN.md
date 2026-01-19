# Atreides OC: Last Step Plan

> **Project**: atreides-opencode (Atreides OC)
> **Version**: 1.0.0-final-planning
> **Created**: 2026-01-18
> **Purpose**: Final planning refinements before implementation begins

---

## Overview

This document captures the final planning items required to complete the Atreides OC specification. These items address gaps identified in the Codex Perspective review and ensure the migration plan is execution-ready.

---

## 1. MVP Guardrails

### 1.1 MVP Cut Line Appendix
Create a one-page appendix listing all deferred items:

**Deferred Agents (Post-MVP)**:
- Frontend-UI-UX
- Document-Writer
- General

**Deferred Skills (Post-MVP)**:
- lsp, refactor, checkpoint, tdd, parallel-explore, incremental-refactor, doc-sync, quality-gate

**Deferred Features (Post-MVP)**:
- Maturity scoring (0-13 points)
- Session notifications
- Think mode (model switching)
- Custom permission logic
- Metrics dashboard
- Uninstall command

### 1.2 MVP Non-Goals
Explicitly state what MVP will NOT do:
- Will not support custom permission handlers
- Will not implement model switching based on complexity
- Will not provide metrics/analytics dashboards
- Will not support team/enterprise configurations
- Will not implement checkpoint rotation or backup policies

### 1.3 Scope Gate
Any feature not in MVP scope requires explicit sign-off before branch merge.

---

## 2. Hook Stability and Fallbacks

### 2.1 Fallback Strategy

| Hook | Fallback Behavior |
|------|-------------------|
| `experimental.chat.system.transform` | Inject rules via AGENTS.md only (no dynamic injection) |
| `experimental.session.compacting` | Log warning; allow default compaction behavior |

### 2.2 Hook Detection Logic
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

### 2.3 Monitoring
- Subscribe to OpenCode release notes and changelog
- Flag breaking changes in experimental APIs during weekly review

---

## 3. Security-to-Test Traceability

### 3.1 Security Control → Test Mapping

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

### 3.2 466-Test Parity Breakdown

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

### 3.3 Validation Checklist
Before MVP release:
- [ ] Obfuscation decoding tested (URL, hex, octal, quote)
- [ ] All blocked patterns have corresponding tests
- [ ] File guards tested for each blocked pattern
- [ ] Error patterns trigger recovery correctly
- [ ] Log sanitization removes control characters

---

## 4. Compatibility Rules

### 4.1 CLAUDE.md vs AGENTS.md Precedence

| Scenario | Behavior |
|----------|----------|
| Only AGENTS.md exists | Use AGENTS.md |
| Only CLAUDE.md exists | Import CLAUDE.md rules into runtime |
| Both exist | AGENTS.md takes precedence; CLAUDE.md rules merged as fallback |
| Conflict on same rule | AGENTS.md wins; log warning about override |

### 4.2 settings.json → opencode.json Migration

| settings.json Field | opencode.json Mapping | Override Behavior |
|---------------------|----------------------|-------------------|
| `allowedTools` | `permissions.allow` | Merge (union) |
| `blockedTools` | `permissions.deny` | Merge (union) |
| `model` | `model.default` | settings.json wins if present |
| Custom fields | Ignored | Log warning |

### 4.3 Compatibility Matrix

| Feature | MVP | Post-MVP | Deprecated |
|---------|-----|----------|------------|
| CLAUDE.md import | Yes | - | - |
| settings.json migration | Yes | - | - |
| Wrapper script (`/usr/local/bin/atreides`) | - | - | Yes |
| Template engine | - | - | Yes |
| Handlebars helpers | - | - | Yes |
| Shell scripts | - | - | Yes (replaced by hooks) |

---

## 5. Performance Validation

### 5.1 Measurement Plan (Week 6)

| Metric | Target | Tool |
|--------|--------|------|
| Plugin load time | <100ms | `performance.now()` in test harness |
| Hook overhead (per call) | <10ms | Benchmark suite with 1000 iterations |
| CLI init time | <2s | End-to-end timing |
| Doctor command | <1s | End-to-end timing |

### 5.2 Baseline Environment
- Node.js 20 LTS / Bun 1.x
- macOS 14+ / Ubuntu 22.04
- SSD storage
- 8GB RAM minimum

### 5.3 Measurement Execution
- Run benchmarks in Week 6 after core features stabilize
- Document baseline numbers in test output
- Fail CI if targets exceeded by >20%

---

## 6. CLI Operational Runbook

### 6.1 Doctor Remediation Playbook

| Warning/Error | Cause | Remediation |
|---------------|-------|-------------|
| `Plugin not found` | Missing .opencode/plugin/atreides.ts | Run `npx atreides init` |
| `AGENTS.md missing` | File deleted or not generated | Run `npx atreides init --force` |
| `Outdated version` | npm package newer than local | Run `npx atreides update` |
| `Hook registration failed` | OpenCode version mismatch | Check OpenCode version compatibility |
| `CLAUDE.md detected` | Legacy file present | Run `npx atreides migrate` |
| `settings.json found` | Legacy config present | Run `npx atreides migrate` |

### 6.2 Migration Troubleshooting

| Failure Mode | Cause | Recovery |
|--------------|-------|----------|
| Merge conflict | Both CLAUDE.md and AGENTS.md have conflicting rules | Manually resolve; AGENTS.md takes precedence |
| Permission denied | File system permissions | Check write access to project root |
| Partial migration | Interrupted process | Re-run `npx atreides migrate --force` |
| Invalid settings.json | Malformed JSON | Fix JSON syntax; re-run migrate |

---

## 7. Phase Acceptance Criteria

### 7.1 Phase 1: Foundation (Weeks 1-2)

| Criterion | Validation |
|-----------|------------|
| Plugin loads without error | `bun test plugin/load.test.ts` |
| Session state initializes | Integration test: session.created event |
| Tool interceptor registers | Hook registration logged |
| CLI framework operational | `npx atreides --help` returns 0 |
| Init wizard completes | E2E test: full wizard flow |

**Documentation**: README draft

### 7.2 Phase 2: Core Features (Weeks 3-4)

| Criterion | Validation |
|-----------|------------|
| Workflow engine tracks phases | Unit tests for phase transitions |
| Error recovery triggers at 3 strikes | Integration test: failure sequence |
| Security pipeline blocks dangerous commands | 56 security tests pass |
| System prompt injection works | Hook output verified |
| Identity system operational | Response prefix in output |

**Documentation**: Configuration reference draft

### 7.3 Phase 3: Agents & Skills (Weeks 5-6)

| Criterion | Validation |
|-----------|------------|
| 5 MVP agents defined and callable | Agent invocation tests |
| 4 MVP skills operational | Skill loading tests |
| Update command works | Version check + file sync test |
| Full E2E workflow passes | Complete session test |
| Performance targets met | Benchmark suite passes |

**Documentation**: README final, Migration guide, Config reference final

---

## 8. Deliverables Checklist

Before declaring planning complete:

- [ ] MVP Cut Line Appendix added to MASTER_MIGRATION_PLAN.md
- [ ] MVP Non-Goals section added
- [ ] Hook fallback strategy documented
- [ ] Security-to-test mapping table added
- [ ] 466-test category breakdown added
- [ ] Compatibility rules (precedence, migration) documented
- [ ] Performance measurement plan added to Week 6
- [ ] Doctor remediation playbook added
- [ ] Migration troubleshooting guide added
- [ ] Phase acceptance criteria added for all 3 phases

---

## 9. Next Steps

1. Incorporate this document into `atreides/MASTER_MIGRATION_PLAN.md` as Appendix G
2. Update QUICK_REFERENCE.md with compatibility rules summary
3. Begin implementation Phase 1

---

## Related Documents

- `atreides/MASTER_MIGRATION_PLAN.md`
- `atreides/QUICK_REFERENCE.md`
- `atreides/codex_perspective_docs/codex_suggestions.md`
