# [MVP-F1] Initialize Package Structure & Build Pipeline

## Objective

Set up the foundational npm package structure, TypeScript configuration, and build pipeline for Atreides OpenCode.

## Context

This is the first ticket in the MVP implementation. It establishes the project structure that all other components will build upon.

**References**:
- Component Spec: Foundation & Infrastructure
- Technical Plan: spec:bf063507-9358-4515-afbb-3080f2099467/5cdb5788-a716-4cb2-a301-6ccd6f64a488 (Section 1.6)
- Master Plan: file:ATREIDES_OC_MASTER_PLAN.md (Section 8.1)

## Scope

**In Scope**:
- Create npm package with proper metadata
- Configure TypeScript for ES modules
- Set up Bun build pipeline
- Create directory structure (src/, templates/, test/, docs/)
- Configure package exports and CLI entry point
- Basic README and LICENSE

**Out of Scope**:
- Plugin implementation (separate ticket)
- CLI commands (separate ticket)
- Templates (separate ticket)
- Testing infrastructure (separate ticket)

## Implementation Guidance

### Package Configuration

**package.json**:
- Name: `atreides-opencode`
- Version: `0.1.0` (MVP pre-release)
- Type: `module` (ES modules)
- Main: `dist/plugin/index.js` (plugin entry point)
- Bin: `{ "atreides-opencode": "dist/cli/index.js" }` (CLI entry point)
- Exports: Define subpath exports for plugin, CLI, lib
- Engines: Node.js 20+, Bun 1.x
- Dependencies: Minimal (prefer built-ins)
- DevDependencies: TypeScript, @types/node, @opencode-ai/plugin

**tsconfig.json**:
- Target: ES2022
- Module: ESNext
- ModuleResolution: bundler
- Strict: true
- OutDir: dist/
- Include: src/**/*
- Exclude: test/, node_modules/

**bunfig.toml**:
- Configure Bun build settings
- Test runner configuration
- Module resolution settings

### Directory Structure

Create directories:
- `src/plugin/` - Plugin core code
- `src/cli/` - CLI commands
- `src/generators/` - File generators
- `src/lib/` - Shared utilities
- `templates/agents/` - Agent templates
- `templates/skills/` - Skill templates
- `test/plugin/` - Plugin unit tests
- `test/cli/` - CLI unit tests
- `test/integration/` - Integration tests
- `docs/` - Documentation

### Build Scripts

**package.json scripts**:
- `build`: Compile TypeScript to dist/
- `dev`: Watch mode for development
- `test`: Run test suite
- `lint`: TypeScript type checking
- `clean`: Remove dist/ directory

## Acceptance Criteria

- [ ] Package structure matches Technical Plan Section 1.6
- [ ] `bun build` successfully compiles TypeScript to dist/
- [ ] `bun test` runs (even with no tests yet)
- [ ] `tsc --noEmit` passes with no errors
- [ ] Directory structure created with proper organization
- [ ] package.json has correct entry points (main, bin, exports)
- [ ] README.md exists with basic project description
- [ ] LICENSE file exists (MIT)
- [ ] Git repository initialized with .gitignore

## Dependencies

**Depends On**: None (first ticket)

**Blocks**: All other MVP tickets

## Estimated Effort

**4 hours** (2h package setup + 2h build pipeline)

## Testing

- Verify `bun build` produces dist/ directory
- Verify `npm pack` creates valid package
- Verify package.json exports are correct
- Verify TypeScript compilation succeeds