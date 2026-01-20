/**
 * Test Helpers Unit Tests
 *
 * Validates that the test utilities work correctly.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  createMockConfig,
  createMinimalConfig,
  createMockContext,
  createMockSession,
  createMockWorkflowState,
  createSessionInPhase,
  createMockSecurityPatterns,
  createMockBlockedFiles,
  createMockErrorOutputs,
  createMockErrorRecoveryState,
  createMockTodos,
  createMixedTodos,
  createMockToolExecution,
  createWorkflowToolHistory,
  wait,
  createTestSessionId,
  resetSessionCounter,
  measureTime,
  measureAsyncTime,
  benchmark,
  TEST_TIMEOUT,
} from "./test-helpers.js";

describe("Test Helpers", () => {
  beforeEach(() => {
    resetSessionCounter();
  });

  // ===========================================================================
  // Configuration Helpers
  // ===========================================================================

  describe("createMockConfig", () => {
    test("creates config with default values", () => {
      const config = createMockConfig();

      expect(config.identity.personaName).toBe("TestPersona");
      expect(config.identity.responsePrefix).toBe(true);
      expect(config.workflow.enablePhaseTracking).toBe(true);
      expect(config.security.enableObfuscationDetection).toBe(true);
    });

    test("allows overriding identity settings", () => {
      const config = createMockConfig({
        identity: {
          personaName: "CustomPersona",
          responsePrefix: false,
          delegationAnnouncements: false,
        },
      });

      expect(config.identity.personaName).toBe("CustomPersona");
      expect(config.identity.responsePrefix).toBe(false);
    });

    test("allows overriding workflow settings", () => {
      const config = createMockConfig({
        workflow: {
          enablePhaseTracking: false,
          strictTodoEnforcement: false,
          autoEscalateOnError: false,
        },
      });

      expect(config.workflow.enablePhaseTracking).toBe(false);
      expect(config.workflow.strictTodoEnforcement).toBe(false);
    });
  });

  describe("createMinimalConfig", () => {
    test("creates config with minimal settings", () => {
      const config = createMinimalConfig();

      expect(config.identity.responsePrefix).toBe(false);
      expect(config.workflow.enablePhaseTracking).toBe(false);
      expect(config.security.enableObfuscationDetection).toBe(false);
    });
  });

  // ===========================================================================
  // Context Helpers
  // ===========================================================================

  describe("createMockContext", () => {
    test("creates context with default values", () => {
      const context = createMockContext();

      expect(context.project.path).toBe("/test/project");
      expect(context.directory).toBe("/test/project");
      expect(context.client.notify).toBeDefined();
      expect(context.$).toBeDefined();
    });

    test("allows overriding project", () => {
      const context = createMockContext({
        project: { path: "/custom/path", name: "custom-project" },
      });

      expect(context.project.path).toBe("/custom/path");
      expect(context.project.name).toBe("custom-project");
    });
  });

  // ===========================================================================
  // Session State Helpers
  // ===========================================================================

  describe("createMockSession", () => {
    test("creates session with default values", () => {
      const session = createMockSession();

      expect(session.sessionId).toBe("test-session");
      expect(session.phase).toBe("idle");
      expect(session.errorCount).toBe(0);
      expect(session.todosCreated).toBe(false);
      expect(session.toolHistory).toEqual([]);
    });

    test("allows custom session ID", () => {
      const session = createMockSession("custom-session-id");
      expect(session.sessionId).toBe("custom-session-id");
    });

    test("allows overrides", () => {
      const session = createMockSession("test", {
        phase: "exploration",
        errorCount: 2,
      });

      expect(session.phase).toBe("exploration");
      expect(session.errorCount).toBe(2);
    });
  });

  describe("createSessionInPhase", () => {
    test("creates session in specified phase", () => {
      const session = createSessionInPhase("implementation");

      expect(session.phase).toBe("implementation");
      expect(session.workflow.currentPhase).toBe("implementation");
    });
  });

  // ===========================================================================
  // Security Test Helpers
  // ===========================================================================

  describe("createMockSecurityPatterns", () => {
    test("provides blocked patterns", () => {
      const patterns = createMockSecurityPatterns();

      expect(patterns.blocked.length).toBeGreaterThan(0);
      expect(patterns.blocked).toContain("rm -rf /");
    });

    test("provides obfuscated patterns", () => {
      const patterns = createMockSecurityPatterns();

      expect(patterns.obfuscated.length).toBeGreaterThan(0);
      expect(patterns.obfuscated).toContain("rm%20-rf%20/");
    });

    test("provides safe patterns", () => {
      const patterns = createMockSecurityPatterns();

      expect(patterns.safe.length).toBeGreaterThan(0);
      expect(patterns.safe).toContain("ls -la");
    });
  });

  describe("createMockBlockedFiles", () => {
    test("provides blocked file patterns", () => {
      const files = createMockBlockedFiles();

      expect(files.blocked).toContain(".env");
      expect(files.blocked).toContain("secrets.json");
    });

    test("provides safe file patterns", () => {
      const files = createMockBlockedFiles();

      expect(files.safe).toContain("package.json");
      expect(files.safe).toContain("src/index.ts");
    });
  });

  // ===========================================================================
  // Error Recovery Helpers
  // ===========================================================================

  describe("createMockErrorOutputs", () => {
    test("provides error outputs with categories", () => {
      const outputs = createMockErrorOutputs();

      expect(outputs.errors.length).toBeGreaterThan(0);
      expect(outputs.errors[0].category).toBeDefined();
      expect(outputs.errors[0].output).toBeDefined();
    });

    test("provides success outputs", () => {
      const outputs = createMockErrorOutputs();

      expect(outputs.success.length).toBeGreaterThan(0);
      expect(outputs.success).toContain("All tests passed");
    });
  });

  describe("createMockErrorRecoveryState", () => {
    test("creates non-escalated state by default", () => {
      const state = createMockErrorRecoveryState();
      expect(state.escalated).toBe(false);
    });

    test("allows overriding escalated state", () => {
      const state = createMockErrorRecoveryState({ escalated: true });
      expect(state.escalated).toBe(true);
    });
  });

  // ===========================================================================
  // Todo Helpers
  // ===========================================================================

  describe("createMockTodos", () => {
    test("creates specified number of todos", () => {
      const todos = createMockTodos(5);
      expect(todos.length).toBe(5);
    });

    test("creates todos with unique IDs", () => {
      const todos = createMockTodos(3);
      const ids = new Set(todos.map((t) => t.id));
      expect(ids.size).toBe(3);
    });

    test("creates incomplete todos by default", () => {
      const todos = createMockTodos(2);
      expect(todos.every((t) => t.completedAt === undefined)).toBe(true);
    });
  });

  describe("createMixedTodos", () => {
    test("creates mix of pending and completed", () => {
      const { pending, completed } = createMixedTodos(3, 2);

      expect(pending.length).toBe(3);
      expect(completed.length).toBe(2);
      expect(pending.every((t) => t.completedAt === undefined)).toBe(true);
      expect(completed.every((t) => t.completedAt !== undefined)).toBe(true);
    });
  });

  // ===========================================================================
  // Tool History Helpers
  // ===========================================================================

  describe("createMockToolExecution", () => {
    test("creates successful execution by default", () => {
      const exec = createMockToolExecution("read");

      expect(exec.tool).toBe("read");
      expect(exec.success).toBe(true);
      expect(exec.timestamp).toBeInstanceOf(Date);
    });

    test("allows creating failed execution", () => {
      const exec = createMockToolExecution("bash", false, {
        error: "Command failed",
      });

      expect(exec.success).toBe(false);
      expect(exec.error).toBe("Command failed");
    });
  });

  describe("createWorkflowToolHistory", () => {
    test("creates realistic workflow sequence", () => {
      const history = createWorkflowToolHistory();

      expect(history.length).toBeGreaterThan(0);
      expect(history[0].tool).toBe("read");
      expect(history[history.length - 1].tool).toBe("bash");
    });
  });

  // ===========================================================================
  // Async Helpers
  // ===========================================================================

  describe("wait", () => {
    test("waits for specified duration", async () => {
      const start = Date.now();
      await wait(50);
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(45);
    });
  });

  describe("createTestSessionId", () => {
    test("creates unique session IDs", () => {
      const id1 = createTestSessionId();
      const id2 = createTestSessionId();

      expect(id1).not.toBe(id2);
    });

    test("uses custom prefix", () => {
      const id = createTestSessionId("custom");
      expect(id).toContain("custom-session");
    });
  });

  describe("resetSessionCounter", () => {
    test("resets counter for new session IDs", () => {
      createTestSessionId();
      createTestSessionId();
      resetSessionCounter();

      const id = createTestSessionId();
      expect(id).toContain("session-1-");
    });
  });

  // ===========================================================================
  // Performance Helpers
  // ===========================================================================

  describe("measureTime", () => {
    test("measures synchronous function execution", () => {
      const { result, durationMs } = measureTime(() => {
        let sum = 0;
        for (let i = 0; i < 1000; i++) sum += i;
        return sum;
      });

      expect(result).toBe(499500);
      expect(durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("measureAsyncTime", () => {
    test("measures async function execution", async () => {
      const { result, durationMs } = await measureAsyncTime(async () => {
        await wait(10);
        return "done";
      });

      expect(result).toBe("done");
      expect(durationMs).toBeGreaterThanOrEqual(5);
    });
  });

  describe("benchmark", () => {
    test("runs function multiple times and returns stats", () => {
      const stats = benchmark(() => 1 + 1, 10);

      expect(stats.results.length).toBe(10);
      expect(stats.avg).toBeGreaterThanOrEqual(0);
      expect(stats.min).toBeLessThanOrEqual(stats.max);
    });
  });

  // ===========================================================================
  // Constants
  // ===========================================================================

  describe("TEST_TIMEOUT", () => {
    test("has expected timeout values", () => {
      expect(TEST_TIMEOUT.unit).toBe(5000);
      expect(TEST_TIMEOUT.integration).toBe(10000);
      expect(TEST_TIMEOUT.e2e).toBe(30000);
    });
  });
});
