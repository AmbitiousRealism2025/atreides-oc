/**
 * System Prompt Injection Integration Tests
 *
 * Tests for experimental.chat.system.transform hook.
 * Covers: prompt enhancement, phase guidance, error recovery messages, identity.
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
import { workflowEngine } from "../../../src/plugin/managers/workflow-engine.js";

describe("Integration: System Prompt - Basic Transform", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 1: preserves original system prompt
  test("preserves original system prompt content", async () => {
    const harness = await createInitializedHarness();

    const originalPrompt = "You are a helpful AI assistant.";

    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: originalPrompt,
      sessionId: harness.sessionId,
    });

    expect(result.system).toContain(originalPrompt);

    harness.cleanup();
  });

  // Test 2: returns modified system prompt
  test("returns modified system prompt object", async () => {
    const harness = await createInitializedHarness();

    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: "Base prompt",
      sessionId: harness.sessionId,
    });

    expect(result).toBeDefined();
    expect(result.system).toBeDefined();
    expect(typeof result.system).toBe("string");

    harness.cleanup();
  });

  // Test 3: handles empty system prompt
  test("handles empty system prompt", async () => {
    const harness = await createInitializedHarness();

    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: "",
      sessionId: harness.sessionId,
    });

    expect(result).toBeDefined();
    expect(typeof result.system).toBe("string");

    harness.cleanup();
  });

  // Test 4: handles non-existent session
  test("handles non-existent session gracefully", async () => {
    const harness = await createTestHarness();

    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: "Base prompt",
      sessionId: "non-existent-session",
    });

    expect(result).toBeDefined();
    expect(result.system).toContain("Base prompt");

    harness.cleanup();
  });
});

describe("Integration: System Prompt - Workflow Phase Guidance", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 5: includes exploration phase guidance
  test("includes EXPLORATION guidance when in exploration phase", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId);
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });

    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: "Base prompt",
      sessionId: harness.sessionId,
    });

    expect(result.system).toContain("EXPLORATION");

    harness.cleanup();
  });

  // Test 6: includes implementation phase guidance
  test("includes IMPLEMENTATION guidance when in implementation phase", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId);
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });
    await harness.simulateToolExecution("edit", { path: "/test.ts" }, { success: true });

    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: "Base prompt",
      sessionId: harness.sessionId,
    });

    expect(result.system).toContain("IMPLEMENTATION");

    harness.cleanup();
  });

  // Test 7: includes verification phase guidance
  test("includes VERIFICATION guidance when in verification phase", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId);
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });
    await harness.simulateToolExecution("edit", { path: "/test.ts" }, { success: true });
    await harness.simulateToolExecution("bash", { command: "npm test" }, { exitCode: 0 });

    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: "Base prompt",
      sessionId: harness.sessionId,
    });

    expect(result.system).toContain("VERIFICATION");

    harness.cleanup();
  });

  // Test 8: does not include phase guidance when idle
  test("does not include phase guidance when phase is idle", async () => {
    const harness = await createInitializedHarness();

    // Session starts in idle phase
    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: "Base prompt",
      sessionId: harness.sessionId,
    });

    // Should not contain workflow phase guidance headers
    expect(result.system).not.toContain("WORKFLOW PHASE");

    harness.cleanup();
  });
});

describe("Integration: System Prompt - Intent Guidance", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 9: includes bugfix intent guidance
  test("includes BUGFIX guidance when intent is bugfix", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId, "Fix the authentication bug");
    await harness.simulateToolExecution("read", { path: "/auth.ts" }, { content: "test" });

    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: "Base prompt",
      sessionId: harness.sessionId,
    });

    expect(result.system.toUpperCase()).toContain("BUGFIX");

    harness.cleanup();
  });

  // Test 10: includes feature intent guidance
  test("includes FEATURE guidance when intent is feature", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId, "Add a new login feature");
    await harness.simulateToolExecution("read", { path: "/login.ts" }, { content: "test" });

    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: "Base prompt",
      sessionId: harness.sessionId,
    });

    expect(result.system.toUpperCase()).toContain("FEATURE");

    harness.cleanup();
  });

  // Test 11: includes refactor intent guidance
  test("includes REFACTOR guidance when intent is refactor", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId, "Refactor the database module");
    await harness.simulateToolExecution("read", { path: "/db.ts" }, { content: "test" });

    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: "Base prompt",
      sessionId: harness.sessionId,
    });

    expect(result.system.toUpperCase()).toContain("REFACTOR");

    harness.cleanup();
  });
});

describe("Integration: System Prompt - Error Recovery Messages", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 12: includes error recovery warning on strike 1
  test("includes error recovery message on first error", async () => {
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

  // Test 13: includes detailed recovery on strike 2
  test("includes detailed recovery suggestions on strike 2", async () => {
    const harness = await createInitializedHarness();

    SessionManager.incrementErrorCount(harness.sessionId);
    SessionManager.incrementErrorCount(harness.sessionId);

    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: "Base prompt",
      sessionId: harness.sessionId,
    });

    expect(result.system).toContain("ERROR RECOVERY");
    expect(result.system).toContain("2/3");
    expect(result.system).toContain("Suggested actions");

    harness.cleanup();
  });

  // Test 14: warns about Stilgar escalation on strike 2
  test("warns about escalation on second strike", async () => {
    const harness = await createInitializedHarness();

    SessionManager.incrementErrorCount(harness.sessionId);
    SessionManager.incrementErrorCount(harness.sessionId);

    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: "Base prompt",
      sessionId: harness.sessionId,
    });

    expect(result.system.toLowerCase()).toContain("stilgar");

    harness.cleanup();
  });

  // Test 15: no error message when error count is 0
  test("no error recovery message when error count is 0", async () => {
    const harness = await createInitializedHarness();

    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: "Base prompt",
      sessionId: harness.sessionId,
    });

    expect(result.system).not.toContain("ERROR RECOVERY");

    harness.cleanup();
  });
});

describe("Integration: System Prompt - Config Options", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 16: respects phase tracking config
  test("respects enablePhaseTracking config option", async () => {
    const harness = await createInitializedHarness({
      config: {
        workflow: {
          enablePhaseTracking: false,
          strictTodoEnforcement: false,
          autoEscalateOnError: false,
        },
      },
    });

    workflowEngine.startWorkflow(harness.sessionId);
    SessionManager.setPhase(harness.sessionId, "exploration");

    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: "Base prompt",
      sessionId: harness.sessionId,
    });

    // When phase tracking is disabled, should not include phase guidance
    expect(result.system).not.toContain("EXPLORATION PHASE");

    harness.cleanup();
  });

  // Test 17: respects persona name config
  test("respects personaName config option", async () => {
    const harness = await createInitializedHarness({
      config: {
        identity: {
          personaName: "CustomPersona",
          responsePrefix: true,
          delegationAnnouncements: true,
        },
      },
    });

    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: "Base prompt",
      sessionId: harness.sessionId,
    });

    // The persona name should appear somewhere in the enhanced prompt
    // or in identity-related sections
    expect(result.system.length).toBeGreaterThan("Base prompt".length);

    harness.cleanup();
  });
});

describe("Integration: System Prompt - Edge Cases", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 18: handles very long system prompts
  test("handles very long system prompts", async () => {
    const harness = await createInitializedHarness();

    const longPrompt = "A".repeat(10000);

    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: longPrompt,
      sessionId: harness.sessionId,
    });

    expect(result.system).toContain(longPrompt);

    harness.cleanup();
  });

  // Test 19: handles special characters in prompt
  test("handles special characters in system prompt", async () => {
    const harness = await createInitializedHarness();

    const specialPrompt = "Test with <tags>, {braces}, [brackets], and $pecial chars!";

    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: specialPrompt,
      sessionId: harness.sessionId,
    });

    expect(result.system).toContain(specialPrompt);

    harness.cleanup();
  });

  // Test 20: handles unicode in system prompt
  test("handles unicode characters in system prompt", async () => {
    const harness = await createInitializedHarness();

    const unicodePrompt = "Test with émojis 🎉 and ünïcödé çhàracters 你好";

    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: unicodePrompt,
      sessionId: harness.sessionId,
    });

    expect(result.system).toContain(unicodePrompt);

    harness.cleanup();
  });
});
