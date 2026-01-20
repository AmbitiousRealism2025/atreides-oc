import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  AtreidesPlugin,
  getSessionState,
  getAllSessions,
  clearSessions,
} from "../../src/plugin/index";
import type { PluginContext } from "../../src/plugin/types";
import { wrapHook } from "../../src/plugin/utils";

function createMockContext(): PluginContext {
  return {
    project: { path: "/test/project", name: "test-project" },
    client: {
      notify: () => {},
      log: () => {},
    },
    $: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
    directory: "/test/project",
    worktree: undefined,
  };
}

describe("AtreidesPlugin", () => {
  beforeEach(() => {
    clearSessions();
  });

  afterEach(() => {
    clearSessions();
  });

  test("plugin function returns valid hooks object", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    expect(hooks).toBeDefined();
    expect(typeof hooks.event).toBe("function");
    expect(typeof hooks.stop).toBe("function");
    expect(typeof hooks["tool.execute.before"]).toBe("function");
    expect(typeof hooks["tool.execute.after"]).toBe("function");
    expect(typeof hooks["experimental.chat.system.transform"]).toBe("function");
    expect(typeof hooks["experimental.session.compacting"]).toBe("function");
  });

  test("plugin receives and uses context correctly", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    expect(hooks).toBeDefined();
  });
});

describe("Event Hook", () => {
  beforeEach(() => {
    clearSessions();
  });

  test("session.created initializes session state", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    await hooks.event({ type: "session.created", sessionId: "test-session-1" });

    const state = getSessionState("test-session-1");
    expect(state).toBeDefined();
    expect(state?.sessionId).toBe("test-session-1");
    expect(state?.phase).toBe("idle");
    expect(state?.errorCount).toBe(0);
  });

  test("session.deleted cleans up session state", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    await hooks.event({ type: "session.created", sessionId: "test-session-2" });
    expect(getSessionState("test-session-2")).toBeDefined();

    await hooks.event({ type: "session.deleted", sessionId: "test-session-2" });
    expect(getSessionState("test-session-2")).toBeUndefined();
  });

  test("session.idle updates last activity timestamp", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    await hooks.event({ type: "session.created", sessionId: "test-session-3" });
    const initialState = getSessionState("test-session-3");
    const initialTimestamp = initialState?.lastActivityAt;

    await new Promise((r) => setTimeout(r, 10));

    await hooks.event({ type: "session.idle", sessionId: "test-session-3" });
    const updatedState = getSessionState("test-session-3");

    expect(updatedState?.lastActivityAt.getTime()).toBeGreaterThanOrEqual(
      initialTimestamp!.getTime()
    );
  });
});

describe("Stop Hook", () => {
  beforeEach(() => {
    clearSessions();
  });

  test("allows stop when no session exists", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    const result = await hooks.stop({ sessionId: "nonexistent" });

    expect(result.allow).toBe(true);
  });

  test("allows stop when no todos pending", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    await hooks.event({ type: "session.created", sessionId: "test-stop-1" });
    const result = await hooks.stop({ sessionId: "test-stop-1" });

    expect(result.allow).toBe(true);
  });
});

describe("Tool Execute Hooks", () => {
  beforeEach(() => {
    clearSessions();
  });

  test("tool.execute.before allows execution by default", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    const result = await hooks["tool.execute.before"]({
      tool: "read",
      input: { path: "/test" },
      sessionId: "test-tool-1",
    });

    expect(result.allow).toBe(true);
  });

  test("tool.execute.after tracks tool history", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    await hooks.event({ type: "session.created", sessionId: "test-tool-2" });

    await hooks["tool.execute.after"]({
      tool: "read",
      input: { path: "/test" },
      output: { content: "file content" },
      sessionId: "test-tool-2",
    });

    const state = getSessionState("test-tool-2");
    expect(state?.toolHistory.length).toBe(1);
    expect(state?.toolHistory[0]?.tool).toBe("read");
    expect(state?.toolHistory[0]?.success).toBe(true);
  });

  test("tool.execute.after detects errors and increments counter", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    await hooks.event({ type: "session.created", sessionId: "test-tool-3" });

    await hooks["tool.execute.after"]({
      tool: "bash",
      input: { command: "failing-command" },
      output: { error: "command not found", exitCode: 1 },
      sessionId: "test-tool-3",
    });

    const state = getSessionState("test-tool-3");
    expect(state?.errorCount).toBe(1);
    expect(state?.toolHistory[0]?.success).toBe(false);
  });

  test("todowrite updates todo tracking", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    await hooks.event({ type: "session.created", sessionId: "test-todo-1" });

    await hooks["tool.execute.after"]({
      tool: "todowrite",
      input: {},
      output: {
        todos: [
          { id: "1", status: "pending" },
          { id: "2", status: "completed" },
          { id: "3", status: "pending" },
        ],
      },
      sessionId: "test-todo-1",
    });

    const state = getSessionState("test-todo-1");
    expect(state?.todosCreated).toBe(true);
    expect(state?.todoCount).toBe(3);
    expect(state?.todosCompleted).toBe(1);
  });
});

describe("System Transform Hook", () => {
  beforeEach(() => {
    clearSessions();
  });

  test("injects identity into system prompt", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    const result = await hooks["experimental.chat.system.transform"]({
      system: "You are an AI assistant.",
      sessionId: "test-transform-1",
    });

    expect(result.system).toContain("Muad'Dib");
  });

  test("preserves original system prompt content", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    const original = "You are an AI assistant with special capabilities.";
    const result = await hooks["experimental.chat.system.transform"]({
      system: original,
      sessionId: "test-transform-2",
    });

    expect(result.system).toContain(original);
  });
});

describe("Compaction Hook", () => {
  beforeEach(() => {
    clearSessions();
  });

  test("preserves session state in compaction summary", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    await hooks.event({ type: "session.created", sessionId: "test-compact-1" });

    const result = await hooks["experimental.session.compacting"]({
      summary: "Previous conversation summary...",
      sessionId: "test-compact-1",
    });

    expect(result.summary).toContain("Previous conversation summary...");
    expect(result.summary).toContain("ATREIDES STATE");
    expect(result.summary).toContain("**Workflow Phase:** idle");
  });

  test("returns original summary when session not found", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    const original = "Original summary content";
    const result = await hooks["experimental.session.compacting"]({
      summary: original,
      sessionId: "nonexistent",
    });

    expect(result.summary).toBe(original);
  });
});

describe("Error Boundary (wrapHook)", () => {
  test("catches errors and returns safe default for stop hook", async () => {
    const throwingHandler = async () => {
      throw new Error("Intentional test error");
    };

    const wrapped = wrapHook("stop", throwingHandler);
    const result = await wrapped({ sessionId: "test" });

    expect(result).toEqual({ allow: true });
  });

  test("catches errors and returns safe default for tool.execute.before", async () => {
    const throwingHandler = async () => {
      throw new Error("Intentional test error");
    };

    const wrapped = wrapHook("tool.execute.before", throwingHandler);
    const result = await wrapped({
      tool: "test",
      input: {},
      sessionId: "test",
    });

    expect(result).toEqual({ allow: true });
  });

  test("catches errors and preserves system prompt for transform hook", async () => {
    const throwingHandler = async () => {
      throw new Error("Intentional test error");
    };

    const wrapped = wrapHook("experimental.chat.system.transform", throwingHandler);
    const result = await wrapped({
      system: "Original system prompt",
      sessionId: "test",
    });

    expect(result.system).toBe("Original system prompt");
  });

  test("passes through successful results unchanged", async () => {
    const successHandler = async () => ({ allow: false, message: "blocked" });

    const wrapped = wrapHook("stop", successHandler);
    const result = await wrapped({ sessionId: "test" });

    expect(result).toEqual({ allow: false, message: "blocked" });
  });
});

describe("Session Management", () => {
  beforeEach(() => {
    clearSessions();
  });

  test("getAllSessions returns copy of sessions map", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    await hooks.event({ type: "session.created", sessionId: "session-1" });
    await hooks.event({ type: "session.created", sessionId: "session-2" });

    const sessions = getAllSessions();
    expect(sessions.size).toBe(2);
    expect(sessions.has("session-1")).toBe(true);
    expect(sessions.has("session-2")).toBe(true);
  });

  test("clearSessions removes all sessions", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    await hooks.event({ type: "session.created", sessionId: "session-1" });
    await hooks.event({ type: "session.created", sessionId: "session-2" });

    clearSessions();

    expect(getAllSessions().size).toBe(0);
  });
});
