import { describe, expect, test, beforeEach } from "bun:test";
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

describe("SessionManager - State Initialization", () => {
  beforeEach(() => {
    SessionManager.clearSessions();
  });

  test("initializeSessionState creates new state with correct defaults", () => {
    const config = createMockConfig();
    const state = SessionManager.initializeSessionState("test-session", config);

    expect(state.sessionId).toBe("test-session");
    expect(state.phase).toBe("idle");
    expect(state.errorCount).toBe(0);
    expect(state.todosCreated).toBe(false);
    expect(state.todoCount).toBe(0);
    expect(state.todosCompleted).toBe(0);
    expect(state.toolHistory).toEqual([]);
    expect(state.metadata).toEqual({});
    expect(state.config).toBe(config);
    expect(state.createdAt).toBeInstanceOf(Date);
    expect(state.lastActivityAt).toBeInstanceOf(Date);
  });

  test("initializeSessionState sets timestamps to current time", () => {
    const before = Date.now();
    const config = createMockConfig();
    const state = SessionManager.initializeSessionState("test-session", config);
    const after = Date.now();

    expect(state.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(state.createdAt.getTime()).toBeLessThanOrEqual(after);
    expect(state.lastActivityAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(state.lastActivityAt.getTime()).toBeLessThanOrEqual(after);
  });
});

describe("SessionManager - State Retrieval", () => {
  beforeEach(() => {
    SessionManager.clearSessions();
  });

  test("getState auto-initializes new session when defaultConfig is set", () => {
    const config = createMockConfig();
    SessionManager.setDefaultConfig(config);

    const state = SessionManager.getState("new-session");

    expect(state).toBeDefined();
    expect(state.sessionId).toBe("new-session");
    expect(SessionManager.hasSession("new-session")).toBe(true);
  });

  test("getState returns existing session without re-initializing", () => {
    const config = createMockConfig();
    SessionManager.setDefaultConfig(config);

    const state1 = SessionManager.getState("existing-session");
    state1.errorCount = 5;

    const state2 = SessionManager.getState("existing-session");

    expect(state2.errorCount).toBe(5);
    expect(state1).toBe(state2);
  });

  test("getState throws when no config available", () => {
    expect(() => SessionManager.getState("orphan-session")).toThrow(
      /no config available/
    );
  });

  test("getState uses provided config over defaultConfig", () => {
    const defaultConfig = createMockConfig();
    defaultConfig.identity.personaName = "Default";
    SessionManager.setDefaultConfig(defaultConfig);

    const overrideConfig = createMockConfig();
    overrideConfig.identity.personaName = "Override";

    const state = SessionManager.getState("override-session", overrideConfig);

    expect(state.config.identity.personaName).toBe("Override");
  });

  test("getStateOrUndefined returns undefined for non-existent session", () => {
    const result = SessionManager.getStateOrUndefined("nonexistent");
    expect(result).toBeUndefined();
  });

  test("getStateOrUndefined returns state for existing session", () => {
    const config = createMockConfig();
    SessionManager.setDefaultConfig(config);
    SessionManager.getState("exists");

    const result = SessionManager.getStateOrUndefined("exists");

    expect(result).toBeDefined();
    expect(result?.sessionId).toBe("exists");
  });
});

describe("SessionManager - State Deletion", () => {
  beforeEach(() => {
    SessionManager.clearSessions();
  });

  test("deleteSession removes existing session", () => {
    const config = createMockConfig();
    SessionManager.setDefaultConfig(config);
    SessionManager.getState("to-delete");

    expect(SessionManager.hasSession("to-delete")).toBe(true);

    const result = SessionManager.deleteSession("to-delete");

    expect(result).toBe(true);
    expect(SessionManager.hasSession("to-delete")).toBe(false);
  });

  test("deleteSession returns false for non-existent session", () => {
    const result = SessionManager.deleteSession("nonexistent");
    expect(result).toBe(false);
  });

  test("clearSessions removes all sessions", () => {
    const config = createMockConfig();
    SessionManager.setDefaultConfig(config);
    SessionManager.getState("session-1");
    SessionManager.getState("session-2");
    SessionManager.getState("session-3");

    expect(SessionManager.getSessionCount()).toBe(3);

    SessionManager.clearSessions();

    expect(SessionManager.getSessionCount()).toBe(0);
  });

  test("clearSessions also clears defaultConfig", () => {
    SessionManager.setDefaultConfig(createMockConfig());
    SessionManager.clearSessions();

    expect(() => SessionManager.getState("new")).toThrow(/no config available/);
  });
});

describe("SessionManager - Concurrent Sessions", () => {
  beforeEach(() => {
    SessionManager.clearSessions();
  });

  test("maintains separate state for multiple concurrent sessions", () => {
    const config = createMockConfig();
    SessionManager.setDefaultConfig(config);

    const state1 = SessionManager.getState("session-1");
    const state2 = SessionManager.getState("session-2");
    const state3 = SessionManager.getState("session-3");

    state1.errorCount = 1;
    state2.errorCount = 2;
    state3.errorCount = 3;

    expect(SessionManager.getState("session-1").errorCount).toBe(1);
    expect(SessionManager.getState("session-2").errorCount).toBe(2);
    expect(SessionManager.getState("session-3").errorCount).toBe(3);
  });

  test("getAllSessions returns copy of all sessions", () => {
    const config = createMockConfig();
    SessionManager.setDefaultConfig(config);
    SessionManager.getState("a");
    SessionManager.getState("b");

    const sessions = SessionManager.getAllSessions();

    expect(sessions.size).toBe(2);
    expect(sessions.has("a")).toBe(true);
    expect(sessions.has("b")).toBe(true);

    sessions.delete("a");
    expect(SessionManager.hasSession("a")).toBe(true);
  });

  test("getSessionCount returns correct count", () => {
    const config = createMockConfig();
    SessionManager.setDefaultConfig(config);

    expect(SessionManager.getSessionCount()).toBe(0);

    SessionManager.getState("one");
    expect(SessionManager.getSessionCount()).toBe(1);

    SessionManager.getState("two");
    expect(SessionManager.getSessionCount()).toBe(2);

    SessionManager.deleteSession("one");
    expect(SessionManager.getSessionCount()).toBe(1);
  });
});

describe("SessionManager - State Mutations", () => {
  beforeEach(() => {
    SessionManager.clearSessions();
    SessionManager.setDefaultConfig(createMockConfig());
  });

  test("updateActivity updates lastActivityAt timestamp", async () => {
    const state = SessionManager.getState("activity-test");
    const initial = state.lastActivityAt.getTime();

    await new Promise((r) => setTimeout(r, 10));
    SessionManager.updateActivity("activity-test");

    expect(state.lastActivityAt.getTime()).toBeGreaterThan(initial);
  });

  test("addToolExecution appends to tool history", () => {
    SessionManager.getState("tool-test");

    SessionManager.addToolExecution("tool-test", {
      tool: "read",
      timestamp: new Date(),
      success: true,
    });

    SessionManager.addToolExecution("tool-test", {
      tool: "write",
      timestamp: new Date(),
      success: false,
      error: "Permission denied",
    });

    const state = SessionManager.getState("tool-test");
    expect(state.toolHistory.length).toBe(2);
    expect(state.toolHistory[0]?.tool).toBe("read");
    expect(state.toolHistory[1]?.tool).toBe("write");
    expect(state.toolHistory[1]?.success).toBe(false);
  });

  test("incrementErrorCount increases and returns count", () => {
    SessionManager.getState("error-test");

    expect(SessionManager.incrementErrorCount("error-test")).toBe(1);
    expect(SessionManager.incrementErrorCount("error-test")).toBe(2);
    expect(SessionManager.incrementErrorCount("error-test")).toBe(3);

    expect(SessionManager.getState("error-test").errorCount).toBe(3);
  });

  test("incrementErrorCount returns 0 for non-existent session", () => {
    expect(SessionManager.incrementErrorCount("nonexistent")).toBe(0);
  });

  test("resetErrorCount sets count to zero", () => {
    const state = SessionManager.getState("reset-test");
    state.errorCount = 5;

    SessionManager.resetErrorCount("reset-test");

    expect(state.errorCount).toBe(0);
  });

  test("updateTodos tracks todo state", () => {
    SessionManager.getState("todo-test");

    SessionManager.updateTodos("todo-test", 5, 2);

    const state = SessionManager.getState("todo-test");
    expect(state.todosCreated).toBe(true);
    expect(state.todoCount).toBe(5);
    expect(state.todosCompleted).toBe(2);
  });

  test("setPhase updates workflow phase", () => {
    SessionManager.getState("phase-test");

    SessionManager.setPhase("phase-test", "exploration");

    expect(SessionManager.getState("phase-test").phase).toBe("exploration");
  });

  test("setMetadata and getMetadata work correctly", () => {
    SessionManager.getState("meta-test");

    SessionManager.setMetadata("meta-test", "customKey", { nested: "value" });

    expect(SessionManager.getMetadata("meta-test", "customKey")).toEqual({
      nested: "value",
    });
    expect(SessionManager.getMetadata("meta-test", "missing")).toBeUndefined();
  });
});

describe("SessionManager - Schema Validation", () => {
  beforeEach(() => {
    SessionManager.clearSessions();
  });

  test("SessionState has all required fields from Technical Plan", () => {
    const config = createMockConfig();
    const state = SessionManager.initializeSessionState("schema-test", config);

    expect(state).toHaveProperty("sessionId");
    expect(state).toHaveProperty("createdAt");
    expect(state).toHaveProperty("lastActivityAt");
    expect(state).toHaveProperty("phase");
    expect(state).toHaveProperty("errorCount");
    expect(state).toHaveProperty("todosCreated");
    expect(state).toHaveProperty("todoCount");
    expect(state).toHaveProperty("todosCompleted");
    expect(state).toHaveProperty("toolHistory");
    expect(state).toHaveProperty("config");
    expect(state).toHaveProperty("metadata");
  });

  test("WorkflowPhase accepts valid phase values", () => {
    const config = createMockConfig();
    SessionManager.setDefaultConfig(config);
    const sessionId = "phase-values-test";
    SessionManager.getState(sessionId);

    const validPhases = [
      "idle",
      "intent",
      "assessment",
      "exploration",
      "implementation",
      "verification",
    ] as const;

    for (const phase of validPhases) {
      SessionManager.setPhase(sessionId, phase);
      expect(SessionManager.getState(sessionId).phase).toBe(phase);
    }
  });
});

describe("SessionManager - Memory Safety", () => {
  beforeEach(() => {
    SessionManager.clearSessions();
  });

  test("deleted sessions are fully garbage collectable", () => {
    const config = createMockConfig();
    SessionManager.setDefaultConfig(config);

    for (let i = 0; i < 100; i++) {
      SessionManager.getState(`session-${i}`);
    }

    expect(SessionManager.getSessionCount()).toBe(100);

    for (let i = 0; i < 100; i++) {
      SessionManager.deleteSession(`session-${i}`);
    }

    expect(SessionManager.getSessionCount()).toBe(0);
    expect(SessionManager.getAllSessions().size).toBe(0);
  });

  test("setState replaces existing session completely", () => {
    const config = createMockConfig();
    SessionManager.setDefaultConfig(config);

    const original = SessionManager.getState("replace-test");
    original.errorCount = 99;

    const replacement = SessionManager.initializeSessionState("replace-test", config);
    replacement.errorCount = 1;
    SessionManager.setState("replace-test", replacement);

    expect(SessionManager.getState("replace-test").errorCount).toBe(1);
    expect(SessionManager.getState("replace-test")).toBe(replacement);
    expect(SessionManager.getState("replace-test")).not.toBe(original);
  });
});
