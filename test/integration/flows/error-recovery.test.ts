/**
 * Error Recovery Flow Integration Tests
 *
 * Tests for the 3-strike error recovery protocol.
 * Covers: error detection, strike counting, recovery suggestions, Stilgar escalation.
 *
 * Total: 20 tests
 */

import { describe, expect, test, afterEach } from "bun:test";
import { createTestHarness, createInitializedHarness } from "../harness.js";
import {
  clearSessions,
  getSessionState,
  SessionManager,
} from "../../../src/plugin/index.js";
import * as ErrorRecovery from "../../../src/plugin/managers/error-recovery.js";

describe("Integration: Error Recovery - Strike Counting", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 1: first error increments strike count to 1
  test("first error increments strike count to 1", async () => {
    const harness = await createInitializedHarness();

    await harness.hooks["tool.execute.after"]({
      tool: "bash",
      input: { command: "invalid-command" },
      output: { exitCode: 127, stderr: "command not found" },
      sessionId: harness.sessionId,
    });

    expect(getSessionState(harness.sessionId)?.errorCount).toBe(1);

    harness.cleanup();
  });

  // Test 2: second error increments strike count to 2
  test("second error increments strike count to 2", async () => {
    const harness = await createInitializedHarness();

    await harness.hooks["tool.execute.after"]({
      tool: "bash",
      input: {},
      output: { exitCode: 1, error: "error 1" },
      sessionId: harness.sessionId,
    });

    await harness.hooks["tool.execute.after"]({
      tool: "bash",
      input: {},
      output: { exitCode: 1, error: "error 2" },
      sessionId: harness.sessionId,
    });

    expect(getSessionState(harness.sessionId)?.errorCount).toBe(2);

    harness.cleanup();
  });

  // Test 3: third error triggers escalation threshold
  test("third error reaches escalation threshold", async () => {
    const harness = await createInitializedHarness();

    for (let i = 0; i < 3; i++) {
      await harness.hooks["tool.execute.after"]({
        tool: "bash",
        input: {},
        output: { exitCode: 1, error: `error ${i}` },
        sessionId: harness.sessionId,
      });
    }

    expect(getSessionState(harness.sessionId)?.errorCount).toBe(3);

    harness.cleanup();
  });

  // Test 4: successful operation resets strike count
  test("successful operation resets strike count to 0", async () => {
    const harness = await createInitializedHarness();

    // Generate errors
    await harness.hooks["tool.execute.after"]({
      tool: "bash",
      input: {},
      output: { exitCode: 1, error: "fail" },
      sessionId: harness.sessionId,
    });
    await harness.hooks["tool.execute.after"]({
      tool: "bash",
      input: {},
      output: { exitCode: 1, error: "fail" },
      sessionId: harness.sessionId,
    });

    expect(getSessionState(harness.sessionId)?.errorCount).toBe(2);

    // Success resets
    await harness.hooks["tool.execute.after"]({
      tool: "bash",
      input: {},
      output: { exitCode: 0, stdout: "success" },
      sessionId: harness.sessionId,
    });

    expect(getSessionState(harness.sessionId)?.errorCount).toBe(0);

    harness.cleanup();
  });

  // Test 5: strike count persists across different tools
  test("strike count persists across different tool types", async () => {
    const harness = await createInitializedHarness();

    await harness.hooks["tool.execute.after"]({
      tool: "bash",
      input: {},
      output: { exitCode: 1, error: "bash error" },
      sessionId: harness.sessionId,
    });

    await harness.hooks["tool.execute.after"]({
      tool: "read",
      input: { path: "/missing" },
      output: { error: "ENOENT: no such file" },
      sessionId: harness.sessionId,
    });

    expect(getSessionState(harness.sessionId)?.errorCount).toBe(2);

    harness.cleanup();
  });
});

describe("Integration: Error Recovery - Pattern Detection", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 6: detects exit code errors
  test("detects non-zero exit code as error", async () => {
    const harness = await createInitializedHarness();

    await harness.hooks["tool.execute.after"]({
      tool: "bash",
      input: { command: "false" },
      output: { exitCode: 1 },
      sessionId: harness.sessionId,
    });

    expect(getSessionState(harness.sessionId)?.errorCount).toBe(1);

    harness.cleanup();
  });

  // Test 7: detects "command not found" pattern
  test("detects command not found errors", async () => {
    const harness = await createInitializedHarness();

    await harness.hooks["tool.execute.after"]({
      tool: "bash",
      input: {},
      output: { stderr: "nonexistent: command not found", exitCode: 127 },
      sessionId: harness.sessionId,
    });

    expect(getSessionState(harness.sessionId)?.errorCount).toBe(1);

    harness.cleanup();
  });

  // Test 8: detects file not found errors
  test("detects ENOENT file errors", async () => {
    const harness = await createInitializedHarness();

    await harness.hooks["tool.execute.after"]({
      tool: "read",
      input: {},
      output: { error: "ENOENT: no such file or directory" },
      sessionId: harness.sessionId,
    });

    expect(getSessionState(harness.sessionId)?.errorCount).toBe(1);

    harness.cleanup();
  });

  // Test 9: detects permission denied errors
  test("detects permission denied errors", async () => {
    const harness = await createInitializedHarness();

    await harness.hooks["tool.execute.after"]({
      tool: "write",
      input: {},
      output: { error: "EACCES: permission denied" },
      sessionId: harness.sessionId,
    });

    expect(getSessionState(harness.sessionId)?.errorCount).toBe(1);

    harness.cleanup();
  });

  // Test 10: detects compilation errors
  test("detects compilation failure patterns", async () => {
    const harness = await createInitializedHarness();

    await harness.hooks["tool.execute.after"]({
      tool: "bash",
      input: { command: "tsc" },
      output: { stderr: "error: failed to compile", exitCode: 1 },
      sessionId: harness.sessionId,
    });

    expect(getSessionState(harness.sessionId)?.errorCount).toBe(1);

    harness.cleanup();
  });

  // Test 11: detects test failure patterns
  test("detects test failure patterns", async () => {
    const harness = await createInitializedHarness();

    await harness.hooks["tool.execute.after"]({
      tool: "bash",
      input: { command: "npm test" },
      output: { stdout: "Tests FAILED: 5 of 10 tests failed", exitCode: 1 },
      sessionId: harness.sessionId,
    });

    expect(getSessionState(harness.sessionId)?.errorCount).toBe(1);

    harness.cleanup();
  });

  // Test 12: does not count successful operations as errors
  test("does not count successful operations as errors", async () => {
    const harness = await createInitializedHarness();

    await harness.hooks["tool.execute.after"]({
      tool: "bash",
      input: { command: "echo hello" },
      output: { stdout: "hello", exitCode: 0 },
      sessionId: harness.sessionId,
    });

    expect(getSessionState(harness.sessionId)?.errorCount).toBe(0);

    harness.cleanup();
  });
});

describe("Integration: Error Recovery - System Prompt Integration", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 13: strike 1 shows simple warning in system prompt
  test("strike 1 shows simple warning in system prompt", async () => {
    const harness = await createInitializedHarness();

    SessionManager.incrementErrorCount(harness.sessionId);

    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: "Base prompt",
      sessionId: harness.sessionId,
    });

    expect(result.system).toContain("ERROR RECOVERY");
    expect(result.system).toContain("1/3");

    harness.cleanup();
  });

  // Test 14: strike 2 shows detailed recovery suggestions
  test("strike 2 shows detailed recovery suggestions", async () => {
    const harness = await createInitializedHarness();

    SessionManager.incrementErrorCount(harness.sessionId);
    SessionManager.incrementErrorCount(harness.sessionId);

    // Store error context
    SessionManager.setMetadata(harness.sessionId, "lastError", {
      tool: "bash",
      output: "command not found",
      category: "command",
    });

    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: "Base prompt",
      sessionId: harness.sessionId,
    });

    expect(result.system).toContain("2/3");
    expect(result.system).toContain("Suggested actions");

    harness.cleanup();
  });

  // Test 15: strike 3 shows Stilgar escalation message
  test("strike 3+ shows Stilgar escalation in system prompt", async () => {
    const harness = await createInitializedHarness({
      config: {
        workflow: {
          enablePhaseTracking: true,
          strictTodoEnforcement: false,
          autoEscalateOnError: true,
        },
      },
    });

    // Generate 3 errors
    for (let i = 0; i < 3; i++) {
      await harness.hooks["tool.execute.after"]({
        tool: "bash",
        input: {},
        output: { exitCode: 1, error: "failed" },
        sessionId: harness.sessionId,
      });
    }

    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: "Base prompt",
      sessionId: harness.sessionId,
    });

    // Should contain Stilgar escalation message
    expect(result.system.toLowerCase()).toContain("stilgar");

    harness.cleanup();
  });
});

describe("Integration: Error Recovery - Escalation State", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 16: escalation state is tracked
  test("escalation state is tracked after 3 strikes", async () => {
    const harness = await createInitializedHarness();

    for (let i = 0; i < 3; i++) {
      await harness.hooks["tool.execute.after"]({
        tool: "bash",
        input: {},
        output: { exitCode: 1, error: "fail" },
        sessionId: harness.sessionId,
      });
    }

    const isEscalated = ErrorRecovery.isEscalated(harness.sessionId);
    expect(isEscalated).toBe(true);

    harness.cleanup();
  });

  // Test 17: escalation is cleared on success
  test("escalation state is cleared after successful operation", async () => {
    const harness = await createInitializedHarness();

    // Trigger escalation
    for (let i = 0; i < 3; i++) {
      await harness.hooks["tool.execute.after"]({
        tool: "bash",
        input: {},
        output: { exitCode: 1, error: "fail" },
        sessionId: harness.sessionId,
      });
    }

    expect(ErrorRecovery.isEscalated(harness.sessionId)).toBe(true);

    // Successful operation
    await harness.hooks["tool.execute.after"]({
      tool: "bash",
      input: {},
      output: { exitCode: 0, stdout: "success" },
      sessionId: harness.sessionId,
    });

    expect(ErrorRecovery.isEscalated(harness.sessionId)).toBe(false);

    harness.cleanup();
  });

  // Test 18: error recovery state tracks triggering tool
  test("error recovery state tracks triggering tool", async () => {
    const harness = await createInitializedHarness();

    for (let i = 0; i < 3; i++) {
      await harness.hooks["tool.execute.after"]({
        tool: "bash",
        input: { command: "failing-cmd" },
        output: { exitCode: 1, error: "fail" },
        sessionId: harness.sessionId,
      });
    }

    const state = ErrorRecovery.getErrorRecoveryState(harness.sessionId);
    expect(state?.triggeringTool).toBe("bash");

    harness.cleanup();
  });
});

describe("Integration: Error Recovery - Edge Cases", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 19: handles rapid consecutive errors
  test("handles rapid consecutive errors correctly", async () => {
    const harness = await createInitializedHarness();

    const errorPromises = [];
    for (let i = 0; i < 5; i++) {
      errorPromises.push(
        harness.hooks["tool.execute.after"]({
          tool: "bash",
          input: {},
          output: { exitCode: 1, error: `error-${i}` },
          sessionId: harness.sessionId,
        })
      );
    }

    await Promise.all(errorPromises);

    // Error count should reflect all errors
    expect(getSessionState(harness.sessionId)?.errorCount).toBeGreaterThanOrEqual(3);

    harness.cleanup();
  });

  // Test 20: error count resets correctly after recovery cycle
  test("error count resets correctly after full recovery cycle", async () => {
    const harness = await createInitializedHarness();

    // First cycle: 3 errors -> escalation -> success -> reset
    for (let i = 0; i < 3; i++) {
      await harness.hooks["tool.execute.after"]({
        tool: "bash",
        input: {},
        output: { exitCode: 1, error: "fail" },
        sessionId: harness.sessionId,
      });
    }

    expect(getSessionState(harness.sessionId)?.errorCount).toBe(3);

    await harness.hooks["tool.execute.after"]({
      tool: "bash",
      input: {},
      output: { exitCode: 0 },
      sessionId: harness.sessionId,
    });

    expect(getSessionState(harness.sessionId)?.errorCount).toBe(0);

    // Second cycle: start fresh
    await harness.hooks["tool.execute.after"]({
      tool: "bash",
      input: {},
      output: { exitCode: 1, error: "new fail" },
      sessionId: harness.sessionId,
    });

    expect(getSessionState(harness.sessionId)?.errorCount).toBe(1);

    harness.cleanup();
  });
});

describe("Integration: Error Recovery - Escalation Reset Verification", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 21: verify resolvedAt timestamp is set on escalation reset
  test("resolvedAt timestamp is set when escalation is cleared", async () => {
    const harness = await createInitializedHarness();

    // Trigger escalation with 3 errors
    for (let i = 0; i < 3; i++) {
      await harness.hooks["tool.execute.after"]({
        tool: "bash",
        input: {},
        output: { exitCode: 1, error: "fail" },
        sessionId: harness.sessionId,
      });
    }

    // Verify escalated state before reset
    const escalatedState = ErrorRecovery.getErrorRecoveryState(harness.sessionId);
    expect(escalatedState?.escalated).toBe(true);
    expect(escalatedState?.escalatedAt).toBeDefined();
    expect(escalatedState?.resolvedAt).toBeUndefined();

    // Success resets escalation
    await harness.hooks["tool.execute.after"]({
      tool: "bash",
      input: {},
      output: { exitCode: 0, stdout: "success" },
      sessionId: harness.sessionId,
    });

    // Verify resolved state
    const resolvedState = ErrorRecovery.getErrorRecoveryState(harness.sessionId);
    expect(resolvedState?.escalated).toBe(false);
    expect(resolvedState?.resolvedAt).toBeDefined();
    expect(typeof resolvedState?.resolvedAt).toBe("number");

    harness.cleanup();
  });

  // Test 22: after reset, next error starts at strike 1 not strike 4
  test("after escalation reset, next error starts at strike 1", async () => {
    const harness = await createInitializedHarness();

    // Trigger escalation
    for (let i = 0; i < 3; i++) {
      await harness.hooks["tool.execute.after"]({
        tool: "bash",
        input: {},
        output: { exitCode: 1, error: "fail" },
        sessionId: harness.sessionId,
      });
    }

    expect(getSessionState(harness.sessionId)?.errorCount).toBe(3);

    // Success resets
    await harness.hooks["tool.execute.after"]({
      tool: "bash",
      input: {},
      output: { exitCode: 0 },
      sessionId: harness.sessionId,
    });

    expect(getSessionState(harness.sessionId)?.errorCount).toBe(0);

    // Next error should be strike 1, NOT strike 4
    await harness.hooks["tool.execute.after"]({
      tool: "bash",
      input: {},
      output: { exitCode: 1, error: "new error" },
      sessionId: harness.sessionId,
    });

    // Critical: should be 1, not 4
    expect(getSessionState(harness.sessionId)?.errorCount).toBe(1);

    // And session should NOT be escalated
    expect(ErrorRecovery.isEscalated(harness.sessionId)).toBe(false);

    harness.cleanup();
  });

  // Test 23: escalation message not shown after reset
  test("escalation message not shown in system prompt after reset", async () => {
    const harness = await createInitializedHarness({
      config: {
        workflow: {
          enablePhaseTracking: true,
          strictTodoEnforcement: false,
          autoEscalateOnError: true,
        },
      },
    });

    // Trigger escalation
    for (let i = 0; i < 3; i++) {
      await harness.hooks["tool.execute.after"]({
        tool: "bash",
        input: {},
        output: { exitCode: 1, error: "fail" },
        sessionId: harness.sessionId,
      });
    }

    // Verify escalation message appears
    const escalatedResult = await harness.hooks["experimental.chat.system.transform"]({
      system: "Base prompt",
      sessionId: harness.sessionId,
    });
    expect(escalatedResult.system.toLowerCase()).toContain("stilgar");

    // Success resets
    await harness.hooks["tool.execute.after"]({
      tool: "bash",
      input: {},
      output: { exitCode: 0, stdout: "success" },
      sessionId: harness.sessionId,
    });

    // System prompt should no longer contain Stilgar escalation
    const resetResult = await harness.hooks["experimental.chat.system.transform"]({
      system: "Base prompt",
      sessionId: harness.sessionId,
    });

    // Should NOT contain Stilgar escalation message anymore
    // Note: The word "stilgar" might appear in other contexts like identity,
    // so we check for the specific escalation pattern
    expect(resetResult.system).not.toContain("STILGAR ESCALATION");
    expect(resetResult.system).not.toContain("3-Strike Protocol Triggered");

    harness.cleanup();
  });

  // Test 24: preserved metadata after reset (escalatedAt, triggeringTool)
  test("escalation history preserved after reset", async () => {
    const harness = await createInitializedHarness();

    // Trigger escalation
    for (let i = 0; i < 3; i++) {
      await harness.hooks["tool.execute.after"]({
        tool: "bash",
        input: { command: "failing-command" },
        output: { exitCode: 1, error: "fail" },
        sessionId: harness.sessionId,
      });
    }

    const beforeReset = ErrorRecovery.getErrorRecoveryState(harness.sessionId);
    const escalatedAt = beforeReset?.escalatedAt;
    const triggeringTool = beforeReset?.triggeringTool;

    // Success resets
    await harness.hooks["tool.execute.after"]({
      tool: "bash",
      input: {},
      output: { exitCode: 0 },
      sessionId: harness.sessionId,
    });

    const afterReset = ErrorRecovery.getErrorRecoveryState(harness.sessionId);

    // escalated should be false, but history should be preserved
    expect(afterReset?.escalated).toBe(false);
    expect(afterReset?.escalatedAt).toBe(escalatedAt);
    expect(afterReset?.triggeringTool).toBe(triggeringTool);
    expect(afterReset?.resolvedAt).toBeDefined();

    harness.cleanup();
  });
});
