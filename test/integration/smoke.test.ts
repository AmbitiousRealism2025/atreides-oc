import { describe, expect, test, afterEach } from "bun:test";
import { createTestHarness, createInitializedHarness, getSampleProjectPath } from "./harness.js";
import { workflowEngine } from "../../src/plugin/managers/workflow-engine.js";

describe("Smoke Tests: Plugin Loading", () => {
  test("plugin loads successfully with default config", async () => {
    const harness = await createTestHarness();
    expect(harness.hooks).toBeDefined();
    expect(typeof harness.hooks.event).toBe("function");
    expect(typeof harness.hooks.stop).toBe("function");
    expect(typeof harness.hooks["tool.execute.before"]).toBe("function");
    expect(typeof harness.hooks["tool.execute.after"]).toBe("function");
    expect(typeof harness.hooks["experimental.chat.system.transform"]).toBe("function");
    expect(typeof harness.hooks["experimental.session.compacting"]).toBe("function");
    harness.cleanup();
  });

  test("plugin loads with sample project fixture", async () => {
    const harness = await createTestHarness({
      projectPath: getSampleProjectPath(),
    });
    expect(harness.hooks).toBeDefined();
    harness.cleanup();
  });

  test("session can be created and deleted", async () => {
    const harness = await createTestHarness();
    
    await harness.simulateSessionCreate();
    await harness.simulateSessionDelete();
    
    harness.cleanup();
  });

  test("tool execution can be simulated", async () => {
    const harness = await createInitializedHarness();
    
    await harness.simulateToolExecution(
      "read",
      { path: "/test/file.ts" },
      { content: "file content" }
    );
    
    harness.cleanup();
  });

  test("system transform hook returns modified prompt", async () => {
    const harness = await createInitializedHarness();
    
    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: "You are an AI assistant.",
      sessionId: harness.sessionId,
    });
    
    expect(result.system).toContain("You are an AI assistant.");
    harness.cleanup();
  });

  test("compaction hook preserves state", async () => {
    const harness = await createInitializedHarness();

    const result = await harness.hooks["experimental.session.compacting"]({
      summary: "Previous conversation...",
      sessionId: harness.sessionId,
    });

    expect(result.summary).toContain("Previous conversation...");
    expect(result.summary).toContain("ATREIDES STATE");
    harness.cleanup();
  });
});

describe("Smoke Tests: Integration Harness", () => {
  test("harness context captures notifications", async () => {
    const harness = await createTestHarness();

    harness.context.client.notify?.("test.event", { data: "test" });

    expect(harness.context.notifications.length).toBe(1);
    expect(harness.context.notifications[0]?.event).toBe("test.event");
    harness.cleanup();
  });

  test("harness context captures logs", async () => {
    const harness = await createTestHarness();

    harness.context.client.log?.("info", "test message", { key: "value" });

    expect(harness.context.logs.length).toBe(1);
    expect(harness.context.logs[0]?.message).toBe("test message");
    harness.cleanup();
  });

  test("harness context captures shell commands", async () => {
    const harness = await createTestHarness();

    await harness.context.$("echo test");

    expect(harness.context.shellCommands.length).toBe(1);
    expect(harness.context.shellCommands[0]).toBe("echo test");
    harness.cleanup();
  });
});

describe("Integration Tests: WorkflowEngine Hook Integration", () => {
  test("tool.execute.after updates workflow phase on read", async () => {
    const harness = await createInitializedHarness();

    // Start the workflow first (transition to intent)
    workflowEngine.startWorkflow(harness.sessionId);

    // Simulate a read tool execution
    await harness.simulateToolExecution(
      "read",
      { path: "/test/file.ts" },
      { content: "file content" }
    );

    // Check that phase transitioned to exploration
    const currentPhase = workflowEngine.getCurrentPhase(harness.sessionId);
    expect(currentPhase).toBe("exploration");

    harness.cleanup();
  });

  test("tool.execute.after updates workflow phase on edit", async () => {
    const harness = await createInitializedHarness();

    // Set up the session in exploration phase
    workflowEngine.startWorkflow(harness.sessionId);
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });

    // Simulate an edit tool execution
    await harness.simulateToolExecution(
      "edit",
      { path: "/test/file.ts", content: "new content" },
      { success: true }
    );

    // Check that phase transitioned to implementation
    const currentPhase = workflowEngine.getCurrentPhase(harness.sessionId);
    expect(currentPhase).toBe("implementation");

    harness.cleanup();
  });

  test("tool.execute.after updates workflow phase on test command", async () => {
    const harness = await createInitializedHarness();

    // Set up the session in implementation phase
    workflowEngine.startWorkflow(harness.sessionId);
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });
    await harness.simulateToolExecution("edit", { path: "/test.ts" }, { success: true });

    // Simulate a bash test command
    await harness.simulateToolExecution(
      "bash",
      { command: "npm test" },
      { stdout: "All tests passed", exitCode: 0 }
    );

    // Check that phase transitioned to verification
    const currentPhase = workflowEngine.getCurrentPhase(harness.sessionId);
    expect(currentPhase).toBe("verification");

    harness.cleanup();
  });

  test("phase history tracks all transitions", async () => {
    const harness = await createInitializedHarness();

    // Start workflow and go through multiple phases
    workflowEngine.startWorkflow(harness.sessionId);
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });
    await harness.simulateToolExecution("edit", { path: "/test.ts" }, { success: true });
    await harness.simulateToolExecution("bash", { command: "npm test" }, { exitCode: 0 });

    // Check phase history
    const history = workflowEngine.getPhaseHistory(harness.sessionId);
    expect(history.length).toBeGreaterThanOrEqual(4);

    harness.cleanup();
  });

  test("system.transform includes phase guidance", async () => {
    const harness = await createInitializedHarness();

    // Set up the session in exploration phase
    workflowEngine.startWorkflow(harness.sessionId);
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });

    // Call the system transform hook
    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: "You are an AI assistant.",
      sessionId: harness.sessionId,
    });

    // Check that phase guidance is included
    expect(result.system).toContain("EXPLORATION");

    harness.cleanup();
  });

  test("system.transform includes intent guidance when classified", async () => {
    const harness = await createInitializedHarness();

    // Start workflow with a message that classifies as bugfix
    workflowEngine.startWorkflow(harness.sessionId, "Fix the authentication bug");
    await harness.simulateToolExecution("read", { path: "/auth.ts" }, { content: "test" });

    // Call the system transform hook
    const result = await harness.hooks["experimental.chat.system.transform"]({
      system: "You are an AI assistant.",
      sessionId: harness.sessionId,
    });

    // Check that bugfix guidance is included
    expect(result.system).toContain("BUGFIX");

    harness.cleanup();
  });

  test("compaction preserves workflow state", async () => {
    const harness = await createInitializedHarness();

    // Set up some workflow state
    workflowEngine.startWorkflow(harness.sessionId, "Add a new feature");
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });
    await harness.simulateToolExecution("edit", { path: "/test.ts" }, { success: true });

    // Call the compaction hook
    const result = await harness.hooks["experimental.session.compacting"]({
      summary: "Previous conversation...",
      sessionId: harness.sessionId,
    });

    // Check that workflow state is preserved (using new markdown format)
    expect(result.summary).toContain("**Workflow Phase:** implementation");
    expect(result.summary).toContain("**Intent:** feature");

    harness.cleanup();
  });

  test("stop hook allows stop even if workflow incomplete", async () => {
    const harness = await createInitializedHarness();

    // Start workflow but don't complete it
    workflowEngine.startWorkflow(harness.sessionId);
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });

    // Call the stop hook
    const result = await harness.hooks.stop({
      sessionId: harness.sessionId,
    });

    // Stop should be allowed (workflow completion doesn't block)
    expect(result.allow).toBe(true);

    harness.cleanup();
  });

  test("workflow reset clears all state", async () => {
    const harness = await createInitializedHarness();

    // Set up some workflow state
    workflowEngine.startWorkflow(harness.sessionId, "Add a new feature");
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });

    // Reset the workflow
    workflowEngine.resetWorkflow(harness.sessionId);

    // Check that state is reset
    const phase = workflowEngine.getCurrentPhase(harness.sessionId);
    const history = workflowEngine.getPhaseHistory(harness.sessionId);
    const state = workflowEngine.getWorkflowState(harness.sessionId);

    expect(phase).toBe("idle");
    expect(history.length).toBe(0);
    expect(state?.intentClassification).toBeUndefined();

    harness.cleanup();
  });
});
