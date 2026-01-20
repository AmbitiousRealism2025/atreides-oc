# [PM6-CLI1] Implement Uninstall Command

## Context

Implement `uninstall` command that cleanly removes Atreides from a project, including all generated files and configurations.

**References**:
- Master Plan: file:ATREIDES_OC_MASTER_PLAN.md (Section 5: Post-MVP Roadmap, Phase 6)

**Dependencies**: Post-MVP Phase 5 complete

**Phase**: Post-MVP Phase 6 (Week 22-24)

---

## Scope

### In Scope
- Uninstall command implementation
- File removal (.opencode/agent/, .opencode/skill/, AGENTS.md)
- Configuration cleanup (opencode.json)
- Backup creation before uninstall
- Confirmation prompt

### Out of Scope
- npm package uninstall (user does manually)
- Global config cleanup

---

## Acceptance Criteria

- [ ] Uninstall command implemented
- [ ] All files removed correctly
- [ ] Backup created
- [ ] Confirmation prompt working
- [ ] Tests passing

---

## Effort Estimate

**From Master Plan**: 2 days (Week 22)