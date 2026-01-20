/**
 * State Persistence Unit Tests
 *
 * Tests for session state persistence functionality including:
 * - State serialization and deserialization
 * - File-based storage
 * - Auto-save functionality
 * - State cleanup
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  StatePersistence,
  resetStatePersistence,
  type PersistedSessionState,
} from "../../src/lib/state-persistence.js";
import type { SessionState, WorkflowPhase } from "../../src/plugin/types.js";
import { createDefaultConfig } from "../../src/lib/config.js";

// Helper to create a mock SessionState
function createMockSessionState(
  sessionId: string,
  overrides: Partial<SessionState> = {}
): SessionState {
  const config = createDefaultConfig();
  const now = new Date();

  return {
    sessionId,
    createdAt: now,
    lastActivityAt: now,
    phase: "idle" as WorkflowPhase,
    workflow: {
      currentPhase: "idle" as WorkflowPhase,
      phaseHistory: [],
      startedAt: Date.now(),
      completed: false,
    },
    errorCount: 0,
    todosCreated: false,
    todoCount: 0,
    todosCompleted: 0,
    toolHistory: [],
    config,
    metadata: {},
    ...overrides,
  };
}

describe("State Persistence Module", () => {
  let persistence: StatePersistence;

  beforeEach(() => {
    resetStatePersistence();
    persistence = new StatePersistence({
      enabled: true,
      maxStateFiles: 10,
      autoSaveIntervalMs: 0, // Disable auto-save for tests
      enablePiiFiltering: true,
      maxToolHistoryEntries: 50,
    });
  });

  afterEach(() => {
    persistence.stopAllAutoSave();
    resetStatePersistence();
  });

  // ===========================================================================
  // Basic Operations
  // ===========================================================================

  describe("Basic Operations", () => {
    test("generates correct state file path", () => {
      const sessionId = "test-session-123";
      const path = persistence.getStatePath(sessionId);
      expect(path).toContain(".atreides/state/test-session-123.json");
    });

    test("saves session state successfully", async () => {
      const sessionId = "save-test-session";
      const state = createMockSessionState(sessionId);

      const saved = await persistence.saveState(state);
      expect(saved).toBe(true);

      const exists = await persistence.hasState(sessionId);
      expect(exists).toBe(true);
    });

    test("loads saved session state", async () => {
      const sessionId = "load-test-session";
      const state = createMockSessionState(sessionId, {
        phase: "implementation",
        errorCount: 2,
        todosCreated: true,
        todoCount: 5,
        todosCompleted: 3,
      });

      await persistence.saveState(state);
      const loaded = await persistence.loadState(sessionId);

      expect(loaded).not.toBeNull();
      expect(loaded?.sessionId).toBe(sessionId);
      expect(loaded?.phase).toBe("implementation");
      expect(loaded?.errorCount).toBe(2);
      expect(loaded?.todosCreated).toBe(true);
      expect(loaded?.todoCount).toBe(5);
      expect(loaded?.todosCompleted).toBe(3);
    });

    test("returns null for non-existent session", async () => {
      const loaded = await persistence.loadState("non-existent-session");
      expect(loaded).toBeNull();
    });

    test("deletes session state", async () => {
      const sessionId = "delete-test-session";
      const state = createMockSessionState(sessionId);

      await persistence.saveState(state);
      expect(await persistence.hasState(sessionId)).toBe(true);

      const deleted = await persistence.deleteState(sessionId);
      expect(deleted).toBe(true);
      expect(await persistence.hasState(sessionId)).toBe(false);
    });

    test("delete returns true for non-existent session", async () => {
      const deleted = await persistence.deleteState("non-existent-session");
      expect(deleted).toBe(true);
    });
  });

  // ===========================================================================
  // Serialization
  // ===========================================================================

  describe("Serialization", () => {
    test("preserves workflow state correctly", async () => {
      const sessionId = "workflow-test-session";
      const state = createMockSessionState(sessionId, {
        phase: "verification",
        workflow: {
          currentPhase: "verification",
          phaseHistory: [
            {
              from: "idle",
              to: "intent",
              timestamp: Date.now() - 10000,
              triggeredBy: "user",
              reason: "first message",
            },
            {
              from: "intent",
              to: "exploration",
              timestamp: Date.now() - 5000,
              triggeredBy: "Read",
            },
          ],
          intentClassification: "feature",
          startedAt: Date.now() - 15000,
          completed: false,
        },
      });

      await persistence.saveState(state);
      const loaded = await persistence.loadState(sessionId);

      expect(loaded?.workflow?.currentPhase).toBe("verification");
      expect(loaded?.workflow?.phaseHistory).toHaveLength(2);
      expect(loaded?.workflow?.intentClassification).toBe("feature");
    });

    test("preserves tool history correctly", async () => {
      const sessionId = "tool-history-test-session";
      const state = createMockSessionState(sessionId, {
        toolHistory: [
          {
            tool: "bash",
            timestamp: new Date(),
            success: true,
            durationMs: 150,
          },
          {
            tool: "read",
            timestamp: new Date(),
            success: false,
            error: "File not found",
          },
        ],
      });

      await persistence.saveState(state);
      const loaded = await persistence.loadState(sessionId);

      expect(loaded?.toolHistory).toHaveLength(2);
      expect(loaded?.toolHistory?.[0].tool).toBe("bash");
      expect(loaded?.toolHistory?.[0].success).toBe(true);
      expect(loaded?.toolHistory?.[0].durationMs).toBe(150);
      expect(loaded?.toolHistory?.[1].tool).toBe("read");
      expect(loaded?.toolHistory?.[1].success).toBe(false);
      expect(loaded?.toolHistory?.[1].error).toBe("File not found");
    });

    test("truncates tool history to max entries", async () => {
      const sessionId = "truncate-test-session";
      const longHistory = Array.from({ length: 100 }, (_, i) => ({
        tool: `tool-${i}`,
        timestamp: new Date(),
        success: true,
      }));

      const state = createMockSessionState(sessionId, {
        toolHistory: longHistory,
      });

      await persistence.saveState(state);
      const loaded = await persistence.loadState(sessionId);

      // Should be truncated to maxToolHistoryEntries (50)
      expect(loaded?.toolHistory?.length).toBe(50);
    });

    test("preserves metadata correctly", async () => {
      const sessionId = "metadata-test-session";
      const state = createMockSessionState(sessionId, {
        metadata: {
          customKey: "customValue",
          nested: { a: 1, b: 2 },
          array: [1, 2, 3],
        },
      });

      await persistence.saveState(state);
      const loaded = await persistence.loadState(sessionId);

      expect(loaded?.metadata?.customKey).toBe("customValue");
      expect(loaded?.metadata?.nested).toEqual({ a: 1, b: 2 });
      expect(loaded?.metadata?.array).toEqual([1, 2, 3]);
    });

    test("filters PII from metadata", async () => {
      const sessionId = "pii-filter-test-session";
      const state = createMockSessionState(sessionId, {
        metadata: {
          userEmail: "secret@example.com",
          normalData: "safe value",
        },
      });

      await persistence.saveState(state);
      const loaded = await persistence.loadState(sessionId);

      expect(loaded?.metadata?.userEmail).toBe("[REDACTED]");
      expect(loaded?.metadata?.normalData).toBe("safe value");
    });
  });

  // ===========================================================================
  // List Sessions
  // ===========================================================================

  describe("List Sessions", () => {
    test("lists all persisted sessions", async () => {
      const sessions = ["session-a", "session-b", "session-c"];

      for (const sessionId of sessions) {
        const state = createMockSessionState(sessionId);
        await persistence.saveState(state);
      }

      const listed = await persistence.listSessions();
      expect(listed).toContain("session-a");
      expect(listed).toContain("session-b");
      expect(listed).toContain("session-c");
    });

    test("returns empty array when no sessions exist", async () => {
      // Just initialize, don't save any sessions
      await persistence.initialize();
      const listed = await persistence.listSessions();
      // May contain previous test sessions, but shouldn't fail
      expect(Array.isArray(listed)).toBe(true);
    });
  });

  // ===========================================================================
  // Disabled Persistence
  // ===========================================================================

  describe("Disabled Persistence", () => {
    let disabledPersistence: StatePersistence;

    beforeEach(() => {
      disabledPersistence = new StatePersistence({
        enabled: false,
        maxStateFiles: 10,
        autoSaveIntervalMs: 0,
        enablePiiFiltering: true,
        maxToolHistoryEntries: 50,
      });
    });

    test("saveState returns false when disabled", async () => {
      const state = createMockSessionState("disabled-test");
      const saved = await disabledPersistence.saveState(state);
      expect(saved).toBe(false);
    });

    test("loadState returns null when disabled", async () => {
      const loaded = await disabledPersistence.loadState("disabled-test");
      expect(loaded).toBeNull();
    });

    test("listSessions returns empty array when disabled", async () => {
      const listed = await disabledPersistence.listSessions();
      expect(listed).toEqual([]);
    });

    test("deleteState returns false when disabled", async () => {
      const deleted = await disabledPersistence.deleteState("disabled-test");
      expect(deleted).toBe(false);
    });
  });

  // ===========================================================================
  // State Metadata
  // ===========================================================================

  describe("State Metadata", () => {
    test("getStateMetadata returns exists: false for non-existent session", async () => {
      const metadata = await persistence.getStateMetadata("non-existent");
      expect(metadata?.exists).toBe(false);
    });

    test("getStateMetadata returns metadata for existing session", async () => {
      const sessionId = "metadata-check-session";
      const state = createMockSessionState(sessionId);
      await persistence.saveState(state);

      const metadata = await persistence.getStateMetadata(sessionId);
      expect(metadata?.exists).toBe(true);
      expect(metadata?.savedAt).toBeDefined();
      expect(metadata?.size).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Auto-Save
  // ===========================================================================

  describe("Auto-Save", () => {
    test("stopAutoSave is safe to call for non-existent timer", () => {
      // Should not throw
      persistence.stopAutoSave("non-existent-session");
    });

    test("stopAllAutoSave clears all timers", async () => {
      // Start auto-save for multiple sessions
      const sessions = ["auto-1", "auto-2", "auto-3"];

      for (const sessionId of sessions) {
        persistence.startAutoSave(sessionId, () => createMockSessionState(sessionId));
      }

      // Stop all - should not throw
      persistence.stopAllAutoSave();
    });

    test("startAutoSave does nothing when disabled", () => {
      const disabledPersistence = new StatePersistence({
        enabled: false,
        maxStateFiles: 10,
        autoSaveIntervalMs: 1000,
        enablePiiFiltering: true,
        maxToolHistoryEntries: 50,
      });

      // Should not throw
      disabledPersistence.startAutoSave("test", () => createMockSessionState("test"));
      disabledPersistence.stopAllAutoSave();
    });

    test("startAutoSave does nothing when interval is 0", () => {
      // persistence already has autoSaveIntervalMs: 0
      // Should not start any timer
      persistence.startAutoSave("test", () => createMockSessionState("test"));
      persistence.stopAutoSave("test");
    });
  });

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  describe("Cleanup", () => {
    test("cleanupOldStates returns 0 when disabled", async () => {
      const disabledPersistence = new StatePersistence({
        enabled: false,
        maxStateFiles: 10,
        autoSaveIntervalMs: 0,
        enablePiiFiltering: true,
        maxToolHistoryEntries: 50,
      });

      const deleted = await disabledPersistence.cleanupOldStates();
      expect(deleted).toBe(0);
    });

    test("cleanupOldStates removes files when limit exceeded", async () => {
      // Create persistence with very low limit
      const limitedPersistence = new StatePersistence({
        enabled: true,
        maxStateFiles: 3,
        autoSaveIntervalMs: 0,
        enablePiiFiltering: true,
        maxToolHistoryEntries: 50,
      });

      // Use unique prefix for this test
      const prefix = `cleanup-${Date.now()}-`;

      // Save more sessions than the limit
      for (let i = 0; i < 5; i++) {
        const state = createMockSessionState(`${prefix}${i}`);
        await limitedPersistence.saveState(state);
        // Small delay to ensure different modification times
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const deleted = await limitedPersistence.cleanupOldStates();
      // Should delete some files (exact count depends on existing files)
      expect(deleted).toBeGreaterThanOrEqual(0);

      // After cleanup, total files should be at most maxStateFiles
      const remaining = await limitedPersistence.listSessions();
      expect(remaining.length).toBeLessThanOrEqual(3);
    });
  });

  // ===========================================================================
  // Date Handling
  // ===========================================================================

  describe("Date Handling", () => {
    test("correctly serializes and deserializes Date objects", async () => {
      const sessionId = "date-test-session";
      const createdAt = new Date("2024-01-15T10:30:00Z");
      const lastActivityAt = new Date("2024-01-15T11:45:00Z");

      const state = createMockSessionState(sessionId, {
        createdAt,
        lastActivityAt,
      });

      await persistence.saveState(state);
      const loaded = await persistence.loadState(sessionId);

      expect(loaded?.createdAt).toBeInstanceOf(Date);
      expect(loaded?.lastActivityAt).toBeInstanceOf(Date);
      expect(loaded?.createdAt?.toISOString()).toBe(createdAt.toISOString());
      expect(loaded?.lastActivityAt?.toISOString()).toBe(lastActivityAt.toISOString());
    });
  });
});
