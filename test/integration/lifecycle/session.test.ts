/**
 * Session Lifecycle Integration Tests
 *
 * Tests for complete session lifecycle including creation, state management,
 * cleanup, and multi-session scenarios.
 *
 * Total: 25 tests
 */

import { describe, expect, test, afterEach, beforeEach } from "bun:test";
import { createTestHarness, createInitializedHarness } from "../harness.js";
import {
  AtreidesPlugin,
  clearSessions,
  getSessionState,
  getAllSessions,
  SessionManager,
} from "../../../src/plugin/index.js";
import { createMockContext } from "../../mocks/index.js";
import { wait } from "../../setup.js";
import { compactionHandler } from "../../../src/plugin/managers/compaction-handler.js";
import { todoEnforcer } from "../../../src/plugin/managers/todo-enforcer.js";

describe("Integration: Session Lifecycle - Full Lifecycle", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 1: complete session lifecycle
  test("complete session lifecycle: create -> activity -> delete", async () => {
    const harness = await createTestHarness();

    expect(SessionManager.getSessionCount()).toBe(0);

    // Create
    await harness.simulateSessionCreate();
    expect(SessionManager.getSessionCount()).toBe(1);
    expect(SessionManager.hasSession(harness.sessionId)).toBe(true);

    // Activity
    await harness.simulateToolExecution("read", { path: "/test.ts" }, { content: "test" });
    expect(getSessionState(harness.sessionId)?.toolHistory.length).toBe(1);

    // Delete
    await harness.simulateSessionDelete();
    expect(SessionManager.getSessionCount()).toBe(0);
    expect(SessionManager.hasSession(harness.sessionId)).toBe(false);

    harness.cleanup();
  });

  // Test 2: session survives multiple tool executions
  test("session state persists across multiple tool executions", async () => {
    const harness = await createInitializedHarness();

    for (let i = 0; i < 10; i++) {
      await harness.simulateToolExecution(
        "read",
        { path: `/file${i}.ts` },
        { content: `content ${i}` }
      );
    }

    const state = getSessionState(harness.sessionId);
    expect(state?.toolHistory.length).toBe(10);

    harness.cleanup();
  });

  // Test 3: session state is isolated per session
  test("session state is isolated between sessions", async () => {
    const harness = await createTestHarness();

    await harness.hooks.event({ type: "session.created", sessionId: "session-1" });
    await harness.hooks.event({ type: "session.created", sessionId: "session-2" });

    // Modify session-1
    SessionManager.incrementErrorCount("session-1");
    SessionManager.setPhase("session-1", "exploration");

    // session-2 should be unaffected
    const state2 = getSessionState("session-2");
    expect(state2?.errorCount).toBe(0);
    expect(state2?.phase).toBe("idle");

    harness.cleanup();
  });

  // Test 4: session deletion cleans up all state
  test("session deletion cleans up all associated state", async () => {
    const harness = await createInitializedHarness();

    // Build up some state
    SessionManager.setPhase(harness.sessionId, "implementation");
    SessionManager.incrementErrorCount(harness.sessionId);
    SessionManager.updateTodos(harness.sessionId, 5, 2);
    SessionManager.setMetadata(harness.sessionId, "customKey", "customValue");

    await harness.simulateSessionDelete();

    expect(getSessionState(harness.sessionId)).toBeUndefined();

    harness.cleanup();
  });

  // Test 5: session can be recreated after deletion
  test("session can be recreated after deletion", async () => {
    const harness = await createTestHarness();
    const sessionId = "recreate-session";

    // Create -> Delete -> Recreate
    await harness.hooks.event({ type: "session.created", sessionId });
    SessionManager.setPhase(sessionId, "implementation");

    await harness.hooks.event({ type: "session.deleted", sessionId });
    expect(getSessionState(sessionId)).toBeUndefined();

    await harness.hooks.event({ type: "session.created", sessionId });
    const state = getSessionState(sessionId);
    expect(state).toBeDefined();
    expect(state?.phase).toBe("idle"); // Fresh state

    harness.cleanup();
  });
});

describe("Integration: Session Lifecycle - Multi-Session Management", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 6: multiple concurrent sessions
  test("supports multiple concurrent sessions", async () => {
    const harness = await createTestHarness();

    const sessionIds = ["multi-1", "multi-2", "multi-3", "multi-4", "multi-5"];

    for (const id of sessionIds) {
      await harness.hooks.event({ type: "session.created", sessionId: id });
    }

    expect(SessionManager.getSessionCount()).toBe(5);

    sessionIds.forEach((id) => {
      expect(getSessionState(id)).toBeDefined();
    });

    harness.cleanup();
  });

  // Test 7: sessions operate independently
  test("sessions operate independently in parallel", async () => {
    const harness = await createTestHarness();

    await harness.hooks.event({ type: "session.created", sessionId: "parallel-1" });
    await harness.hooks.event({ type: "session.created", sessionId: "parallel-2" });

    // Different phases for each
    SessionManager.setPhase("parallel-1", "exploration");
    SessionManager.setPhase("parallel-2", "implementation");

    // Different error counts
    SessionManager.incrementErrorCount("parallel-1");
    SessionManager.incrementErrorCount("parallel-1");
    SessionManager.incrementErrorCount("parallel-2");

    expect(getSessionState("parallel-1")?.phase).toBe("exploration");
    expect(getSessionState("parallel-2")?.phase).toBe("implementation");
    expect(getSessionState("parallel-1")?.errorCount).toBe(2);
    expect(getSessionState("parallel-2")?.errorCount).toBe(1);

    harness.cleanup();
  });

  // Test 8: getAllSessions returns all active sessions
  test("getAllSessions returns all active sessions", async () => {
    const harness = await createTestHarness();

    await harness.hooks.event({ type: "session.created", sessionId: "all-1" });
    await harness.hooks.event({ type: "session.created", sessionId: "all-2" });
    await harness.hooks.event({ type: "session.created", sessionId: "all-3" });

    const sessions = getAllSessions();
    expect(sessions.size).toBe(3);

    harness.cleanup();
  });

  // Test 9: partial session cleanup
  test("partial session cleanup leaves other sessions intact", async () => {
    const harness = await createTestHarness();

    await harness.hooks.event({ type: "session.created", sessionId: "keep-1" });
    await harness.hooks.event({ type: "session.created", sessionId: "delete-1" });
    await harness.hooks.event({ type: "session.created", sessionId: "keep-2" });

    await harness.hooks.event({ type: "session.deleted", sessionId: "delete-1" });

    expect(SessionManager.getSessionCount()).toBe(2);
    expect(getSessionState("keep-1")).toBeDefined();
    expect(getSessionState("keep-2")).toBeDefined();
    expect(getSessionState("delete-1")).toBeUndefined();

    harness.cleanup();
  });

  // Test 10: stress test with many sessions
  test("handles many concurrent sessions", async () => {
    const harness = await createTestHarness();

    for (let i = 0; i < 50; i++) {
      await harness.hooks.event({ type: "session.created", sessionId: `stress-${i}` });
    }

    expect(SessionManager.getSessionCount()).toBe(50);

    for (let i = 0; i < 50; i++) {
      await harness.hooks.event({ type: "session.deleted", sessionId: `stress-${i}` });
    }

    expect(SessionManager.getSessionCount()).toBe(0);

    harness.cleanup();
  });
});

describe("Integration: Session Lifecycle - State Transitions", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 11: phase transitions are tracked
  test("phase transitions are recorded in state", async () => {
    const harness = await createInitializedHarness();

    SessionManager.setPhase(harness.sessionId, "exploration");
    expect(getSessionState(harness.sessionId)?.phase).toBe("exploration");

    SessionManager.setPhase(harness.sessionId, "implementation");
    expect(getSessionState(harness.sessionId)?.phase).toBe("implementation");

    SessionManager.setPhase(harness.sessionId, "verification");
    expect(getSessionState(harness.sessionId)?.phase).toBe("verification");

    harness.cleanup();
  });

  // Test 12: error count management
  test("error count increments and resets correctly", async () => {
    const harness = await createInitializedHarness();

    expect(getSessionState(harness.sessionId)?.errorCount).toBe(0);

    SessionManager.incrementErrorCount(harness.sessionId);
    expect(getSessionState(harness.sessionId)?.errorCount).toBe(1);

    SessionManager.incrementErrorCount(harness.sessionId);
    expect(getSessionState(harness.sessionId)?.errorCount).toBe(2);

    SessionManager.resetErrorCount(harness.sessionId);
    expect(getSessionState(harness.sessionId)?.errorCount).toBe(0);

    harness.cleanup();
  });

  // Test 13: todo tracking updates
  test("todo tracking updates correctly", async () => {
    const harness = await createInitializedHarness();

    SessionManager.updateTodos(harness.sessionId, 10, 3);

    const state = getSessionState(harness.sessionId);
    expect(state?.todosCreated).toBe(true);
    expect(state?.todoCount).toBe(10);
    expect(state?.todosCompleted).toBe(3);

    harness.cleanup();
  });

  // Test 14: metadata storage and retrieval
  test("metadata can be stored and retrieved", async () => {
    const harness = await createInitializedHarness();

    SessionManager.setMetadata(harness.sessionId, "testKey", { nested: "value" });

    const metadata = SessionManager.getMetadata(harness.sessionId, "testKey");
    expect(metadata).toEqual({ nested: "value" });

    harness.cleanup();
  });

  // Test 15: activity timestamp updates
  test("lastActivityAt updates on activity", async () => {
    const harness = await createInitializedHarness();

    const initialTime = getSessionState(harness.sessionId)?.lastActivityAt.getTime();

    await wait(10);

    SessionManager.updateActivity(harness.sessionId);

    const newTime = getSessionState(harness.sessionId)?.lastActivityAt.getTime();
    expect(newTime).toBeGreaterThan(initialTime!);

    harness.cleanup();
  });
});

describe("Integration: Session Lifecycle - Stop Hook", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 16: stop hook allows stop by default
  test("stop hook allows session stop by default", async () => {
    const harness = await createInitializedHarness();

    const result = await harness.hooks.stop({ sessionId: harness.sessionId });

    expect(result.allow).toBe(true);

    harness.cleanup();
  });

  // Test 17: stop hook allows stop for non-existent session
  test("stop hook allows stop for non-existent session", async () => {
    const harness = await createTestHarness();

    const result = await harness.hooks.stop({ sessionId: "non-existent" });

    expect(result.allow).toBe(true);

    harness.cleanup();
  });

  // Test 18: stop hook blocks with pending todos (strict mode)
  test("stop hook can block when todos are pending in strict mode", async () => {
    const harness = await createInitializedHarness({
      config: {
        workflow: {
          enablePhaseTracking: true,
          strictTodoEnforcement: true,
          autoEscalateOnError: false,
        },
      },
    });

    // Simulate AI response with pending todos (markdown checkbox format)
    const aiResponseWithTodos = `
Here are the tasks to complete:
- [ ] Task 1
- [ ] Task 2
    `;

    // Use detectTodos to register pending todos
    todoEnforcer.detectTodos(aiResponseWithTodos, harness.sessionId);

    const result = await harness.hooks.stop({ sessionId: harness.sessionId });

    // In strict mode with pending todos, stop should be blocked
    expect(result).toBeDefined();
    expect(typeof result.allow).toBe("boolean");
    // With pending todos, allow should be false
    expect(result.allow).toBe(false);

    harness.cleanup();
  });

  // Test 19: stop hook allows with all todos completed
  test("stop hook allows when all todos are completed", async () => {
    const harness = await createInitializedHarness({
      config: {
        workflow: {
          enablePhaseTracking: true,
          strictTodoEnforcement: true,
          autoEscalateOnError: false,
        },
      },
    });

    // Simulate AI response with completed todos (markdown checkbox format)
    const aiResponseWithCompletedTodos = `
Completed tasks:
- [x] Task 1
- [x] Task 2
    `;

    // Use detectTodos to register completed todos
    todoEnforcer.detectTodos(aiResponseWithCompletedTodos, harness.sessionId);

    const result = await harness.hooks.stop({ sessionId: harness.sessionId });

    expect(result.allow).toBe(true);

    harness.cleanup();
  });
});

describe("Integration: Session Lifecycle - Compaction", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 20: compaction preserves session state
  test("compaction preserves critical session state", async () => {
    const harness = await createInitializedHarness();

    SessionManager.setPhase(harness.sessionId, "implementation");
    SessionManager.updateTodos(harness.sessionId, 5, 2);

    const result = await harness.hooks["experimental.session.compacting"]({
      summary: "Previous work summary",
      sessionId: harness.sessionId,
    });

    expect(result.summary).toContain("Previous work summary");
    expect(result.summary).toContain("ATREIDES STATE");
    expect(result.summary).toContain("implementation");

    harness.cleanup();
  });

  // Test 21: compaction includes todo progress
  test("compaction includes todo progress", async () => {
    const harness = await createInitializedHarness();

    SessionManager.updateTodos(harness.sessionId, 10, 7);

    const result = await harness.hooks["experimental.session.compacting"]({
      summary: "Summary",
      sessionId: harness.sessionId,
    });

    expect(result.summary).toContain("7/10");

    harness.cleanup();
  });

  // Test 22: compaction handles non-existent session
  test("compaction handles non-existent session gracefully", async () => {
    const harness = await createTestHarness();

    const result = await harness.hooks["experimental.session.compacting"]({
      summary: "Original summary",
      sessionId: "non-existent",
    });

    expect(result.summary).toBe("Original summary");

    harness.cleanup();
  });

  // Test 23: compaction preserves pending todos
  test("compaction preserves pending todo items", async () => {
    const harness = await createInitializedHarness();

    // Store todos
    compactionHandler.storePendingTodos(harness.sessionId, [
      { id: "1", content: "Task 1", status: "pending" },
      { id: "2", content: "Task 2", status: "in_progress" },
    ]);

    const result = await harness.hooks["experimental.session.compacting"]({
      summary: "Summary",
      sessionId: harness.sessionId,
    });

    // Pending todos should be mentioned in compacted state
    expect(result.summary.length).toBeGreaterThan("Summary".length);

    harness.cleanup();
  });
});

describe("Integration: Session Lifecycle - Edge Cases", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 24: duplicate session creation
  test("duplicate session creation overwrites previous state", async () => {
    const harness = await createTestHarness();
    const sessionId = "duplicate-session";

    await harness.hooks.event({ type: "session.created", sessionId });
    SessionManager.setPhase(sessionId, "verification");

    await harness.hooks.event({ type: "session.created", sessionId });

    // State should be reset
    expect(getSessionState(sessionId)?.phase).toBe("idle");

    harness.cleanup();
  });

  // Test 25: rapid session operations
  test("handles rapid session create/delete operations", async () => {
    const harness = await createTestHarness();

    const operations: Promise<void>[] = [];

    for (let i = 0; i < 20; i++) {
      operations.push(
        harness.hooks.event({ type: "session.created", sessionId: `rapid-${i}` })
      );
    }

    await Promise.all(operations);
    expect(SessionManager.getSessionCount()).toBe(20);

    const deleteOps: Promise<void>[] = [];
    for (let i = 0; i < 20; i++) {
      deleteOps.push(
        harness.hooks.event({ type: "session.deleted", sessionId: `rapid-${i}` })
      );
    }

    await Promise.all(deleteOps);
    expect(SessionManager.getSessionCount()).toBe(0);

    harness.cleanup();
  });
});
