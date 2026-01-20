/**
 * Session Logger Unit Tests
 *
 * Tests for session logging functionality including:
 * - Log file creation and writing
 * - Log rotation
 * - PII filtering
 * - Structured logging format
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { homedir } from "node:os";
import {
  SessionLogger,
  filterPii,
  filterPiiFromObject,
  resetSessionLogger,
  type SessionLogEntry,
} from "../../src/lib/session-logger.js";

describe("Session Logger Module", () => {
  // ===========================================================================
  // PII Filtering
  // ===========================================================================

  describe("filterPii", () => {
    test("filters email addresses", () => {
      const input = "Contact user@example.com for support";
      const filtered = filterPii(input);
      expect(filtered).toBe("Contact [REDACTED] for support");
    });

    test("filters multiple email addresses", () => {
      const input = "From alice@example.com to bob@test.org";
      const filtered = filterPii(input);
      expect(filtered).toBe("From [REDACTED] to [REDACTED]");
    });

    test("filters API keys with common prefixes", () => {
      const input = "API key: sk_live_abc123xyz789abcdefghij";
      const filtered = filterPii(input);
      expect(filtered).toBe("API key: [REDACTED]");
    });

    test("filters GitHub tokens", () => {
      const input = "Token: ghp_abc123xyz789abcdefghijklmnopqrstu012";
      const filtered = filterPii(input);
      // The regex may match more broadly - check that the token is redacted
      expect(filtered).toContain("[REDACTED]");
      expect(filtered).not.toContain("ghp_");
    });

    test("filters credit card numbers", () => {
      const input = "Card: 1234-5678-9012-3456";
      const filtered = filterPii(input);
      expect(filtered).toBe("Card: [REDACTED]");
    });

    test("filters SSN patterns", () => {
      const input = "SSN: 123-45-6789";
      const filtered = filterPii(input);
      expect(filtered).toBe("SSN: [REDACTED]");
    });

    test("filters phone numbers", () => {
      const input = "Phone: 555-123-4567";
      const filtered = filterPii(input);
      expect(filtered).toContain("[REDACTED]");
      expect(filtered).not.toContain("555-123-4567");
    });

    test("filters IPv4 addresses", () => {
      const input = "Server at 192.168.1.100";
      const filtered = filterPii(input);
      expect(filtered).toBe("Server at [REDACTED]");
    });

    test("filters JWT tokens", () => {
      const input = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
      const filtered = filterPii(input);
      expect(filtered).toBe("Bearer [REDACTED]");
    });

    test("filters password patterns", () => {
      const input = 'password=secret123 and api_key="mykey"';
      const filtered = filterPii(input);
      expect(filtered).toContain("[REDACTED]");
    });

    test("replaces home directory with ~", () => {
      const home = homedir();
      const input = `File at ${home}/documents/file.txt`;
      const filtered = filterPii(input);
      expect(filtered).toBe("File at ~/documents/file.txt");
    });

    test("handles strings with no PII", () => {
      const input = "This is a normal log message";
      const filtered = filterPii(input);
      expect(filtered).toBe("This is a normal log message");
    });

    test("applies custom patterns", () => {
      const input = "Custom data: SECRET123";
      const customPatterns = [/SECRET\d+/g];
      const filtered = filterPii(input, customPatterns);
      expect(filtered).toBe("Custom data: [REDACTED]");
    });
  });

  describe("filterPiiFromObject", () => {
    test("filters PII from string values", () => {
      const obj = {
        message: "User user@example.com logged in",
        count: 5,
      };
      const filtered = filterPiiFromObject(obj);
      expect(filtered.message).toBe("User [REDACTED] logged in");
      expect(filtered.count).toBe(5);
    });

    test("filters PII from nested objects", () => {
      const obj = {
        data: {
          email: "test@example.com",
          name: "John",
        },
      };
      const filtered = filterPiiFromObject(obj);
      expect((filtered.data as Record<string, unknown>).email).toBe("[REDACTED]");
      expect((filtered.data as Record<string, unknown>).name).toBe("John");
    });

    test("filters PII from arrays", () => {
      const obj = {
        emails: ["a@example.com", "b@example.com"],
      };
      const filtered = filterPiiFromObject(obj);
      expect(filtered.emails).toEqual(["[REDACTED]", "[REDACTED]"]);
    });

    test("redacts sensitive keys entirely", () => {
      const obj = {
        password: "secret123",
        api_key: "sk_live_xyz", // underscore version matches
        token: "jwt_token_here",
        normal: "value",
        credential: "mysecret",
      };
      const filtered = filterPiiFromObject(obj);
      expect(filtered.password).toBe("[REDACTED]");
      expect(filtered.api_key).toBe("[REDACTED]");
      expect(filtered.token).toBe("[REDACTED]");
      expect(filtered.credential).toBe("[REDACTED]");
      expect(filtered.normal).toBe("value");
    });

    test("handles empty objects", () => {
      const filtered = filterPiiFromObject({});
      expect(filtered).toEqual({});
    });

    test("handles null and undefined values", () => {
      const obj = {
        nullVal: null,
        undefinedVal: undefined,
        normalVal: "test",
      };
      const filtered = filterPiiFromObject(obj);
      expect(filtered.nullVal).toBeNull();
      expect(filtered.undefinedVal).toBeUndefined();
      expect(filtered.normalVal).toBe("test");
    });
  });

  // ===========================================================================
  // SessionLogger Class
  // ===========================================================================

  describe("SessionLogger", () => {
    let logger: SessionLogger;
    const testSessionPrefix = `test-${Date.now()}-`;

    beforeEach(async () => {
      // Reset the singleton
      resetSessionLogger();

      // Create logger with test configuration
      logger = new SessionLogger({
        enabled: true,
        maxLogFiles: 5,
        maxFileSizeBytes: 1024 * 1024, // 1MB for testing
        enablePiiFiltering: true,
        customPiiPatterns: [],
        logLevels: ["debug", "info", "warn", "error"],
      });
    });

    afterEach(async () => {
      resetSessionLogger();
    });

    test("generates correct log file path", () => {
      const sessionId = "test-session-123";
      const path = logger.getLogPath(sessionId);
      expect(path).toContain(".atreides/logs/test-session-123.log");
    });

    test("logs entries with correct structure", async () => {
      const sessionId = `struct-test-${Date.now()}`;

      await logger.log(sessionId, "info", "session.created", {
        personaName: "Muad'Dib",
      });

      const entries = await logger.readLogs(sessionId);
      expect(entries.length).toBe(1);

      const entry = entries[0];
      expect(entry.timestamp).toBeDefined();
      expect(entry.level).toBe("info");
      expect(entry.sessionId).toBe(sessionId);
      expect(entry.event).toBe("session.created");
      expect(entry.data).toEqual({ personaName: "Muad'Dib" });
    });

    test("filters PII from log data", async () => {
      const sessionId = `pii-test-${Date.now()}`;

      await logger.log(sessionId, "info", "custom", {
        userEmail: "secret@example.com",
        normalData: "safe value",
      });

      const entries = await logger.readLogs(sessionId);
      expect(entries.length).toBe(1);

      const entry = entries[0];
      expect(entry.data?.userEmail).toBe("[REDACTED]");
      expect(entry.data?.normalData).toBe("safe value");
    });

    test("convenience methods work correctly", async () => {
      const sessionId = `convenience-test-${Date.now()}`;

      await logger.debug(sessionId, "tool.before", { tool: "bash" });
      await logger.info(sessionId, "session.created", {});
      await logger.warn(sessionId, "error.strike", { count: 1 });
      await logger.error(sessionId, "error.escalation", { count: 3 });

      const entries = await logger.readLogs(sessionId);
      expect(entries.length).toBe(4);
      expect(entries[0].level).toBe("debug");
      expect(entries[1].level).toBe("info");
      expect(entries[2].level).toBe("warn");
      expect(entries[3].level).toBe("error");
    });

    test("event-specific logging methods work", async () => {
      const sessionId = `event-test-${Date.now()}`;

      await logger.logSessionCreated(sessionId, { test: true });
      await logger.logPhaseTransition(sessionId, "idle", "intent", "user", "first message");
      await logger.logToolBefore(sessionId, "bash", { command: "ls" });
      await logger.logToolAfter(sessionId, "bash", true, 100);
      await logger.logErrorStrike(sessionId, 2, "bash", "command failed");
      await logger.logStateSaved(sessionId);

      const entries = await logger.readLogs(sessionId);
      expect(entries.length).toBe(6);
      expect(entries[0].event).toBe("session.created");
      expect(entries[1].event).toBe("phase.transition");
      expect(entries[2].event).toBe("tool.before");
      expect(entries[3].event).toBe("tool.after");
      expect(entries[4].event).toBe("error.strike");
      expect(entries[5].event).toBe("state.saved");
    });

    test("includes duration in log entries when provided", async () => {
      const sessionId = `duration-test-${Date.now()}`;

      await logger.log(sessionId, "info", "tool.after", { tool: "bash" }, 150);

      const entries = await logger.readLogs(sessionId);
      expect(entries[0].durationMs).toBe(150);
    });

    test("reads logs with offset and limit", async () => {
      const sessionId = `pagination-test-${Date.now()}`;

      // Create multiple entries
      for (let i = 0; i < 10; i++) {
        await logger.log(sessionId, "info", "custom", { index: i });
      }

      const entries = await logger.readLogs(sessionId, { offset: 3, limit: 4 });
      expect(entries.length).toBe(4);
      expect(entries[0].data?.index).toBe(3);
      expect(entries[3].data?.index).toBe(6);
    });

    test("reads logs filtered by level", async () => {
      const sessionId = `level-filter-test-${Date.now()}`;

      await logger.debug(sessionId, "custom", {});
      await logger.info(sessionId, "custom", {});
      await logger.warn(sessionId, "custom", {});
      await logger.error(sessionId, "custom", {});

      const warnEntries = await logger.readLogs(sessionId, { level: "warn" });
      expect(warnEntries.length).toBe(1);
      expect(warnEntries[0].level).toBe("warn");
    });

    test("returns empty array for non-existent session", async () => {
      const entries = await logger.readLogs(`non-existent-session-${Date.now()}`);
      expect(entries).toEqual([]);
    });

    test("respects log level filtering in config", async () => {
      const restrictedLogger = new SessionLogger({
        enabled: true,
        maxLogFiles: 5,
        maxFileSizeBytes: 1024 * 1024,
        enablePiiFiltering: true,
        customPiiPatterns: [],
        logLevels: ["warn", "error"], // Only warn and error
      });

      const sessionId = `level-restrict-test-${Date.now()}`;

      await restrictedLogger.debug(sessionId, "custom", {});
      await restrictedLogger.info(sessionId, "custom", {});
      await restrictedLogger.warn(sessionId, "custom", {});
      await restrictedLogger.error(sessionId, "custom", {});

      const entries = await restrictedLogger.readLogs(sessionId);
      expect(entries.length).toBe(2);
      expect(entries[0].level).toBe("warn");
      expect(entries[1].level).toBe("error");
    });

    test("disabled logger does not write files", async () => {
      const disabledLogger = new SessionLogger({
        enabled: false,
        maxLogFiles: 5,
        maxFileSizeBytes: 1024 * 1024,
        enablePiiFiltering: true,
        customPiiPatterns: [],
        logLevels: ["debug", "info", "warn", "error"],
      });

      const sessionId = `disabled-test-${Date.now()}`;

      await disabledLogger.log(sessionId, "info", "custom", {});

      const entries = await disabledLogger.readLogs(sessionId);
      expect(entries).toEqual([]);
    });

    test("handles logging with PII filtering disabled", async () => {
      const noFilterLogger = new SessionLogger({
        enabled: true,
        maxLogFiles: 5,
        maxFileSizeBytes: 1024 * 1024,
        enablePiiFiltering: false,
        customPiiPatterns: [],
        logLevels: ["debug", "info", "warn", "error"],
      });

      const sessionId = `no-filter-test-${Date.now()}`;
      const email = "test@example.com";

      await noFilterLogger.log(sessionId, "info", "custom", { email });

      const entries = await noFilterLogger.readLogs(sessionId);
      expect(entries[0].data?.email).toBe(email); // Not filtered
    });
  });

  // ===========================================================================
  // Log Cleanup
  // ===========================================================================

  describe("Log Cleanup", () => {
    test("cleanupOldLogs returns 0 when disabled", async () => {
      const disabledLogger = new SessionLogger({
        enabled: false,
        maxLogFiles: 5,
        maxFileSizeBytes: 1024 * 1024,
        enablePiiFiltering: true,
        customPiiPatterns: [],
        logLevels: ["debug", "info", "warn", "error"],
      });

      const deleted = await disabledLogger.cleanupOldLogs();
      expect(deleted).toBe(0);
    });
  });
});
