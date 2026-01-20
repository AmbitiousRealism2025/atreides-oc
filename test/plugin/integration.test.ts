import { describe, expect, test, beforeEach } from "bun:test";
import {
  AtreidesPlugin,
  getSessionState,
  getAllSessions,
  clearSessions,
  SessionManager,
} from "../../src/plugin/index";
import type { PluginContext } from "../../src/plugin/types";

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

describe("Integration: Session Lifecycle with OpenCode Events", () => {
  beforeEach(() => {
    clearSessions();
  });

  test("full session lifecycle: create -> activity -> delete", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    expect(SessionManager.getSessionCount()).toBe(0);

    await hooks.event({ type: "session.created", sessionId: "lifecycle-test" });
    expect(SessionManager.getSessionCount()).toBe(1);
    expect(SessionManager.hasSession("lifecycle-test")).toBe(true);

    const initialState = getSessionState("lifecycle-test");
    expect(initialState).toBeDefined();
    expect(initialState?.phase).toBe("idle");
    const initialTimestamp = initialState?.lastActivityAt.getTime();

    await new Promise((r) => setTimeout(r, 10));

    await hooks.event({ type: "session.idle", sessionId: "lifecycle-test" });
    const updatedState = getSessionState("lifecycle-test");
    expect(updatedState?.lastActivityAt.getTime()).toBeGreaterThan(initialTimestamp!);

    await hooks.event({ type: "session.deleted", sessionId: "lifecycle-test" });
    expect(SessionManager.getSessionCount()).toBe(0);
    expect(SessionManager.hasSession("lifecycle-test")).toBe(false);
    expect(getSessionState("lifecycle-test")).toBeUndefined();
  });

  test("multiple sessions can exist concurrently", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    await hooks.event({ type: "session.created", sessionId: "session-a" });
    await hooks.event({ type: "session.created", sessionId: "session-b" });
    await hooks.event({ type: "session.created", sessionId: "session-c" });

    expect(SessionManager.getSessionCount()).toBe(3);

    const stateA = getSessionState("session-a");
    const stateB = getSessionState("session-b");
    const stateC = getSessionState("session-c");

    expect(stateA?.sessionId).toBe("session-a");
    expect(stateB?.sessionId).toBe("session-b");
    expect(stateC?.sessionId).toBe("session-c");

    await hooks.event({ type: "session.deleted", sessionId: "session-b" });

    expect(SessionManager.getSessionCount()).toBe(2);
    expect(getSessionState("session-a")).toBeDefined();
    expect(getSessionState("session-b")).toBeUndefined();
    expect(getSessionState("session-c")).toBeDefined();
  });

  test("state persists across multiple hook calls within same session", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    await hooks.event({ type: "session.created", sessionId: "persist-test" });

    await hooks["tool.execute.after"]({
      tool: "read",
      input: {},
      output: { content: "file content" },
      sessionId: "persist-test",
    });

    await hooks["tool.execute.after"]({
      tool: "bash",
      input: { command: "ls" },
      output: { error: "command failed", exitCode: 1 },
      sessionId: "persist-test",
    });

    await hooks["tool.execute.after"]({
      tool: "write",
      input: {},
      output: {},
      sessionId: "persist-test",
    });

    const state = getSessionState("persist-test");
    expect(state?.toolHistory.length).toBe(3);
    expect(state?.toolHistory[0]?.tool).toBe("read");
    expect(state?.toolHistory[1]?.tool).toBe("bash");
    expect(state?.toolHistory[2]?.tool).toBe("write");
  });

  test("no memory leak after session deletion", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    for (let i = 0; i < 50; i++) {
      await hooks.event({ type: "session.created", sessionId: `temp-${i}` });
    }

    expect(SessionManager.getSessionCount()).toBe(50);

    for (let i = 0; i < 50; i++) {
      await hooks.event({ type: "session.deleted", sessionId: `temp-${i}` });
    }

    expect(SessionManager.getSessionCount()).toBe(0);
    expect(getAllSessions().size).toBe(0);
  });

  test("deleting non-existent session is safe", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    await expect(
      hooks.event({ type: "session.deleted", sessionId: "nonexistent" })
    ).resolves.toBeUndefined();

    expect(SessionManager.getSessionCount()).toBe(0);
  });
});

describe("Integration: Tool Hooks with Session State", () => {
  beforeEach(() => {
    clearSessions();
  });

  test("tool.execute.before updates session activity", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    await hooks.event({ type: "session.created", sessionId: "tool-before-test" });
    const initialState = getSessionState("tool-before-test");
    const initialTime = initialState?.lastActivityAt.getTime();

    await new Promise((r) => setTimeout(r, 10));

    await hooks["tool.execute.before"]({
      tool: "read",
      input: { path: "/test" },
      sessionId: "tool-before-test",
    });

    const updatedState = getSessionState("tool-before-test");
    expect(updatedState?.lastActivityAt.getTime()).toBeGreaterThan(initialTime!);
  });

  test("tool.execute.after tracks errors via 3-strikes protocol", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    await hooks.event({ type: "session.created", sessionId: "strikes-test" });

    await hooks["tool.execute.after"]({
      tool: "bash",
      input: {},
      output: { error: "failed", exitCode: 1 },
      sessionId: "strikes-test",
    });
    expect(getSessionState("strikes-test")?.errorCount).toBe(1);

    await hooks["tool.execute.after"]({
      tool: "bash",
      input: {},
      output: { error: "failed again", exitCode: 1 },
      sessionId: "strikes-test",
    });
    expect(getSessionState("strikes-test")?.errorCount).toBe(2);

    await hooks["tool.execute.after"]({
      tool: "read",
      input: {},
      output: { content: "success" },
      sessionId: "strikes-test",
    });
    expect(getSessionState("strikes-test")?.errorCount).toBe(0);
  });

  test("todowrite tool updates todo tracking", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    await hooks.event({ type: "session.created", sessionId: "todo-test" });

    await hooks["tool.execute.after"]({
      tool: "todowrite",
      input: {},
      output: {
        todos: [
          { id: "1", status: "pending" },
          { id: "2", status: "completed" },
          { id: "3", status: "in_progress" },
        ],
      },
      sessionId: "todo-test",
    });

    const state = getSessionState("todo-test");
    expect(state?.todosCreated).toBe(true);
    expect(state?.todoCount).toBe(3);
    expect(state?.todosCompleted).toBe(1);
  });
});

describe("Integration: System Transform with Session State", () => {
  beforeEach(() => {
    clearSessions();
  });

  test("system transform includes workflow phase when not idle", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    await hooks.event({ type: "session.created", sessionId: "transform-phase" });
    SessionManager.setPhase("transform-phase", "implementation");

    const result = await hooks["experimental.chat.system.transform"]({
      system: "Base system prompt",
      sessionId: "transform-phase",
    });

    expect(result.system).toContain("WORKFLOW PHASE");
    expect(result.system).toContain("IMPLEMENTATION");
  });

  test("system transform includes error count when > 0", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    await hooks.event({ type: "session.created", sessionId: "transform-error" });
    SessionManager.incrementErrorCount("transform-error");
    SessionManager.incrementErrorCount("transform-error");

    const result = await hooks["experimental.chat.system.transform"]({
      system: "Base system prompt",
      sessionId: "transform-error",
    });

    expect(result.system).toContain("ERROR RECOVERY");
    expect(result.system).toContain("2/3");
  });
});

describe("Integration: Compaction with Session State", () => {
  beforeEach(() => {
    clearSessions();
  });

  test("compaction preserves critical session state", async () => {
    const context = createMockContext();
    const hooks = await AtreidesPlugin(context);

    await hooks.event({ type: "session.created", sessionId: "compact-test" });
    SessionManager.setPhase("compact-test", "verification");
    SessionManager.updateTodos("compact-test", 5, 3);

    const result = await hooks["experimental.session.compacting"]({
      summary: "Previous work done...",
      sessionId: "compact-test",
    });

    expect(result.summary).toContain("Previous work done...");
    expect(result.summary).toContain("ATREIDES STATE");
    expect(result.summary).toContain("**Workflow Phase:** verification");
    expect(result.summary).toContain("**Todo Progress:** 3/5 completed");
  });
});
