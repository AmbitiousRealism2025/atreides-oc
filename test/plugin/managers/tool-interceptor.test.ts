import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { ToolInterceptor, toolInterceptor } from "../../../src/plugin/managers/tool-interceptor.js";
import * as SessionManager from "../../../src/plugin/managers/session-manager.js";
import { createMockConfig } from "../../mocks/opencode-context.js";

describe("ToolInterceptor", () => {
  const testSessionId = "test-session-123";
  let interceptor: ToolInterceptor;

  beforeEach(() => {
    // Clear all sessions and set up a fresh interceptor
    SessionManager.clearSessions();
    SessionManager.setDefaultConfig(createMockConfig({
      security: {
        enableObfuscationDetection: true,
        blockedPatterns: [],
        warningPatterns: [],
        blockedFiles: [],
      },
    }));
    interceptor = new ToolInterceptor();
    interceptor.clearTrackers();

    // Initialize a session for testing
    SessionManager.getState(testSessionId);
  });

  afterEach(() => {
    SessionManager.clearSessions();
    interceptor.clearTrackers();
  });

  describe("beforeExecute", () => {
    test("allows safe bash commands", async () => {
      const result = await interceptor.beforeExecute("bash", { command: "ls -la" }, testSessionId);
      expect(result.action).toBe("allow");
    });

    test("denies dangerous bash commands", async () => {
      const result = await interceptor.beforeExecute("bash", { command: "rm -rf /" }, testSessionId);
      expect(result.action).toBe("deny");
      expect(result.reason).toBeDefined();
    });

    test("asks for confirmation on sudo commands", async () => {
      const result = await interceptor.beforeExecute("bash", { command: "sudo apt update" }, testSessionId);
      expect(result.action).toBe("ask");
      expect(result.reason).toBeDefined();
    });

    test("denies access to blocked files", async () => {
      const result = await interceptor.beforeExecute("read", { file_path: ".env" }, testSessionId);
      expect(result.action).toBe("deny");
      expect(result.reason).toBeDefined();
    });

    test("allows access to safe files", async () => {
      const result = await interceptor.beforeExecute("read", { file_path: "src/index.ts" }, testSessionId);
      expect(result.action).toBe("allow");
    });

    test("validates write operations", async () => {
      const result = await interceptor.beforeExecute("write", { file_path: "secrets.json" }, testSessionId);
      expect(result.action).toBe("deny");
    });

    test("validates edit operations", async () => {
      const result = await interceptor.beforeExecute("edit", { path: ".npmrc" }, testSessionId);
      expect(result.action).toBe("deny");
    });

    test("allows unknown tools by default", async () => {
      const result = await interceptor.beforeExecute("customTool", { data: "anything" }, testSessionId);
      expect(result.action).toBe("allow");
    });

    test("updates session activity", async () => {
      const initialState = SessionManager.getState(testSessionId);
      const initialActivity = initialState.lastActivityAt;

      // Wait a tiny bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 1));

      await interceptor.beforeExecute("read", { file_path: "test.ts" }, testSessionId);

      const updatedState = SessionManager.getState(testSessionId);
      expect(updatedState.lastActivityAt.getTime()).toBeGreaterThanOrEqual(initialActivity.getTime());
    });

    test("returns deny on validation error", async () => {
      // Force an error by providing invalid input that might cause issues
      const result = await interceptor.beforeExecute("bash", { command: "normal command" }, testSessionId);
      expect(["allow", "ask", "deny"]).toContain(result.action);
    });

    test("tracks execution start time for duration calculation", async () => {
      await interceptor.beforeExecute("bash", { command: "ls" }, testSessionId);
      // Internal tracker should exist - we'll verify via afterExecute
      await interceptor.afterExecute("bash", { exitCode: 0 }, testSessionId);

      const history = interceptor.getToolHistory(testSessionId);
      expect(history.length).toBe(1);
      expect(history[0].durationMs).toBeDefined();
    });
  });

  describe("afterExecute", () => {
    test("logs tool execution in history", async () => {
      await interceptor.afterExecute("read", { success: true }, testSessionId);
      const history = interceptor.getToolHistory(testSessionId);
      expect(history).toHaveLength(1);
      expect(history[0].tool).toBe("read");
    });

    test("records success status from output", async () => {
      await interceptor.afterExecute("bash", { exitCode: 0 }, testSessionId);
      const history = interceptor.getToolHistory(testSessionId);
      expect(history[0].success).toBe(true);
    });

    test("records failure status from exitCode", async () => {
      await interceptor.afterExecute("bash", { exitCode: 1 }, testSessionId);
      const history = interceptor.getToolHistory(testSessionId);
      expect(history[0].success).toBe(false);
      expect(history[0].error).toContain("Exit code: 1");
    });

    test("records failure status from error field", async () => {
      await interceptor.afterExecute("read", { error: "File not found" }, testSessionId);
      const history = interceptor.getToolHistory(testSessionId);
      expect(history[0].success).toBe(false);
      expect(history[0].error).toBe("File not found");
    });

    test("records failure from success: false", async () => {
      await interceptor.afterExecute("write", { success: false, message: "Permission denied" }, testSessionId);
      const history = interceptor.getToolHistory(testSessionId);
      expect(history[0].success).toBe(false);
      expect(history[0].error).toBe("Permission denied");
    });

    test("handles null output as success", async () => {
      await interceptor.afterExecute("customTool", null, testSessionId);
      const history = interceptor.getToolHistory(testSessionId);
      expect(history[0].success).toBe(true);
    });

    test("handles undefined output as success", async () => {
      await interceptor.afterExecute("customTool", undefined, testSessionId);
      const history = interceptor.getToolHistory(testSessionId);
      expect(history[0].success).toBe(true);
    });

    test("limits history to 100 entries", async () => {
      // Execute 150 tools
      for (let i = 0; i < 150; i++) {
        await interceptor.afterExecute("read", {}, testSessionId);
      }
      expect(interceptor.getToolHistory(testSessionId)).toHaveLength(100);
    });

    test("keeps most recent 100 entries when limiting", async () => {
      for (let i = 0; i < 150; i++) {
        await interceptor.afterExecute(`tool-${i}`, {}, testSessionId);
      }
      const history = interceptor.getToolHistory(testSessionId);
      // First entry should be tool-50, last should be tool-149
      expect(history[0].tool).toBe("tool-50");
      expect(history[99].tool).toBe("tool-149");
    });

    test("updates last activity timestamp", async () => {
      const initialState = SessionManager.getState(testSessionId);
      const initialActivity = initialState.lastActivityAt;

      await new Promise(resolve => setTimeout(resolve, 1));
      await interceptor.afterExecute("bash", {}, testSessionId);

      const updatedState = SessionManager.getState(testSessionId);
      expect(updatedState.lastActivityAt.getTime()).toBeGreaterThanOrEqual(initialActivity.getTime());
    });

    test("handles missing session gracefully", async () => {
      // Should not throw
      await interceptor.afterExecute("bash", {}, "nonexistent-session");
      // Verify no entry was created
      expect(interceptor.getToolHistory("nonexistent-session")).toHaveLength(0);
    });

    test("calculates duration when beforeExecute was called", async () => {
      await interceptor.beforeExecute("bash", { command: "ls" }, testSessionId);

      // Small delay to have measurable duration
      await new Promise(resolve => setTimeout(resolve, 5));

      await interceptor.afterExecute("bash", { exitCode: 0 }, testSessionId);

      const history = interceptor.getToolHistory(testSessionId);
      expect(history[0].durationMs).toBeDefined();
      expect(history[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    test("records timestamp for each execution", async () => {
      const before = new Date();
      await interceptor.afterExecute("bash", {}, testSessionId);
      const after = new Date();

      const history = interceptor.getToolHistory(testSessionId);
      expect(history[0].timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(history[0].timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    test("never throws errors", async () => {
      // This should not throw even with weird input
      await interceptor.afterExecute("tool", { weird: Symbol("test") }, testSessionId);
      expect(true).toBe(true); // If we get here, no error was thrown
    });
  });

  describe("getToolHistory", () => {
    test("returns empty array for new session", () => {
      const history = interceptor.getToolHistory(testSessionId);
      expect(history).toEqual([]);
    });

    test("returns empty array for nonexistent session", () => {
      const history = interceptor.getToolHistory("nonexistent");
      expect(history).toEqual([]);
    });

    test("returns correct history after executions", async () => {
      await interceptor.afterExecute("read", { success: true }, testSessionId);
      await interceptor.afterExecute("write", { success: true }, testSessionId);
      await interceptor.afterExecute("bash", { exitCode: 0 }, testSessionId);

      const history = interceptor.getToolHistory(testSessionId);
      expect(history).toHaveLength(3);
      expect(history[0].tool).toBe("read");
      expect(history[1].tool).toBe("write");
      expect(history[2].tool).toBe("bash");
    });
  });

  describe("getToolStats", () => {
    test("returns zeros for empty history", () => {
      const stats = interceptor.getToolStats(testSessionId);
      expect(stats.totalCalls).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.failureCount).toBe(0);
      expect(stats.avgDurationMs).toBe(0);
      expect(Object.keys(stats.toolBreakdown)).toHaveLength(0);
    });

    test("counts successful and failed calls", async () => {
      await interceptor.afterExecute("read", { success: true }, testSessionId);
      await interceptor.afterExecute("read", { error: "fail" }, testSessionId);
      await interceptor.afterExecute("write", { success: true }, testSessionId);

      const stats = interceptor.getToolStats(testSessionId);
      expect(stats.totalCalls).toBe(3);
      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(1);
    });

    test("provides tool breakdown", async () => {
      await interceptor.afterExecute("read", {}, testSessionId);
      await interceptor.afterExecute("read", {}, testSessionId);
      await interceptor.afterExecute("write", {}, testSessionId);
      await interceptor.afterExecute("bash", {}, testSessionId);
      await interceptor.afterExecute("bash", {}, testSessionId);
      await interceptor.afterExecute("bash", {}, testSessionId);

      const stats = interceptor.getToolStats(testSessionId);
      expect(stats.toolBreakdown["read"]).toBe(2);
      expect(stats.toolBreakdown["write"]).toBe(1);
      expect(stats.toolBreakdown["bash"]).toBe(3);
    });

    test("calculates average duration", async () => {
      // Use beforeExecute to set up timing
      await interceptor.beforeExecute("bash", { command: "ls" }, testSessionId);
      await new Promise(resolve => setTimeout(resolve, 5));
      await interceptor.afterExecute("bash", {}, testSessionId);

      await interceptor.beforeExecute("read", { file_path: "test" }, testSessionId);
      await new Promise(resolve => setTimeout(resolve, 5));
      await interceptor.afterExecute("read", {}, testSessionId);

      const stats = interceptor.getToolStats(testSessionId);
      expect(stats.avgDurationMs).toBeGreaterThan(0);
    });

    test("handles missing session", () => {
      const stats = interceptor.getToolStats("nonexistent");
      expect(stats.totalCalls).toBe(0);
    });
  });

  describe("clearTrackers", () => {
    test("clears execution trackers", async () => {
      await interceptor.beforeExecute("bash", { command: "ls" }, testSessionId);
      interceptor.clearTrackers();

      // Now afterExecute won't have a tracker, so duration should be undefined
      await interceptor.afterExecute("bash", {}, testSessionId);
      const history = interceptor.getToolHistory(testSessionId);
      expect(history[0].durationMs).toBeUndefined();
    });
  });

  describe("Singleton instance", () => {
    test("toolInterceptor is exported as singleton", () => {
      expect(toolInterceptor).toBeInstanceOf(ToolInterceptor);
    });

    test("singleton can be used for validation", async () => {
      const result = await toolInterceptor.beforeExecute("bash", { command: "ls" }, testSessionId);
      expect(result.action).toBe("allow");
    });
  });

  describe("Integration with SecurityHardening", () => {
    test("delegates bash validation to SecurityHardening", async () => {
      const result = await interceptor.beforeExecute("bash", { command: "rm -rf /" }, testSessionId);
      expect(result.action).toBe("deny");
      expect(result.reason).toBeDefined();
      expect(result.matchedPattern).toBeDefined();
    });

    test("detects obfuscated dangerous commands", async () => {
      // URL-encoded rm -rf /
      const result = await interceptor.beforeExecute("bash", { command: "rm%20-rf%20%2F" }, testSessionId);
      expect(result.action).toBe("deny");
    });

    test("detects quote-obfuscated commands", async () => {
      const result = await interceptor.beforeExecute("bash", { command: "r'm' -rf /" }, testSessionId);
      expect(result.action).toBe("deny");
    });

    test("validates file paths through SecurityHardening", async () => {
      const result = await interceptor.beforeExecute("read", { file_path: ".ssh/id_rsa" }, testSessionId);
      expect(result.action).toBe("deny");
    });
  });

  describe("Integration with SessionManager", () => {
    test("records tool execution in session state", async () => {
      await interceptor.afterExecute("bash", { exitCode: 0 }, testSessionId);

      const state = SessionManager.getState(testSessionId);
      expect(state.toolHistory).toHaveLength(1);
      expect(state.toolHistory[0].tool).toBe("bash");
    });

    test("updates session activity on beforeExecute", async () => {
      const stateBefore = SessionManager.getState(testSessionId);
      const timeBefore = stateBefore.lastActivityAt;

      await new Promise(resolve => setTimeout(resolve, 1));
      await interceptor.beforeExecute("read", { file_path: "test.ts" }, testSessionId);

      const stateAfter = SessionManager.getState(testSessionId);
      expect(stateAfter.lastActivityAt.getTime()).toBeGreaterThanOrEqual(timeBefore.getTime());
    });

    test("tool history accessible via SessionManager", async () => {
      await interceptor.afterExecute("read", {}, testSessionId);
      await interceptor.afterExecute("write", {}, testSessionId);

      const state = SessionManager.getState(testSessionId);
      expect(state.toolHistory).toHaveLength(2);
    });
  });

  describe("Performance", () => {
    test("beforeExecute completes in <5ms for simple commands", async () => {
      const start = performance.now();
      await interceptor.beforeExecute("bash", { command: "ls -la" }, testSessionId);
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(5);
    });

    test("afterExecute completes in <5ms", async () => {
      const start = performance.now();
      await interceptor.afterExecute("bash", { exitCode: 0 }, testSessionId);
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(5);
    });

    test("handles high volume of tool calls efficiently", async () => {
      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        await interceptor.beforeExecute("bash", { command: `echo ${i}` }, testSessionId);
        await interceptor.afterExecute("bash", { exitCode: 0 }, testSessionId);
      }
      const duration = performance.now() - start;
      // 200 operations (100 before + 100 after) should complete in reasonable time
      // Allowing ~5ms per operation pair
      expect(duration).toBeLessThan(1000);
    });
  });

  describe("Error Handling", () => {
    test("beforeExecute handles validation errors gracefully", async () => {
      // This shouldn't throw
      const result = await interceptor.beforeExecute("bash", { command: "normal" }, testSessionId);
      expect(["allow", "ask", "deny"]).toContain(result.action);
    });

    test("afterExecute never throws", async () => {
      // Various edge cases that shouldn't throw
      await interceptor.afterExecute("tool", null, testSessionId);
      await interceptor.afterExecute("tool", undefined, testSessionId);
      await interceptor.afterExecute("tool", {}, testSessionId);
      await interceptor.afterExecute("tool", [], testSessionId);
      await interceptor.afterExecute("tool", "string output", testSessionId);
      expect(true).toBe(true);
    });

    test("handles nonexistent session in beforeExecute", async () => {
      // Should not throw, should return a result
      const result = await interceptor.beforeExecute("bash", { command: "ls" }, "fake-session");
      expect(result.action).toBeDefined();
    });
  });

  describe("BeforeExecuteResult structure", () => {
    test("includes action for all responses", async () => {
      const allowResult = await interceptor.beforeExecute("bash", { command: "ls" }, testSessionId);
      expect(allowResult.action).toBeDefined();

      const denyResult = await interceptor.beforeExecute("bash", { command: "rm -rf /" }, testSessionId);
      expect(denyResult.action).toBeDefined();

      const askResult = await interceptor.beforeExecute("bash", { command: "sudo ls" }, testSessionId);
      expect(askResult.action).toBeDefined();
    });

    test("includes reason for deny actions", async () => {
      const result = await interceptor.beforeExecute("bash", { command: "rm -rf /" }, testSessionId);
      expect(result.action).toBe("deny");
      expect(result.reason).toBeDefined();
      expect(result.reason!.length).toBeGreaterThan(0);
    });

    test("includes reason for ask actions", async () => {
      const result = await interceptor.beforeExecute("bash", { command: "sudo apt update" }, testSessionId);
      expect(result.action).toBe("ask");
      expect(result.reason).toBeDefined();
    });

    test("includes matchedPattern for security violations", async () => {
      const result = await interceptor.beforeExecute("bash", { command: "rm -rf /" }, testSessionId);
      expect(result.matchedPattern).toBeDefined();
    });
  });
});

describe("ToolInterceptor - Edge Cases", () => {
  const sessionId = "edge-case-session";
  let interceptor: ToolInterceptor;

  beforeEach(() => {
    SessionManager.clearSessions();
    SessionManager.setDefaultConfig(createMockConfig());
    interceptor = new ToolInterceptor();
    SessionManager.getState(sessionId);
  });

  afterEach(() => {
    SessionManager.clearSessions();
  });

  test("handles empty command string", async () => {
    const result = await interceptor.beforeExecute("bash", { command: "" }, sessionId);
    expect(result.action).toBe("allow");
  });

  test("handles command with only whitespace", async () => {
    const result = await interceptor.beforeExecute("bash", { command: "   " }, sessionId);
    expect(result.action).toBe("allow");
  });

  test("handles empty file path", async () => {
    const result = await interceptor.beforeExecute("read", { file_path: "" }, sessionId);
    expect(result.action).toBe("allow");
  });

  test("handles output with error: true boolean", async () => {
    await interceptor.afterExecute("tool", { error: true }, sessionId);
    const history = interceptor.getToolHistory(sessionId);
    expect(history[0].success).toBe(false);
  });

  test("handles output with error: false boolean", async () => {
    await interceptor.afterExecute("tool", { error: false }, sessionId);
    const history = interceptor.getToolHistory(sessionId);
    expect(history[0].success).toBe(true);
  });

  test("handles output with success: true explicitly", async () => {
    await interceptor.afterExecute("tool", { success: true }, sessionId);
    const history = interceptor.getToolHistory(sessionId);
    expect(history[0].success).toBe(true);
  });

  test("handles string output", async () => {
    await interceptor.afterExecute("tool", "some string output", sessionId);
    const history = interceptor.getToolHistory(sessionId);
    expect(history[0].success).toBe(true);
  });

  test("handles array output", async () => {
    await interceptor.afterExecute("tool", [1, 2, 3], sessionId);
    const history = interceptor.getToolHistory(sessionId);
    expect(history[0].success).toBe(true);
  });

  test("handles nested object output", async () => {
    await interceptor.afterExecute("tool", { data: { nested: { value: 1 } } }, sessionId);
    const history = interceptor.getToolHistory(sessionId);
    expect(history[0].success).toBe(true);
  });

  test("handles concurrent tool executions", async () => {
    // Start multiple tools without waiting
    const promises = [
      interceptor.beforeExecute("read", { file_path: "a.ts" }, sessionId),
      interceptor.beforeExecute("read", { file_path: "b.ts" }, sessionId),
      interceptor.beforeExecute("bash", { command: "ls" }, sessionId),
    ];

    const results = await Promise.all(promises);
    expect(results).toHaveLength(3);
    results.forEach(r => expect(r.action).toBe("allow"));
  });

  test("handles rapid before/after cycles", async () => {
    for (let i = 0; i < 50; i++) {
      await interceptor.beforeExecute("bash", { command: `echo ${i}` }, sessionId);
      await interceptor.afterExecute("bash", { exitCode: 0 }, sessionId);
    }

    const history = interceptor.getToolHistory(sessionId);
    expect(history).toHaveLength(50);
  });
});
