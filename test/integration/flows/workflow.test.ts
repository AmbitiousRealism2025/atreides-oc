/**
 * Workflow Transition Integration Tests
 *
 * Tests for the 5-phase workflow engine.
 * Covers: phase transitions, intent classification, phase history, workflow completion.
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

describe("Integration: Workflow - Phase Transitions via Tools", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 1: read tool triggers exploration phase
  test("read tool transitions to exploration phase", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId);

    await harness.simulateToolExecution(
      "read",
      { path: "/test.ts" },
      { content: "test content" }
    );

    expect(workflowEngine.getCurrentPhase(harness.sessionId)).toBe("exploration");

    harness.cleanup();
  });

  // Test 2: grep tool triggers exploration phase
  test("grep tool transitions to exploration phase", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId);

    await harness.simulateToolExecution(
      "grep",
      { pattern: "function" },
      { matches: [] }
    );

    expect(workflowEngine.getCurrentPhase(harness.sessionId)).toBe("exploration");

    harness.cleanup();
  });

  // Test 3: glob tool triggers exploration phase
  test("glob tool transitions to exploration phase", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId);

    await harness.simulateToolExecution(
      "glob",
      { pattern: "**/*.ts" },
      { files: ["/test.ts"] }
    );

    expect(workflowEngine.getCurrentPhase(harness.sessionId)).toBe("exploration");

    harness.cleanup();
  });

  // Test 4: edit tool triggers implementation phase
  test("edit tool transitions to implementation phase", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId);
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });

    await harness.simulateToolExecution(
      "edit",
      { path: "/test.ts", old: "a", new: "b" },
      { success: true }
    );

    expect(workflowEngine.getCurrentPhase(harness.sessionId)).toBe("implementation");

    harness.cleanup();
  });

  // Test 5: write tool triggers implementation phase
  test("write tool transitions to implementation phase", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId);
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });

    await harness.simulateToolExecution(
      "write",
      { path: "/new.ts", content: "new content" },
      { success: true }
    );

    expect(workflowEngine.getCurrentPhase(harness.sessionId)).toBe("implementation");

    harness.cleanup();
  });

  // Test 6: test command triggers verification phase
  test("npm test command transitions to verification phase", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId);
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });
    await harness.simulateToolExecution("edit", { path: "/test.ts" }, { success: true });

    await harness.simulateToolExecution(
      "bash",
      { command: "npm test" },
      { stdout: "All tests passed", exitCode: 0 }
    );

    expect(workflowEngine.getCurrentPhase(harness.sessionId)).toBe("verification");

    harness.cleanup();
  });

  // Test 7: build command triggers verification phase
  test("build command transitions to verification phase", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId);
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });
    await harness.simulateToolExecution("edit", { path: "/test.ts" }, { success: true });

    await harness.simulateToolExecution(
      "bash",
      { command: "npm run build" },
      { stdout: "Build complete", exitCode: 0 }
    );

    expect(workflowEngine.getCurrentPhase(harness.sessionId)).toBe("verification");

    harness.cleanup();
  });
});

describe("Integration: Workflow - Intent Classification", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 8: classifies bugfix intent
  test("classifies bugfix intent from message", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId, "Fix the authentication bug");

    const state = workflowEngine.getWorkflowState(harness.sessionId);
    expect(state?.intentClassification).toBe("bugfix");

    harness.cleanup();
  });

  // Test 9: classifies feature intent
  test("classifies feature intent from message", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId, "Add a new login feature");

    const state = workflowEngine.getWorkflowState(harness.sessionId);
    expect(state?.intentClassification).toBe("feature");

    harness.cleanup();
  });

  // Test 10: classifies refactor intent
  test("classifies refactor intent from message", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId, "Refactor the database module");

    const state = workflowEngine.getWorkflowState(harness.sessionId);
    expect(state?.intentClassification).toBe("refactor");

    harness.cleanup();
  });

  // Test 11: classifies test intent
  test("classifies test intent from message", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId, "Write tests for the API endpoints");

    const state = workflowEngine.getWorkflowState(harness.sessionId);
    expect(state?.intentClassification).toBe("test");

    harness.cleanup();
  });

  // Test 12: classifies documentation intent
  test("classifies documentation intent from message", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId, "Update the documentation for the API");

    const state = workflowEngine.getWorkflowState(harness.sessionId);
    expect(state?.intentClassification).toBe("documentation");

    harness.cleanup();
  });
});

describe("Integration: Workflow - Phase History", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 13: phase history tracks all transitions
  test("phase history tracks all phase transitions", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId);
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });
    await harness.simulateToolExecution("edit", { path: "/test.ts" }, { success: true });
    await harness.simulateToolExecution("bash", { command: "npm test" }, { exitCode: 0 });

    const history = workflowEngine.getPhaseHistory(harness.sessionId);

    // Should have at least 4 entries: idle -> intent -> exploration -> implementation -> verification
    expect(history.length).toBeGreaterThanOrEqual(4);

    harness.cleanup();
  });

  // Test 14: phase history includes timestamps
  test("phase history includes timestamps for transitions", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId);
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });

    const history = workflowEngine.getPhaseHistory(harness.sessionId);

    history.forEach((entry) => {
      expect(entry.timestamp).toBeDefined();
      expect(typeof entry.timestamp).toBe("number");
    });

    harness.cleanup();
  });

  // Test 15: phase history records triggering tool
  test("phase history records triggering tool", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId);
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });

    const history = workflowEngine.getPhaseHistory(harness.sessionId);
    const explorationEntry = history.find((h) => h.to === "exploration");

    expect(explorationEntry?.triggeredBy).toBe("read");

    harness.cleanup();
  });
});

describe("Integration: Workflow - Reset and Completion", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 16: workflow reset clears all state
  test("workflow reset clears phase and history", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId, "Add a feature");
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });
    await harness.simulateToolExecution("edit", { path: "/test.ts" }, { success: true });

    workflowEngine.resetWorkflow(harness.sessionId);

    expect(workflowEngine.getCurrentPhase(harness.sessionId)).toBe("idle");
    expect(workflowEngine.getPhaseHistory(harness.sessionId).length).toBe(0);

    const state = workflowEngine.getWorkflowState(harness.sessionId);
    expect(state?.intentClassification).toBeUndefined();

    harness.cleanup();
  });

  // Test 17: workflow completion detection
  test("detects workflow completion when returning to idle from verification", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId);
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });
    await harness.simulateToolExecution("edit", { path: "/test.ts" }, { success: true });
    await harness.simulateToolExecution("bash", { command: "npm test" }, { exitCode: 0 });

    // At verification phase, not yet complete
    expect(workflowEngine.getCurrentPhase(harness.sessionId)).toBe("verification");

    // Workflow is marked complete when transitioning from verification to idle
    // (this happens internally when workflow completes, simulated by direct transition)
    workflowEngine.transitionPhase(harness.sessionId, "verification", "idle");

    const isComplete = workflowEngine.isWorkflowComplete(harness.sessionId);
    expect(isComplete).toBe(true);

    harness.cleanup();
  });

  // Test 18: workflow not complete before verification
  test("workflow not complete before verification phase", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId);
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });
    await harness.simulateToolExecution("edit", { path: "/test.ts" }, { success: true });

    const isComplete = workflowEngine.isWorkflowComplete(harness.sessionId);
    expect(isComplete).toBe(false);

    harness.cleanup();
  });
});

describe("Integration: Workflow - System Prompt Integration", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 19: system prompt includes phase guidance
  test("system prompt includes current phase guidance", async () => {
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

  // Test 20: system prompt includes intent guidance
  test("system prompt includes intent-specific guidance", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId, "Fix the broken login");
    await harness.simulateToolExecution("read", { path: "/login.ts" }, { content: "test" });

    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: "Base prompt",
      sessionId: harness.sessionId,
    });

    expect(result.system.toUpperCase()).toContain("BUGFIX");

    harness.cleanup();
  });
});

describe("Integration: Workflow - Auto Start on System Transform", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 21: workflow starts automatically on first system transform
  test("workflow starts on first system transform (idle -> intent)", async () => {
    const harness = await createInitializedHarness();

    // Initially, the session should be in idle phase
    expect(workflowEngine.getCurrentPhase(harness.sessionId)).toBe("idle");

    // Calling system transform should auto-start the workflow
    await harness.hooks["experimental.chat.system.transform"]({
      system: "Base prompt",
      sessionId: harness.sessionId,
    });

    // Should now be in intent phase
    expect(workflowEngine.getCurrentPhase(harness.sessionId)).toBe("intent");

    harness.cleanup();
  });

  // Test 22: subsequent transforms don't re-trigger startWorkflow
  test("subsequent system transforms don't re-trigger startWorkflow", async () => {
    const harness = await createInitializedHarness();

    // First transform starts workflow
    await harness.hooks["experimental.chat.system.transform"]({
      system: "Base prompt",
      sessionId: harness.sessionId,
    });

    expect(workflowEngine.getCurrentPhase(harness.sessionId)).toBe("intent");

    // Progress to exploration
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });
    expect(workflowEngine.getCurrentPhase(harness.sessionId)).toBe("exploration");

    // Another system transform should NOT reset to intent
    await harness.hooks["experimental.chat.system.transform"]({
      system: "Base prompt",
      sessionId: harness.sessionId,
    });

    // Should still be in exploration, not reset to intent
    expect(workflowEngine.getCurrentPhase(harness.sessionId)).toBe("exploration");

    harness.cleanup();
  });

  // Test 23: workflowStarted flag prevents repeated calls
  test("workflowStarted metadata flag is set after first transform", async () => {
    const harness = await createInitializedHarness();

    // Initially, no workflowStarted flag
    const initialFlag = SessionManager.getMetadata(harness.sessionId, "workflowStarted");
    expect(initialFlag).toBeUndefined();

    // First transform sets the flag
    await harness.hooks["experimental.chat.system.transform"]({
      system: "Base prompt",
      sessionId: harness.sessionId,
    });

    const flagAfterTransform = SessionManager.getMetadata(harness.sessionId, "workflowStarted");
    expect(flagAfterTransform).toBe(true);

    harness.cleanup();
  });
});

describe("Integration: Workflow - Bash Command Phase Detection", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 24: npm install triggers implementation phase
  test("npm install command triggers implementation phase", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId);
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });

    await harness.simulateToolExecution(
      "bash",
      { command: "npm install express" },
      { stdout: "added 50 packages", exitCode: 0 }
    );

    expect(workflowEngine.getCurrentPhase(harness.sessionId)).toBe("implementation");

    harness.cleanup();
  });

  // Test 25: git commit triggers implementation phase
  test("git commit command triggers implementation phase", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId);
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });

    await harness.simulateToolExecution(
      "bash",
      { command: "git commit -m 'feat: add feature'" },
      { stdout: "1 file changed", exitCode: 0 }
    );

    expect(workflowEngine.getCurrentPhase(harness.sessionId)).toBe("implementation");

    harness.cleanup();
  });

  // Test 26: git add triggers implementation phase
  test("git add command triggers implementation phase", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId);
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });

    await harness.simulateToolExecution(
      "bash",
      { command: "git add ." },
      { stdout: "", exitCode: 0 }
    );

    expect(workflowEngine.getCurrentPhase(harness.sessionId)).toBe("implementation");

    harness.cleanup();
  });

  // Test 27: mkdir triggers implementation phase
  test("mkdir command triggers implementation phase", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId);
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });

    await harness.simulateToolExecution(
      "bash",
      { command: "mkdir -p src/components" },
      { stdout: "", exitCode: 0 }
    );

    expect(workflowEngine.getCurrentPhase(harness.sessionId)).toBe("implementation");

    harness.cleanup();
  });

  // Test 28: git status triggers exploration phase
  test("git status command triggers exploration phase", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId);

    await harness.simulateToolExecution(
      "bash",
      { command: "git status" },
      { stdout: "On branch main", exitCode: 0 }
    );

    expect(workflowEngine.getCurrentPhase(harness.sessionId)).toBe("exploration");

    harness.cleanup();
  });

  // Test 29: cat command triggers exploration phase
  test("cat command triggers exploration phase", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId);

    await harness.simulateToolExecution(
      "bash",
      { command: "cat package.json" },
      { stdout: '{"name": "test"}', exitCode: 0 }
    );

    expect(workflowEngine.getCurrentPhase(harness.sessionId)).toBe("exploration");

    harness.cleanup();
  });

  // Test 30: ls command triggers exploration phase
  test("ls command triggers exploration phase", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId);

    await harness.simulateToolExecution(
      "bash",
      { command: "ls -la src/" },
      { stdout: "total 0", exitCode: 0 }
    );

    expect(workflowEngine.getCurrentPhase(harness.sessionId)).toBe("exploration");

    harness.cleanup();
  });

  // Test 31: pip install triggers implementation phase
  test("pip install command triggers implementation phase", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId);
    await harness.simulateToolExecution("read", { path: "/test.py" }, { content: "test" });

    await harness.simulateToolExecution(
      "bash",
      { command: "pip install requests" },
      { stdout: "Successfully installed requests", exitCode: 0 }
    );

    expect(workflowEngine.getCurrentPhase(harness.sessionId)).toBe("implementation");

    harness.cleanup();
  });

  // Test 32: git diff triggers exploration phase
  test("git diff command triggers exploration phase", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId);

    await harness.simulateToolExecution(
      "bash",
      { command: "git diff HEAD~1" },
      { stdout: "diff --git a/file.ts b/file.ts", exitCode: 0 }
    );

    expect(workflowEngine.getCurrentPhase(harness.sessionId)).toBe("exploration");

    harness.cleanup();
  });

  // Test 33: npm run triggers implementation phase
  test("npm run command triggers implementation phase", async () => {
    const harness = await createInitializedHarness();

    workflowEngine.startWorkflow(harness.sessionId);
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });

    await harness.simulateToolExecution(
      "bash",
      { command: "npm run dev" },
      { stdout: "Server started", exitCode: 0 }
    );

    expect(workflowEngine.getCurrentPhase(harness.sessionId)).toBe("implementation");

    harness.cleanup();
  });
});
