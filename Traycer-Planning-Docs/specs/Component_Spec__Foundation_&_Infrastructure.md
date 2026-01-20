# Component Spec: Foundation & Infrastructure

## Overview

This spec covers the foundational infrastructure for Atreides OpenCode: package structure, build pipeline, development workflow, and testing framework.

**References**:
- Technical Plan: spec:bf063507-9358-4515-afbb-3080f2099467/5cdb5788-a716-4cb2-a301-6ccd6f64a488
- Master Plan: file:ATREIDES_OC_MASTER_PLAN.md (Section 8.1)

**Scope**: MVP Phase 1, Week 1

---

## Package Structure

**npm Package Layout**:
```
atreides-opencode/
├── package.json              # Package metadata, dependencies, scripts
├── tsconfig.json             # TypeScript configuration
├── bunfig.toml              # Bun configuration
├── README.md                # Documentation
├── LICENSE                  # MIT license
├── CHANGELOG.md             # Version history
├── bin/
│   └── atreides.js          # CLI entry point
├── src/
│   ├── index.ts             # Package exports
│   ├── plugin/              # Plugin core
│   ├── cli/                 # CLI commands
│   ├── generators/          # File generators
│   └── lib/                 # Shared utilities
├── templates/               # Static templates
│   ├── agents/
│   ├── skills/
│   └── *.template
├── test/                    # Test suites
│   ├── plugin/
│   ├── cli/
│   └── integration/
└── docs/                    # Documentation
```

## Build Pipeline

**Build Process**:
1. TypeScript compilation (`tsc` or `bun build`)
2. Output to `dist/` directory
3. Preserve template files as static assets
4. Generate type declarations

**Development Workflow**:
- Hot reload for plugin development
- Local testing against test projects
- Fast iteration cycle with Bun

## Testing Framework

**Test Infrastructure**:
- Bun's built-in test runner
- Mock OpenCode context for unit tests
- Test fixtures for templates
- Integration test harness

**Test Organization**:
- Unit tests: `test/plugin/`, `test/cli/`
- Integration tests: `test/integration/`
- E2E tests: Full workflow scenarios

---

## Acceptance Criteria

- ✅ Package structure follows OpenCode plugin standards
- ✅ Build pipeline produces working plugin
- ✅ Development workflow enables fast iteration
- ✅ Testing framework supports unit + integration tests
- ✅ Documentation structure established