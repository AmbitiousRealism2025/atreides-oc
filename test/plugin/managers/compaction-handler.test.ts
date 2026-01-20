import { describe, expect, test, beforeEach } from "bun:test";
import {
  CompactionHandler,
  createCompactionHandler,
  compactionHandler,
  type PendingTodo,
  type PreservedState,
} from "../../../src/plugin/managers/compaction-handler";
import * as SessionManager from "../../../src/plugin/managers/session-manager";
import type { Config } from "../../../src/lib/config";

function createMockConfig(): Config {
  return {
    identity: {
      personaName: "TestPersona",
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
  };
}

describe("CompactionHandler - State Serialization", () => {
  beforeEach(() => {
    SessionManager.clearSessions();
    SessionManager.setDefaultConfig(createMockConfig());
  });

  test("serializes workflow phase", async () => {
    const handler = createCompactionHandler();
    const sessionId = "test-session";

    SessionManager.getState(sessionId);
    SessionManager.setPhase(sessionId, "implementation");

    const markdown = await handler.preserveState(sessionId);

    expect(markdown).toContain("**Workflow Phase:** implementation");
  });

  test("serializes pending todos with descriptions", async () => {
    const handler = createCompactionHandler();
    const sessionId = "test-session";

    SessionManager.getState(sessionId);

    handler.storePendingTodos(sessionId, [
      { id: "1", content: "Update tests", status: "pending" },
      { id: "2", content: "Fix bug", status: "in_progress" },
      { id: "3", content: "Done task", status: "completed" },
    ]);

    const markdown = await handler.preserveState(sessionId);

    expect(markdown).toContain("**Pending Todos:** 2");
    expect(markdown).toContain("[ ] Update tests");
    expect(markdown).toContain("[-] Fix bug");
    expect(markdown).not.toContain("Done task");
  });

  test("serializes strike counter", async () => {
    const handler = createCompactionHandler();
    const sessionId = "test-session";

    SessionManager.getState(sessionId);
    SessionManager.incrementErrorCount(sessionId);
    SessionManager.incrementErrorCount(sessionId);

    const markdown = await handler.preserveState(sessionId);

    expect(markdown).toContain("**Error Recovery:** 2 strikes");
  });

  test("handles singular strike text correctly", async () => {
    const handler = createCompactionHandler();
    const sessionId = "test-session";

    SessionManager.getState(sessionId);
    SessionManager.incrementErrorCount(sessionId);

    const markdown = await handler.preserveState(sessionId);

    expect(markdown).toContain("**Error Recovery:** 1 strike");
    expect(markdown).not.toContain("1 strikes");
  });

  test("serializes recent tool history (last 10)", async () => {
    const handler = createCompactionHandler();
    const sessionId = "test-session";

    SessionManager.getState(sessionId);

    // Add 15 tool executions
    for (let i = 0; i < 15; i++) {
      SessionManager.addToolExecution(sessionId, {
        tool: `tool-${i}`,
        timestamp: new Date(),
        success: i % 2 === 0,
      });
    }

    const markdown = await handler.preserveState(sessionId);

    expect(markdown).toContain("**Recent Tool History:**");
    // Should only include last 10 (tools 5-14)
    expect(markdown).not.toContain("tool-4");
    expect(markdown).toContain("tool-5");
    expect(markdown).toContain("tool-14");
    // Check success indicators
    expect(markdown).toContain("(✓)");
    expect(markdown).toContain("(✗)");
  });

  test("includes intent classification when present", async () => {
    const handler = createCompactionHandler();
    const sessionId = "test-session";

    const state = SessionManager.getState(sessionId);
    state.workflow.intentClassification = "feature";

    const markdown = await handler.preserveState(sessionId);

    expect(markdown).toContain("**Intent:** feature");
  });

  test("includes persona name when provided", async () => {
    const handler = createCompactionHandler();
    const sessionId = "test-session";

    SessionManager.getState(sessionId);

    const markdown = await handler.preserveState(sessionId, "Muad'Dib");

    expect(markdown).toContain("**Identity:** Muad'Dib");
  });
});

describe("CompactionHandler - Markdown Formatting", () => {
  beforeEach(() => {
    SessionManager.clearSessions();
    SessionManager.setDefaultConfig(createMockConfig());
  });

  test("formats state as valid markdown with delimiters", async () => {
    const handler = createCompactionHandler();
    const sessionId = "test-session";

    SessionManager.getState(sessionId);

    const markdown = await handler.preserveState(sessionId);

    expect(markdown).toContain("<!-- ATREIDES STATE -->");
    expect(markdown).toContain("<!-- END ATREIDES STATE -->");
    expect(markdown).toContain("---");
  });

  test("formatAsMarkdown produces consistent output", () => {
    const handler = createCompactionHandler();

    const state: PreservedState = {
      workflowPhase: "verification",
      intentClassification: "bugfix",
      pendingTodos: [
        { id: "1", description: "Review changes", status: "pending" },
      ],
      strikeCount: 1,
      recentTools: [
        { tool: "read", success: true },
        { tool: "bash", success: false },
      ],
      totalTodos: 5,
      completedTodos: 4,
      personaName: "TestAgent",
    };

    const markdown = handler.formatAsMarkdown(state);

    expect(markdown).toContain("**Workflow Phase:** verification");
    expect(markdown).toContain("**Intent:** bugfix");
    expect(markdown).toContain("[ ] Review changes");
    expect(markdown).toContain("**Todo Progress:** 4/5 completed");
    expect(markdown).toContain("**Error Recovery:** 1 strike");
    expect(markdown).toContain("- read (✓)");
    expect(markdown).toContain("- bash (✗)");
    expect(markdown).toContain("**Identity:** TestAgent");
  });

  test("handles empty tool history gracefully", () => {
    const handler = createCompactionHandler();

    const state: PreservedState = {
      workflowPhase: "idle",
      pendingTodos: [],
      strikeCount: 0,
      recentTools: [],
      totalTodos: 0,
      completedTodos: 0,
    };

    const markdown = handler.formatAsMarkdown(state);

    expect(markdown).not.toContain("**Recent Tool History:**");
  });

  test("handles empty pending todos gracefully", () => {
    const handler = createCompactionHandler();

    const state: PreservedState = {
      workflowPhase: "implementation",
      pendingTodos: [],
      strikeCount: 0,
      recentTools: [],
      totalTodos: 0,
      completedTodos: 0,
    };

    const markdown = handler.formatAsMarkdown(state);

    expect(markdown).toContain("**Pending Todos:** 0");
    expect(markdown).not.toContain("[ ]");
    expect(markdown).not.toContain("[-]");
  });
});

describe("CompactionHandler - Integration with Hook", () => {
  beforeEach(() => {
    SessionManager.clearSessions();
    SessionManager.setDefaultConfig(createMockConfig());
  });

  test("preserveState returns fallback on missing session", async () => {
    const handler = createCompactionHandler();

    const markdown = await handler.preserveState("nonexistent");

    expect(markdown).toContain("state preservation failed");
    expect(markdown).toContain("session not found");
  });

  test("preserveStateWithResult returns detailed result", async () => {
    const handler = createCompactionHandler();
    const sessionId = "test-session";

    SessionManager.getState(sessionId);
    SessionManager.setPhase(sessionId, "exploration");
    SessionManager.incrementErrorCount(sessionId);

    const result = await handler.preserveStateWithResult(sessionId, "TestPersona");

    expect(result.success).toBe(true);
    expect(result.state).toBeDefined();
    expect(result.state?.workflowPhase).toBe("exploration");
    expect(result.state?.strikeCount).toBe(1);
    expect(result.state?.personaName).toBe("TestPersona");
    expect(result.durationMs).toBeLessThan(100);
  });

  test("preserveStateWithResult returns error on missing session", async () => {
    const handler = createCompactionHandler();

    const result = await handler.preserveStateWithResult("nonexistent");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Session not found");
    expect(result.state).toBeUndefined();
  });
});

describe("CompactionHandler - Error Handling", () => {
  beforeEach(() => {
    SessionManager.clearSessions();
    SessionManager.setDefaultConfig(createMockConfig());
  });

  test("handles malformed todo data gracefully", () => {
    const handler = createCompactionHandler();
    const sessionId = "test-session";

    SessionManager.getState(sessionId);

    // Store todos with missing fields
    handler.storePendingTodos(sessionId, [
      { status: "pending" }, // missing id, content, description
      { id: "2", status: "in_progress" }, // missing content/description
    ]);

    const todos = handler.getPendingTodos(sessionId);

    expect(todos.length).toBe(2);
    expect(todos[0].description).toBe("No description");
    expect(todos[1].description).toBe("No description");
  });

  test("storePendingTodos filters out completed todos", () => {
    const handler = createCompactionHandler();
    const sessionId = "test-session";

    SessionManager.getState(sessionId);

    handler.storePendingTodos(sessionId, [
      { id: "1", content: "Task 1", status: "completed" },
      { id: "2", content: "Task 2", status: "pending" },
      { id: "3", content: "Task 3", status: "in_progress" },
    ]);

    const todos = handler.getPendingTodos(sessionId);

    expect(todos.length).toBe(2);
    expect(todos[0].id).toBe("2");
    expect(todos[1].id).toBe("3");
  });

  test("clearSessionTodos removes stored todos", () => {
    const handler = createCompactionHandler();
    const sessionId = "test-session";

    handler.storePendingTodos(sessionId, [
      { id: "1", content: "Task 1", status: "pending" },
    ]);

    expect(handler.getPendingTodos(sessionId).length).toBe(1);

    handler.clearSessionTodos(sessionId);

    expect(handler.getPendingTodos(sessionId).length).toBe(0);
  });
});

describe("CompactionHandler - Performance", () => {
  beforeEach(() => {
    SessionManager.clearSessions();
    SessionManager.setDefaultConfig(createMockConfig());
  });

  test("preserveState completes in <10ms", async () => {
    const handler = createCompactionHandler();
    const sessionId = "perf-test";

    const state = SessionManager.getState(sessionId);
    SessionManager.setPhase(sessionId, "implementation");

    // Add substantial data
    handler.storePendingTodos(sessionId, Array(20).fill(null).map((_, i) => ({
      id: `${i}`,
      content: `Task ${i} with a reasonably long description`,
      status: i % 2 === 0 ? "pending" : "in_progress",
    })));

    for (let i = 0; i < 50; i++) {
      SessionManager.addToolExecution(sessionId, {
        tool: `tool-${i}`,
        timestamp: new Date(),
        success: true,
        durationMs: 100,
      });
    }

    const result = await handler.preserveStateWithResult(sessionId, "Muad'Dib");

    expect(result.success).toBe(true);
    expect(result.durationMs).toBeLessThan(10);
  });

  test("handles large tool history efficiently", async () => {
    const handler = createCompactionHandler();
    const sessionId = "large-history";

    SessionManager.getState(sessionId);

    // Add 1000 tool executions
    for (let i = 0; i < 1000; i++) {
      SessionManager.addToolExecution(sessionId, {
        tool: `tool-${i}`,
        timestamp: new Date(),
        success: true,
      });
    }

    const start = performance.now();
    const markdown = await handler.preserveState(sessionId);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(10);
    // Should only include last 10 tools
    expect(markdown).toContain("tool-999");
    expect(markdown).toContain("tool-990");
    expect(markdown).not.toContain("tool-989");
  });
});

describe("CompactionHandler - Singleton and Factory", () => {
  test("compactionHandler is a singleton", () => {
    expect(compactionHandler).toBeDefined();
    expect(compactionHandler).toBeInstanceOf(CompactionHandler);
  });

  test("createCompactionHandler creates new instances", () => {
    const handler1 = createCompactionHandler();
    const handler2 = createCompactionHandler();

    expect(handler1).toBeInstanceOf(CompactionHandler);
    expect(handler2).toBeInstanceOf(CompactionHandler);
    expect(handler1).not.toBe(handler2);
  });

  test("separate instances have isolated todo storage", () => {
    const handler1 = createCompactionHandler();
    const handler2 = createCompactionHandler();

    handler1.storePendingTodos("session", [
      { id: "1", content: "Task from handler 1", status: "pending" },
    ]);

    expect(handler1.getPendingTodos("session").length).toBe(1);
    expect(handler2.getPendingTodos("session").length).toBe(0);
  });
});

describe("CompactionHandler - extractPreservedState", () => {
  beforeEach(() => {
    SessionManager.clearSessions();
    SessionManager.setDefaultConfig(createMockConfig());
  });

  test("extracts all fields from session state", () => {
    const handler = createCompactionHandler();
    const sessionId = "extract-test";

    const state = SessionManager.getState(sessionId);
    state.workflow.currentPhase = "verification";
    state.workflow.intentClassification = "refactor";
    state.errorCount = 2;
    state.todoCount = 5;
    state.todosCompleted = 3;

    handler.storePendingTodos(sessionId, [
      { id: "1", content: "Remaining task", status: "pending" },
    ]);

    SessionManager.addToolExecution(sessionId, {
      tool: "read",
      timestamp: new Date(),
      success: true,
    });

    const preserved = handler.extractPreservedState(state, "TestAgent");

    expect(preserved.workflowPhase).toBe("verification");
    expect(preserved.intentClassification).toBe("refactor");
    expect(preserved.strikeCount).toBe(2);
    expect(preserved.totalTodos).toBe(5);
    expect(preserved.completedTodos).toBe(3);
    expect(preserved.pendingTodos.length).toBe(1);
    expect(preserved.recentTools.length).toBe(1);
    expect(preserved.personaName).toBe("TestAgent");
  });
});
