/**
 * Hook Registration Integration Tests
 *
 * Tests that verify all plugin hooks are properly registered and accessible.
 * Covers: hook existence, type verification, hook structure validation.
 *
 * Total: 10 tests
 */

import { describe, expect, test, afterEach } from "bun:test";
import { createTestHarness, createInitializedHarness, getSampleProjectPath } from "../harness.js";
import { AtreidesPlugin, clearSessions } from "../../../src/plugin/index.js";
import { createMockContext, createMockConfig } from "../../mocks/index.js";

describe("Integration: Hook Registration", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 1: All required hooks are defined
  test("plugin exports all required hooks", async () => {
    const harness = await createTestHarness();

    expect(harness.hooks).toBeDefined();
    expect(harness.hooks.event).toBeDefined();
    expect(harness.hooks.stop).toBeDefined();
    expect(harness.hooks["tool.execute.before"]).toBeDefined();
    expect(harness.hooks["tool.execute.after"]).toBeDefined();
    expect(harness.hooks["experimental.chat.system.transform"]).toBeDefined();
    expect(harness.hooks["experimental.session.compacting"]).toBeDefined();

    harness.cleanup();
  });

  // Test 2: All hooks are functions
  test("all hooks are functions", async () => {
    const harness = await createTestHarness();

    expect(typeof harness.hooks.event).toBe("function");
    expect(typeof harness.hooks.stop).toBe("function");
    expect(typeof harness.hooks["tool.execute.before"]).toBe("function");
    expect(typeof harness.hooks["tool.execute.after"]).toBe("function");
    expect(typeof harness.hooks["experimental.chat.system.transform"]).toBe("function");
    expect(typeof harness.hooks["experimental.session.compacting"]).toBe("function");

    harness.cleanup();
  });

  // Test 3: Hooks are async functions returning promises
  test("hooks return promises", async () => {
    const harness = await createTestHarness();

    const eventResult = harness.hooks.event({ type: "session.created", sessionId: "test-promise" });
    const stopResult = harness.hooks.stop({ sessionId: "test-promise" });
    const toolBeforeResult = harness.hooks["tool.execute.before"]({
      tool: "read",
      input: {},
      sessionId: "test-promise",
    });

    expect(eventResult).toBeInstanceOf(Promise);
    expect(stopResult).toBeInstanceOf(Promise);
    expect(toolBeforeResult).toBeInstanceOf(Promise);

    await Promise.all([eventResult, stopResult, toolBeforeResult]);
    harness.cleanup();
  });

  // Test 4: Plugin can be instantiated multiple times
  test("plugin can be instantiated multiple times independently", async () => {
    const context1 = createMockContext({ projectPath: "/project1" });
    const context2 = createMockContext({ projectPath: "/project2" });

    const hooks1 = await AtreidesPlugin(context1);
    const hooks2 = await AtreidesPlugin(context2);

    expect(hooks1).toBeDefined();
    expect(hooks2).toBeDefined();
    expect(hooks1).not.toBe(hooks2);

    clearSessions();
  });

  // Test 5: Hook registration with custom config
  test("hooks work with custom configuration", async () => {
    const harness = await createTestHarness({
      config: {
        identity: {
          personaName: "CustomAgent",
          responsePrefix: true,
          delegationAnnouncements: true,
        },
        workflow: {
          enablePhaseTracking: true,
          strictTodoEnforcement: true,
          autoEscalateOnError: true,
        },
        security: {
          enableObfuscationDetection: true,
          blockedPatterns: [],
          warningPatterns: [],
          blockedFiles: [],
        },
      },
    });

    // Hooks should still work with custom config
    await harness.simulateSessionCreate();

    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: "Base prompt",
      sessionId: harness.sessionId,
    });

    expect(result.system).toContain("Base prompt");
    harness.cleanup();
  });

  // Test 6: Plugin works with sample project fixture
  test("plugin works with sample project fixture", async () => {
    const harness = await createTestHarness({
      projectPath: getSampleProjectPath(),
    });

    expect(harness.hooks).toBeDefined();
    await harness.simulateSessionCreate();

    harness.cleanup();
  });

  // Test 7: Hook object structure is correct
  test("hook object has exactly 6 hooks", async () => {
    const harness = await createTestHarness();

    const hookKeys = Object.keys(harness.hooks);
    expect(hookKeys.length).toBe(6);

    expect(hookKeys).toContain("event");
    expect(hookKeys).toContain("stop");
    expect(hookKeys).toContain("tool.execute.before");
    expect(hookKeys).toContain("tool.execute.after");
    expect(hookKeys).toContain("experimental.chat.system.transform");
    expect(hookKeys).toContain("experimental.session.compacting");

    harness.cleanup();
  });

  // Test 8: Hooks are callable without session (graceful handling)
  test("hooks handle calls without active session gracefully", async () => {
    const harness = await createTestHarness();
    const nonExistentSession = "non-existent-session";

    // These should not throw
    await expect(
      harness.hooks["tool.execute.before"]({
        tool: "read",
        input: {},
        sessionId: nonExistentSession,
      })
    ).resolves.toBeDefined();

    await expect(
      harness.hooks["tool.execute.after"]({
        tool: "read",
        input: {},
        output: {},
        sessionId: nonExistentSession,
      })
    ).resolves.toBeUndefined();

    const stopResult = await harness.hooks.stop({ sessionId: nonExistentSession });
    expect(stopResult.allow).toBe(true);

    harness.cleanup();
  });

  // Test 9: Hooks maintain isolation between sessions
  test("hooks maintain isolation between sessions", async () => {
    const harness = await createTestHarness();

    // Create two separate sessions
    await harness.hooks.event({ type: "session.created", sessionId: "session-a" });
    await harness.hooks.event({ type: "session.created", sessionId: "session-b" });

    // Execute tool on session A
    await harness.hooks["tool.execute.after"]({
      tool: "bash",
      input: { command: "invalid" },
      output: { error: "command failed", exitCode: 1 },
      sessionId: "session-a",
    });

    // Session B should not be affected
    const stopB = await harness.hooks.stop({ sessionId: "session-b" });
    expect(stopB.allow).toBe(true);

    harness.cleanup();
  });

  // Test 10: Hooks are re-entrant (can be called concurrently)
  test("hooks can be called concurrently", async () => {
    const harness = await createInitializedHarness();

    // Call multiple hooks concurrently
    const promises = [
      harness.hooks["tool.execute.before"]({
        tool: "read",
        input: { path: "/file1.ts" },
        sessionId: harness.sessionId,
      }),
      harness.hooks["tool.execute.before"]({
        tool: "read",
        input: { path: "/file2.ts" },
        sessionId: harness.sessionId,
      }),
      harness.hooks["tool.execute.before"]({
        tool: "read",
        input: { path: "/file3.ts" },
        sessionId: harness.sessionId,
      }),
    ];

    const results = await Promise.all(promises);

    // All should complete successfully
    results.forEach((result) => {
      expect(result).toBeDefined();
    });

    harness.cleanup();
  });
});
