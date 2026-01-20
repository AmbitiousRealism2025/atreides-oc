/**
 * Event Handling Integration Tests
 *
 * Tests that verify plugin event handling (session events, state changes).
 * Covers: session.created, session.deleted, session.idle, unknown events.
 *
 * Total: 15 tests
 */

import { describe, expect, test, afterEach } from "bun:test";
import { createTestHarness, createInitializedHarness } from "../harness.js";
import {
  AtreidesPlugin,
  clearSessions,
  getSessionState,
  SessionManager,
} from "../../../src/plugin/index.js";
import { createMockContext } from "../../mocks/index.js";
import { wait } from "../../setup.js";

describe("Integration: Event Handling - Session Created", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 1: session.created initializes session state
  test("session.created event initializes session state", async () => {
    const harness = await createTestHarness();

    expect(getSessionState(harness.sessionId)).toBeUndefined();

    await harness.simulateSessionCreate();

    const state = getSessionState(harness.sessionId);
    expect(state).toBeDefined();
    expect(state?.sessionId).toBe(harness.sessionId);

    harness.cleanup();
  });

  // Test 2: session.created sets correct initial phase
  test("session.created sets initial phase to idle", async () => {
    const harness = await createTestHarness();

    await harness.simulateSessionCreate();

    const state = getSessionState(harness.sessionId);
    expect(state?.phase).toBe("idle");

    harness.cleanup();
  });

  // Test 3: session.created initializes timestamps
  test("session.created sets createdAt and lastActivityAt timestamps", async () => {
    const harness = await createTestHarness();
    const beforeCreate = new Date();

    await harness.simulateSessionCreate();

    const state = getSessionState(harness.sessionId);
    expect(state?.createdAt).toBeDefined();
    expect(state?.lastActivityAt).toBeDefined();
    expect(state?.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());

    harness.cleanup();
  });

  // Test 4: session.created initializes counters to zero
  test("session.created initializes error count and todo counters to zero", async () => {
    const harness = await createTestHarness();

    await harness.simulateSessionCreate();

    const state = getSessionState(harness.sessionId);
    expect(state?.errorCount).toBe(0);
    expect(state?.todoCount).toBe(0);
    expect(state?.todosCompleted).toBe(0);
    expect(state?.todosCreated).toBe(false);

    harness.cleanup();
  });

  // Test 5: session.created initializes empty tool history
  test("session.created initializes empty tool history", async () => {
    const harness = await createTestHarness();

    await harness.simulateSessionCreate();

    const state = getSessionState(harness.sessionId);
    expect(state?.toolHistory).toEqual([]);

    harness.cleanup();
  });
});

describe("Integration: Event Handling - Session Deleted", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 6: session.deleted removes session state
  test("session.deleted removes session state completely", async () => {
    const harness = await createTestHarness();

    await harness.simulateSessionCreate();
    expect(getSessionState(harness.sessionId)).toBeDefined();

    await harness.simulateSessionDelete();
    expect(getSessionState(harness.sessionId)).toBeUndefined();

    harness.cleanup();
  });

  // Test 7: session.deleted handles non-existent session
  test("session.deleted is safe for non-existent session", async () => {
    const harness = await createTestHarness();

    // Should not throw
    await expect(
      harness.hooks.event({ type: "session.deleted", sessionId: "non-existent" })
    ).resolves.toBeUndefined();

    harness.cleanup();
  });

  // Test 8: session.deleted does not affect other sessions
  test("session.deleted only removes targeted session", async () => {
    const harness = await createTestHarness();

    await harness.hooks.event({ type: "session.created", sessionId: "session-keep" });
    await harness.hooks.event({ type: "session.created", sessionId: "session-delete" });

    await harness.hooks.event({ type: "session.deleted", sessionId: "session-delete" });

    expect(getSessionState("session-keep")).toBeDefined();
    expect(getSessionState("session-delete")).toBeUndefined();

    harness.cleanup();
  });
});

describe("Integration: Event Handling - Session Idle", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 9: session.idle updates lastActivityAt
  test("session.idle updates lastActivityAt timestamp", async () => {
    const harness = await createInitializedHarness();

    const initialState = getSessionState(harness.sessionId);
    const initialTimestamp = initialState?.lastActivityAt.getTime();

    await wait(10); // Wait to ensure time difference

    await harness.hooks.event({ type: "session.idle", sessionId: harness.sessionId });

    const updatedState = getSessionState(harness.sessionId);
    expect(updatedState?.lastActivityAt.getTime()).toBeGreaterThan(initialTimestamp!);

    harness.cleanup();
  });

  // Test 10: session.idle does not change phase
  test("session.idle does not change workflow phase", async () => {
    const harness = await createInitializedHarness();

    SessionManager.setPhase(harness.sessionId, "exploration");

    await harness.hooks.event({ type: "session.idle", sessionId: harness.sessionId });

    const state = getSessionState(harness.sessionId);
    expect(state?.phase).toBe("exploration");

    harness.cleanup();
  });

  // Test 11: session.idle preserves error count
  test("session.idle does not affect error count", async () => {
    const harness = await createInitializedHarness();

    SessionManager.incrementErrorCount(harness.sessionId);
    SessionManager.incrementErrorCount(harness.sessionId);

    await harness.hooks.event({ type: "session.idle", sessionId: harness.sessionId });

    const state = getSessionState(harness.sessionId);
    expect(state?.errorCount).toBe(2);

    harness.cleanup();
  });
});

describe("Integration: Event Handling - Unknown Events", () => {
  afterEach(() => {
    clearSessions();
  });

  // Test 12: unknown events are handled gracefully
  test("unknown event types are handled gracefully", async () => {
    const harness = await createInitializedHarness();

    // Should not throw
    await expect(
      harness.hooks.event({ type: "unknown.event", sessionId: harness.sessionId })
    ).resolves.toBeUndefined();

    harness.cleanup();
  });

  // Test 13: malformed event type is handled
  test("empty event type is handled gracefully", async () => {
    const harness = await createInitializedHarness();

    await expect(
      harness.hooks.event({ type: "", sessionId: harness.sessionId })
    ).resolves.toBeUndefined();

    harness.cleanup();
  });

  // Test 14: multiple rapid session events work correctly
  test("rapid session create/delete cycles work correctly", async () => {
    const harness = await createTestHarness();

    for (let i = 0; i < 10; i++) {
      const sessionId = `rapid-${i}`;
      await harness.hooks.event({ type: "session.created", sessionId });
      expect(getSessionState(sessionId)).toBeDefined();
      await harness.hooks.event({ type: "session.deleted", sessionId });
      expect(getSessionState(sessionId)).toBeUndefined();
    }

    expect(SessionManager.getSessionCount()).toBe(0);

    harness.cleanup();
  });

  // Test 15: concurrent event handling
  test("concurrent events on different sessions work correctly", async () => {
    const harness = await createTestHarness();

    const sessionIds = ["concurrent-1", "concurrent-2", "concurrent-3"];

    // Create all sessions concurrently
    await Promise.all(
      sessionIds.map((sessionId) =>
        harness.hooks.event({ type: "session.created", sessionId })
      )
    );

    // All should exist
    sessionIds.forEach((sessionId) => {
      expect(getSessionState(sessionId)).toBeDefined();
    });

    // Delete all concurrently
    await Promise.all(
      sessionIds.map((sessionId) =>
        harness.hooks.event({ type: "session.deleted", sessionId })
      )
    );

    // All should be gone
    sessionIds.forEach((sessionId) => {
      expect(getSessionState(sessionId)).toBeUndefined();
    });

    harness.cleanup();
  });
});
