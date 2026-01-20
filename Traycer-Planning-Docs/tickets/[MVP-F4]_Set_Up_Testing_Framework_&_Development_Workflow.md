# [MVP-F4] Set Up Testing Framework & Development Workflow

## Objective

Establish comprehensive testing infrastructure and development workflow for rapid iteration.

## Context

Testing is critical for the 466-test target and >80% coverage goal. This ticket sets up the foundation for all future testing.

**References**:
- Technical Plan: spec:bf063507-9358-4515-afbb-3080f2099467/5cdb5788-a716-4cb2-a301-6ccd6f64a488 (Section 4)
- Master Plan: file:ATREIDES_OC_MASTER_PLAN.md (Section 7.4)

## Scope

**In Scope**:
- Bun test runner configuration
- Mock OpenCode context utilities
- Test fixtures and helpers
- Integration test harness
- Development workflow (hot reload, local testing)
- CI/CD pipeline basics

**Out of Scope**:
- Actual test cases (created with each component)
- Performance benchmarks (Week 6 ticket)
- Security test suite (separate ticket)

## Implementation Guidance

### Test Configuration

**bunfig.toml**:
```toml
[test]
preload = ["./test/setup.ts"]
coverage = true
coverageThreshold = 80
```

### Mock Utilities

**test/mocks/opencode-context.ts**:
- Mock plugin context (project, client, $, directory, worktree)
- Mock session events
- Mock tool execution
- Mock file system operations

**test/fixtures/**:
- Sample project structures
- Template files
- Configuration files
- Expected outputs

### Integration Test Harness

**test/integration/harness.ts**:
- Set up test OpenCode environment
- Load plugin in test mode
- Simulate events and tool calls
- Verify hook execution
- Clean up after tests

### Development Workflow

**Hot Reload**:
- Watch src/ directory
- Rebuild on changes
- Reload plugin in test environment

**Local Testing**:
- Test project in `test/fixtures/sample-project/`
- Symlink plugin for local testing
- Quick iteration cycle

## Acceptance Criteria

- [ ] Bun test runner configured and operational
- [ ] `bun test` runs successfully (even with no tests)
- [ ] Mock OpenCode context utilities available
- [ ] Test fixtures directory structure created
- [ ] Integration test harness can load plugin
- [ ] Hot reload works for plugin development
- [ ] Local testing setup documented
- [ ] CI/CD pipeline configured (GitHub Actions or similar)
- [ ] Coverage reporting enabled (>80% target)
- [ ] First smoke test passes (plugin loads)

## Dependencies

**Depends On**:
- [MVP-F1] Initialize Package Structure & Build Pipeline

**Blocks**:
- All testing activities across MVP

## Estimated Effort

**6 hours** (4h test setup + 2h dev workflow)

## Testing

**Validation**:
- Run `bun test` - should pass
- Run `bun test --coverage` - should generate report
- Modify plugin code - hot reload should trigger
- Integration harness loads plugin successfully