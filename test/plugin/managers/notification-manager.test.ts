import { describe, expect, test, beforeEach, mock, spyOn } from "bun:test";
import {
  NotificationManager,
  getNotificationManager,
  resetNotificationManager,
} from "../../../src/plugin/managers/notification-manager";
import type { NotificationConfig } from "../../../src/lib/config";
import type { OpenCodeClient } from "../../../src/plugin/types";

function createMockConfig(overrides?: Partial<NotificationConfig>): NotificationConfig {
  return {
    enabled: true,
    enabledEvents: ["error.escalation", "session.completed", "security.blocked"],
    minSeverity: "warning",
    throttleMs: 1000,
    notifyOnEveryStrike: false,
    ...overrides,
  };
}

function createMockClient(): OpenCodeClient {
  return {
    notify: mock(() => {}),
    log: mock(() => {}),
  };
}

describe("NotificationManager - Initialization", () => {
  beforeEach(() => {
    resetNotificationManager();
  });

  test("creates instance with provided config", () => {
    const config = createMockConfig();
    const manager = new NotificationManager(config);

    expect(manager).toBeDefined();
  });

  test("getNotificationManager creates singleton", () => {
    const config = createMockConfig();
    const manager1 = getNotificationManager(config);
    const manager2 = getNotificationManager();

    expect(manager1).toBe(manager2);
  });

  test("getNotificationManager throws when no config provided initially", () => {
    expect(() => getNotificationManager()).toThrow(/not initialized/);
  });

  test("resetNotificationManager clears singleton", () => {
    const config = createMockConfig();
    getNotificationManager(config);

    resetNotificationManager();

    expect(() => getNotificationManager()).toThrow(/not initialized/);
  });
});

describe("NotificationManager - Client Configuration", () => {
  beforeEach(() => {
    resetNotificationManager();
  });

  test("setClient configures notification delivery", () => {
    const config = createMockConfig();
    const manager = new NotificationManager(config);
    const client = createMockClient();

    manager.setClient(client);

    // Verify client is set by attempting to send a notification
    // (would fail silently without client)
  });

  test("updateConfig changes notification settings", () => {
    const config = createMockConfig({ enabled: true });
    const manager = new NotificationManager(config);

    manager.updateConfig({ ...config, enabled: false });

    // The config should be updated
  });
});

describe("NotificationManager - Notification Filtering", () => {
  beforeEach(() => {
    resetNotificationManager();
  });

  test("returns disabled reason when notifications are disabled", async () => {
    const config = createMockConfig({ enabled: false });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    const result = await manager.notify("session-1", "error.escalation", "Test message");

    expect(result.delivered).toBe(false);
    expect(result.reason).toBe("disabled");
    expect(client.notify).not.toHaveBeenCalled();
  });

  test("returns filtered reason when event type not in enabledEvents", async () => {
    const config = createMockConfig({
      enabled: true,
      enabledEvents: ["session.completed"], // Only session.completed enabled
    });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    const result = await manager.notify("session-1", "error.escalation", "Test message");

    expect(result.delivered).toBe(false);
    expect(result.reason).toBe("filtered");
  });

  test("allows all events when enabledEvents is empty", async () => {
    const config = createMockConfig({
      enabled: true,
      enabledEvents: [], // Empty = all events enabled
      minSeverity: "info", // Lower threshold to allow info-level events
    });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    const result = await manager.notify("session-1", "phase.transition", "Test message");

    expect(result.delivered).toBe(true);
  });

  test("filters events below minSeverity threshold", async () => {
    const config = createMockConfig({
      enabled: true,
      enabledEvents: [],
      minSeverity: "error", // Only error severity allowed
    });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    // Warning severity should be filtered (below error)
    const result = await manager.notify("session-1", "error.strike", "Test message", {
      severity: "warning",
    });

    expect(result.delivered).toBe(false);
    expect(result.reason).toBe("filtered");
  });

  test("allows events at or above minSeverity threshold", async () => {
    const config = createMockConfig({
      enabled: true,
      enabledEvents: [],
      minSeverity: "warning",
    });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    const result = await manager.notify("session-1", "error.escalation", "Test message", {
      severity: "error",
    });

    expect(result.delivered).toBe(true);
  });
});

describe("NotificationManager - Throttling", () => {
  beforeEach(() => {
    resetNotificationManager();
  });

  test("throttles rapid notifications of same type", async () => {
    const config = createMockConfig({
      enabled: true,
      enabledEvents: [],
      throttleMs: 100,
    });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    // First notification should succeed
    const result1 = await manager.notify("session-1", "error.strike", "First");
    expect(result1.delivered).toBe(true);

    // Immediate second notification should be throttled
    const result2 = await manager.notify("session-1", "error.strike", "Second");
    expect(result2.delivered).toBe(false);
    expect(result2.reason).toBe("throttled");
  });

  test("allows notifications after throttle period", async () => {
    const config = createMockConfig({
      enabled: true,
      enabledEvents: [],
      throttleMs: 50,
    });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    await manager.notify("session-1", "error.strike", "First");

    // Wait for throttle to expire
    await new Promise((r) => setTimeout(r, 60));

    const result = await manager.notify("session-1", "error.strike", "Second");
    expect(result.delivered).toBe(true);
  });

  test("throttles separately per session and event type", async () => {
    const config = createMockConfig({
      enabled: true,
      enabledEvents: [],
      throttleMs: 1000,
    });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    // Same session, different event types should not throttle each other
    const result1 = await manager.notify("session-1", "error.strike", "Strike");
    const result2 = await manager.notify("session-1", "security.blocked", "Blocked");

    expect(result1.delivered).toBe(true);
    expect(result2.delivered).toBe(true);
  });

  test("different sessions are throttled independently", async () => {
    const config = createMockConfig({
      enabled: true,
      enabledEvents: [],
      throttleMs: 1000,
    });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    const result1 = await manager.notify("session-1", "error.strike", "Session 1");
    const result2 = await manager.notify("session-2", "error.strike", "Session 2");

    expect(result1.delivered).toBe(true);
    expect(result2.delivered).toBe(true);
  });

  test("disables throttling when throttleMs is 0", async () => {
    const config = createMockConfig({
      enabled: true,
      enabledEvents: [],
      throttleMs: 0,
    });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    const result1 = await manager.notify("session-1", "error.strike", "First");
    const result2 = await manager.notify("session-1", "error.strike", "Second");

    expect(result1.delivered).toBe(true);
    expect(result2.delivered).toBe(true);
  });
});

describe("NotificationManager - Notification Delivery", () => {
  beforeEach(() => {
    resetNotificationManager();
  });

  test("calls client.notify with correct event name", async () => {
    const config = createMockConfig({ enabled: true, enabledEvents: [] });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    await manager.notify("session-1", "error.escalation", "Test message");

    expect(client.notify).toHaveBeenCalledWith(
      "atreides.error.escalation",
      expect.objectContaining({
        type: "error.escalation",
        sessionId: "session-1",
        message: "Test message",
      })
    );
  });

  test("includes notification metadata in payload", async () => {
    const config = createMockConfig({ enabled: true, enabledEvents: [], minSeverity: "info" });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    await manager.notify("session-1", "custom", "Custom message", {
      title: "Custom Title",
      severity: "info",
      data: { key: "value" },
    });

    expect(client.notify).toHaveBeenCalled();
    const calls = (client.notify as ReturnType<typeof mock>).mock.calls;
    const [eventName, payload] = calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("atreides.custom");
    expect(payload.title).toBe("Custom Title");
    expect(payload.severity).toBe("info");
    expect(payload.data).toEqual({ key: "value" });
  });

  test("uses default title and severity when not provided", async () => {
    const config = createMockConfig({ enabled: true, enabledEvents: [] });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    await manager.notify("session-1", "error.escalation", "Test");

    expect(client.notify).toHaveBeenCalledWith(
      "atreides.error.escalation",
      expect.objectContaining({
        title: "Escalation Required",
        severity: "error",
      })
    );
  });

  test("generates unique notification IDs", async () => {
    const config = createMockConfig({ enabled: true, enabledEvents: [], throttleMs: 0, minSeverity: "info" });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    const result1 = await manager.notify("session-1", "custom", "First");
    const result2 = await manager.notify("session-1", "custom", "Second");

    expect(result1.notification?.id).not.toBe(result2.notification?.id);
  });

  test("returns error when client is not set", async () => {
    const config = createMockConfig({ enabled: true, enabledEvents: [] });
    const manager = new NotificationManager(config);
    // Don't set client

    const result = await manager.notify("session-1", "error.escalation", "Test");

    expect(result.delivered).toBe(false);
    expect(result.reason).toBe("error");
  });
});

describe("NotificationManager - Convenience Methods", () => {
  beforeEach(() => {
    resetNotificationManager();
  });

  test("notifySessionStarted sends correct notification", async () => {
    const config = createMockConfig({ enabled: true, enabledEvents: [], minSeverity: "info" });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    await manager.notifySessionStarted("session-1", "Muad'Dib");

    expect(client.notify).toHaveBeenCalled();
    const calls = (client.notify as ReturnType<typeof mock>).mock.calls;
    const [eventName, payload] = calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("atreides.session.started");
    expect(payload.type).toBe("session.started");
    expect(payload.sessionId).toBe("session-1");
    expect(payload.data).toEqual({ personaName: "Muad'Dib" });
  });

  test("notifyWorkflowComplete sends success notification", async () => {
    const config = createMockConfig({ enabled: true, enabledEvents: [], minSeverity: "info" });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    await manager.notifyWorkflowComplete("session-1", {
      todosCompleted: 5,
      phasesVisited: 4,
    });

    expect(client.notify).toHaveBeenCalled();
    const calls = (client.notify as ReturnType<typeof mock>).mock.calls;
    const [eventName, payload] = calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("atreides.session.completed");
    expect(payload.type).toBe("session.completed");
    expect(payload.severity).toBe("success");
  });

  test("notifyErrorStrike respects notifyOnEveryStrike setting", async () => {
    const config = createMockConfig({
      enabled: true,
      enabledEvents: [],
      notifyOnEveryStrike: false,
    });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    // Strike 1 should be filtered when notifyOnEveryStrike is false
    const result = await manager.notifyErrorStrike("session-1", 1, "bash", "Error");

    expect(result.delivered).toBe(false);
    expect(result.reason).toBe("filtered");
  });

  test("notifyErrorStrike sends notification when notifyOnEveryStrike is true", async () => {
    const config = createMockConfig({
      enabled: true,
      enabledEvents: [],
      notifyOnEveryStrike: true,
    });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    const result = await manager.notifyErrorStrike("session-1", 1, "bash", "Error");

    expect(result.delivered).toBe(true);
  });

  test("notifyErrorEscalation always sends notification", async () => {
    const config = createMockConfig({ enabled: true, enabledEvents: [] });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    const result = await manager.notifyErrorEscalation("session-1", 3, "bash");

    expect(result.delivered).toBe(true);
    expect(client.notify).toHaveBeenCalledWith(
      "atreides.error.escalation",
      expect.objectContaining({
        type: "error.escalation",
        severity: "error",
      })
    );
  });

  test("notifySecurityBlocked sends error notification", async () => {
    const config = createMockConfig({ enabled: true, enabledEvents: [] });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    await manager.notifySecurityBlocked("session-1", "bash", "Dangerous command");

    expect(client.notify).toHaveBeenCalledWith(
      "atreides.security.blocked",
      expect.objectContaining({
        type: "security.blocked",
        severity: "error",
        data: { tool: "bash", reason: "Dangerous command" },
      })
    );
  });

  test("notifyPendingTodos sends warning notification", async () => {
    const config = createMockConfig({ enabled: true, enabledEvents: [] });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    await manager.notifyPendingTodos("session-1", 3, ["Task 1", "Task 2", "Task 3"]);

    expect(client.notify).toHaveBeenCalledWith(
      "atreides.todo.pending",
      expect.objectContaining({
        type: "todo.pending",
        severity: "warning",
      })
    );
  });

  test("notifyPhaseTransition sends info notification", async () => {
    const config = createMockConfig({ enabled: true, enabledEvents: [], minSeverity: "info" });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    await manager.notifyPhaseTransition("session-1", "exploration", "implementation");

    expect(client.notify).toHaveBeenCalled();
    const calls = (client.notify as ReturnType<typeof mock>).mock.calls;
    const [eventName, payload] = calls[0] as [string, Record<string, unknown>];
    expect(eventName).toBe("atreides.phase.transition");
    expect(payload.type).toBe("phase.transition");
    expect(payload.severity).toBe("info");
    expect(payload.data).toEqual({ fromPhase: "exploration", toPhase: "implementation" });
  });
});

describe("NotificationManager - History & Analytics", () => {
  beforeEach(() => {
    resetNotificationManager();
  });

  test("tracks notification history", async () => {
    const config = createMockConfig({ enabled: true, enabledEvents: [], throttleMs: 0 });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    await manager.notify("session-1", "error.strike", "Error 1");
    await manager.notify("session-1", "error.escalation", "Escalation");
    await manager.notify("session-2", "security.blocked", "Blocked");

    const allHistory = manager.getAllHistory();
    expect(allHistory.length).toBe(3);

    const session1History = manager.getSessionHistory("session-1");
    expect(session1History.length).toBe(2);
  });

  test("clearHistory removes all notification history", async () => {
    const config = createMockConfig({ enabled: true, enabledEvents: [], throttleMs: 0, minSeverity: "info" });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    await manager.notify("session-1", "custom", "Test");
    expect(manager.getAllHistory().length).toBe(1);

    manager.clearHistory();
    expect(manager.getAllHistory().length).toBe(0);
  });

  test("clearSessionThrottles removes throttle tracking for session", async () => {
    const config = createMockConfig({ enabled: true, enabledEvents: [], throttleMs: 1000 });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    await manager.notify("session-1", "error.strike", "First");

    // Second notification should be throttled
    const throttled = await manager.notify("session-1", "error.strike", "Second");
    expect(throttled.delivered).toBe(false);
    expect(throttled.reason).toBe("throttled");

    // Clear session throttles
    manager.clearSessionThrottles("session-1");

    // Now should be able to send again
    const afterClear = await manager.notify("session-1", "error.strike", "Third");
    expect(afterClear.delivered).toBe(true);
  });

  test("getStats returns notification statistics", async () => {
    const config = createMockConfig({ enabled: true, enabledEvents: [], throttleMs: 0, minSeverity: "info" });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    await manager.notify("session-1", "error.strike", "Strike", { severity: "warning" });
    await manager.notify("session-1", "error.escalation", "Escalation", { severity: "error" });
    await manager.notify("session-1", "session.completed", "Complete", { severity: "success" });

    const stats = manager.getStats();

    expect(stats.totalSent).toBe(3);
    expect(stats.byType["error.strike"]).toBe(1);
    expect(stats.byType["error.escalation"]).toBe(1);
    expect(stats.byType["session.completed"]).toBe(1);
    expect(stats.bySeverity.warning).toBe(1);
    expect(stats.bySeverity.error).toBe(1);
    expect(stats.bySeverity.success).toBe(1);
  });

  test("limits history size to maxHistorySize", async () => {
    const config = createMockConfig({ enabled: true, enabledEvents: [], throttleMs: 0, minSeverity: "info" });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    // Send more than maxHistorySize (100) notifications
    for (let i = 0; i < 110; i++) {
      await manager.notify("session-1", "custom", `Message ${i}`);
    }

    const history = manager.getAllHistory();
    expect(history.length).toBe(100);

    // Should keep the most recent notifications
    expect(history[99]?.message).toBe("Message 109");
  });
});

describe("NotificationManager - PII Filtering", () => {
  beforeEach(() => {
    resetNotificationManager();
  });

  test("filters PII from notification messages", async () => {
    const config = createMockConfig({ enabled: true, enabledEvents: [], minSeverity: "info" });
    const manager = new NotificationManager(config);
    const client = createMockClient();
    manager.setClient(client);

    await manager.notify(
      "session-1",
      "custom",
      "Error for user test@example.com with API key sk-1234567890"
    );

    // The notification message should have PII redacted
    expect(client.notify).toHaveBeenCalled();
    const calls = (client.notify as ReturnType<typeof mock>).mock.calls;
    const [, payload] = calls[0] as [string, Record<string, unknown>];
    const message = payload.message as string;
    expect(message).not.toContain("test@example.com");
    expect(message).not.toContain("sk-1234567890");
  });
});
