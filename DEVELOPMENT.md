# Development Guide

This document covers local development setup, testing workflows, and contribution guidelines for atreides-opencode.

## Prerequisites

- **Bun** >= 1.0.0 (recommended) or Node.js >= 20.0.0
- Git

```bash
# Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash
```

## Quick Start

```bash
# Clone and install
git clone https://github.com/atreides/atreides-opencode.git
cd atreides-opencode
bun install

# Verify setup
bun test
bun run build
```

## Development Workflow

### Available Scripts

| Command | Description |
|---------|-------------|
| `bun run build` | Build plugin and CLI to `dist/` |
| `bun run dev` | Watch mode for plugin development |
| `bun test` | Run all tests |
| `bun test --watch` | Run tests in watch mode |
| `bun test --coverage` | Run tests with coverage report |
| `bun run lint` | Type check with TypeScript |
| `bun run clean` | Remove build artifacts |

### Hot Reload Development

For rapid iteration during development:

```bash
# Terminal 1: Watch and rebuild on changes
bun run dev

# Terminal 2: Run tests in watch mode
bun test --watch
```

Changes to `src/` will trigger automatic rebuilds.

## Testing

### Test Structure

```
test/
├── setup.ts                    # Global test setup, utilities
├── mocks/
│   ├── index.ts               # Mock exports
│   └── opencode-context.ts    # Mock OpenCode plugin context
├── fixtures/
│   ├── sample-project/        # Sample project for integration tests
│   │   ├── package.json
│   │   ├── opencode.json      # Plugin configuration
│   │   └── src/index.ts
│   ├── templates/             # Configuration templates
│   │   ├── minimal-config.json
│   │   └── full-config.json
│   └── expected-outputs/      # Expected test outputs
│       ├── compaction-summary.txt
│       └── system-prompt-with-phase.txt
├── integration/
│   ├── harness.ts             # Integration test harness
│   └── smoke.test.ts          # Smoke tests
└── plugin/
    ├── index.test.ts          # Plugin unit tests
    ├── integration.test.ts    # Plugin integration tests
    └── managers/
        └── session-manager.test.ts
```

### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test test/plugin/index.test.ts

# Run tests matching pattern
bun test --test-name-pattern "session"

# Run with coverage
bun test --coverage

# Watch mode (re-runs on file changes)
bun test --watch
```

### Coverage Requirements

The project enforces **>80% coverage** thresholds:

- Line coverage: 80%
- Function coverage: 80%
- Statement coverage: 80%

Coverage reports are generated in the `coverage/` directory.

### Writing Tests

#### Unit Tests

```typescript
import { describe, expect, test, beforeEach } from "bun:test";
import { clearSessions } from "../../src/plugin/index";

describe("MyComponent", () => {
  beforeEach(() => {
    clearSessions(); // Clean state between tests
  });

  test("does something correctly", () => {
    // Arrange
    const input = "test";
    
    // Act
    const result = myFunction(input);
    
    // Assert
    expect(result).toBe("expected");
  });
});
```

#### Integration Tests with Harness

```typescript
import { describe, expect, test } from "bun:test";
import { createTestHarness, createInitializedHarness } from "./harness";

describe("Integration: Feature", () => {
  test("full workflow", async () => {
    // Create harness with initialized session
    const harness = await createInitializedHarness();
    
    // Simulate tool execution
    await harness.simulateToolExecution(
      "read",
      { path: "/test/file.ts" },
      { content: "file content" }
    );
    
    // Verify context captures
    expect(harness.context.notifications).toHaveLength(0);
    
    // Always cleanup
    harness.cleanup();
  });
});
```

#### Using Mock Utilities

```typescript
import {
  createMockContext,
  createMockConfig,
  createMockSessionState,
  createMockToolInput,
  createMockToolOutput,
} from "../mocks";

// Create mock context with custom options
const context = createMockContext({
  projectPath: "/custom/path",
  shellResults: new Map([
    ["git status", { stdout: "clean", stderr: "", exitCode: 0 }],
  ]),
});

// Access captured data
context.notifications; // Array of notifications sent
context.logs;          // Array of log entries
context.shellCommands; // Array of shell commands executed
```

### Test Harness API

The integration harness (`test/integration/harness.ts`) provides:

| Method | Description |
|--------|-------------|
| `createTestHarness(options)` | Create harness without session |
| `createInitializedHarness(options)` | Create harness with active session |
| `harness.simulateSessionCreate()` | Trigger session.created event |
| `harness.simulateSessionDelete()` | Trigger session.deleted event |
| `harness.simulateToolExecution(tool, input, output)` | Simulate full tool execution |
| `harness.cleanup()` | Clear all sessions |
| `getFixturePath(path)` | Get absolute path to fixture |
| `getSampleProjectPath()` | Get path to sample project |

## Local Testing with Sample Project

The `test/fixtures/sample-project/` directory contains a minimal project for testing:

```bash
# The sample project structure
test/fixtures/sample-project/
├── package.json      # Minimal package config
├── opencode.json     # Plugin configuration
└── src/
    └── index.ts      # Sample source file
```

To test plugin behavior with a real-ish project:

```typescript
import { createTestHarness, getSampleProjectPath } from "./harness";

const harness = await createTestHarness({
  projectPath: getSampleProjectPath(),
});
```

## CI/CD Pipeline

GitHub Actions runs on every push and PR:

1. **Type Check** - `bun run lint`
2. **Tests with Coverage** - `bun test --coverage`
3. **Build** - `bun run build`
4. **Verify Build Output** - Check dist files exist

Coverage is uploaded to Codecov (when configured).

See `.github/workflows/ci.yml` for full configuration.

## Debugging

### Debug Logging

Set environment variables for verbose output:

```bash
# Enable debug logging
LOG_LEVEL=debug bun test

# Run specific test with logging
LOG_LEVEL=debug bun test test/plugin/index.test.ts
```

### VSCode Debugging

Add to `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "bun",
      "request": "launch",
      "name": "Debug Tests",
      "program": "${workspaceFolder}/node_modules/.bin/bun",
      "args": ["test", "${file}"],
      "cwd": "${workspaceFolder}"
    }
  ]
}
```

## Project Structure

```
atreides-opencode/
├── src/
│   ├── plugin/           # OpenCode plugin implementation
│   │   ├── index.ts      # Plugin entry point
│   │   ├── handlers.ts   # Hook handlers
│   │   ├── types.ts      # Type definitions
│   │   └── managers/     # State managers
│   ├── cli/              # CLI commands
│   └── lib/              # Shared utilities
├── test/                 # Test files (see above)
├── dist/                 # Build output
├── bunfig.toml          # Bun configuration
├── tsconfig.json        # TypeScript configuration
└── package.json
```

## Contributing

1. Create a feature branch from `main`
2. Write tests for new functionality
3. Ensure all tests pass: `bun test`
4. Ensure type check passes: `bun run lint`
5. Ensure build succeeds: `bun run build`
6. Submit PR with clear description

### Code Style

- TypeScript strict mode enabled
- No `any` types without justification
- Prefer explicit return types on public functions
- Use descriptive test names
