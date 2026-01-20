# [PM4-F1] Implement Session Logging Infrastructure

## Context

Implement session logging infrastructure that captures all orchestration events, tool calls, and state changes to ~/.atreides/logs/ and ~/.atreides/state/.

**References**:
- Master Plan: file:ATREIDES_OC_MASTER_PLAN.md (Section 5: Post-MVP Roadmap, Phase 4)

**Dependencies**: Post-MVP Phase 3 complete

**Phase**: Post-MVP Phase 4 (Week 16-18)

---

## Scope

### In Scope
- Log file structure (~/.atreides/logs/{session-id}.log)
- State persistence (~/.atreides/state/{session-id}.json)
- Log rotation policy
- Structured logging format
- Privacy controls (PII filtering)

### Out of Scope
- Log analysis tools
- Log aggregation
- Real-time log streaming

---

## Acceptance Criteria

- [ ] Logging infrastructure implemented
- [ ] Log files created per session
- [ ] State persistence working
- [ ] Rotation policy implemented
- [ ] Privacy controls working
- [ ] Tests passing

---

## Effort Estimate

**From Master Plan**: 3 days (Week 16-17)