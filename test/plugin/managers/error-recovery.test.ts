import { describe, expect, test, beforeEach } from "bun:test";
import * as ErrorRecovery from "../../../src/plugin/managers/error-recovery";
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

describe("ErrorRecovery - Error Pattern Detection", () => {
  // All 22 error patterns should be detected
  const errorPatternTests = [
    // Shell/Command errors
    { name: "command not found", input: "bash: foo: command not found", category: "command" },
    { name: "permission denied", input: "Permission denied: cannot access /etc/shadow", category: "permission" },
    { name: "no such file or directory", input: "No such file or directory: /tmp/missing.txt", category: "file" },
    { name: "ENOENT", input: "Error: ENOENT: no such file or directory, open '/tmp/missing.txt'", category: "file" },
    { name: "EACCES", input: "Error: EACCES: permission denied, open '/etc/passwd'", category: "permission" },
    { name: "EPERM", input: "Error: EPERM: operation not permitted", category: "permission" },

    // Module/Import errors
    { name: "cannot find module", input: "Error: Cannot find module 'nonexistent-package'", category: "module" },
    { name: "module not found", input: "Module not found: Error: Can't resolve 'missing'", category: "module" },
    { name: "import not found", input: "SyntaxError: import { foo } not found in 'bar'", category: "syntax" },

    // Compilation/Build errors
    { name: "failed to compile", input: "Failed to compile.\n\nModule not found: Error", category: "build" },
    { name: "compilation failed", input: "Compilation failed: 2 errors found", category: "build" },
    { name: "build failed", input: "Build failed with exit code 1", category: "build" },

    // Test failures
    { name: "test failed", input: "FAIL src/app.test.ts\nTest failed: expected true", category: "test" },
    { name: "tests failing", input: "3 tests failing out of 10", category: "test" },
    { name: "FAILED (uppercase)", input: "FAILED tests/unit/test_app.py::test_example", category: "test" },

    // Language-specific errors
    { name: "SyntaxError", input: "SyntaxError: Unexpected token ';'", category: "syntax" },
    { name: "TypeError", input: "TypeError: undefined is not a function", category: "type" },
    { name: "ReferenceError", input: "ReferenceError: foo is not defined", category: "type" },
    { name: "null pointer", input: "java.lang.NullPointerException: null pointer reference", category: "type" },
    { name: "segmentation fault", input: "Segmentation fault (core dumped)", category: "memory" },
    { name: "undefined is not", input: "TypeError: undefined is not an object", category: "type" },

    // Runtime errors
    { name: "exception", input: "Unhandled exception in thread main", category: "generic" },
    { name: "Exception:", input: "Exception: Invalid argument provided", category: "generic" },
    { name: "traceback (lowercase)", input: "traceback (most recent call last):", category: "generic" },
    { name: "Traceback (uppercase)", input: "Traceback (most recent call last):", category: "generic" },

    // Network errors
    { name: "connection refused", input: "Error: connect ECONNREFUSED 127.0.0.1:3000", category: "network" },
    { name: "ECONNREFUSED", input: "ECONNREFUSED - Connection refused", category: "network" },
    { name: "timeout", input: "Error: timeout of 5000ms exceeded", category: "network" },
    { name: "ETIMEDOUT", input: "ETIMEDOUT: connection timed out", category: "network" },

    // Resource errors
    { name: "out of memory", input: "FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory", category: "memory" },
    { name: "ENOMEM", input: "Error: ENOMEM: not enough memory", category: "memory" },

    // Generic error indicators
    { name: "error: (lowercase)", input: "error: TS2345: Argument of type 'string' is not assignable", category: "generic" },
    { name: "ERROR: (uppercase)", input: "ERROR: Missing required parameter", category: "generic" },
    { name: "Error (word boundary)", input: "Error occurred during processing", category: "generic" },
  ];

  test.each(errorPatternTests)("detects '$name' pattern", ({ input }) => {
    expect(ErrorRecovery.detectError(input)).toBe(true);
  });

  test("does not detect error in normal output", () => {
    expect(ErrorRecovery.detectError("Build successful")).toBe(false);
    expect(ErrorRecovery.detectError("All tests passed")).toBe(false);
    expect(ErrorRecovery.detectError("File saved")).toBe(false);
    expect(ErrorRecovery.detectError("npm install completed")).toBe(false);
    expect(ErrorRecovery.detectError("")).toBe(false);
  });

  test("handles null and undefined output", () => {
    expect(ErrorRecovery.detectError(null)).toBe(false);
    expect(ErrorRecovery.detectError(undefined)).toBe(false);
  });

  test("detects errors in object output with stdout", () => {
    const output = { stdout: "", stderr: "command not found", exitCode: 127 };
    expect(ErrorRecovery.detectError(output)).toBe(true);
  });

  test("detects errors in object output with error property", () => {
    const output = { error: { message: "Permission denied" } };
    expect(ErrorRecovery.detectError(output)).toBe(true);
  });

  test("ERROR_PATTERNS has 22+ patterns", () => {
    expect(ErrorRecovery.ERROR_PATTERNS.length).toBeGreaterThanOrEqual(22);
  });
});

describe("ErrorRecovery - Pattern Category Detection", () => {
  test("getRecoverySuggestion returns correct category for command error", () => {
    const suggestion = ErrorRecovery.getRecoverySuggestion("bash: foo: command not found");
    expect(suggestion.category).toBe("command");
  });

  test("getRecoverySuggestion returns correct category for permission error", () => {
    const suggestion = ErrorRecovery.getRecoverySuggestion("Permission denied");
    expect(suggestion.category).toBe("permission");
  });

  test("getRecoverySuggestion returns correct category for module error", () => {
    const suggestion = ErrorRecovery.getRecoverySuggestion("Cannot find module 'foo'");
    expect(suggestion.category).toBe("module");
  });

  test("getRecoverySuggestion returns generic for unknown error", () => {
    const suggestion = ErrorRecovery.getRecoverySuggestion("Unknown error occurred");
    expect(suggestion.category).toBe("generic");
  });

  test("getRecoverySuggestion returns generic for non-error output", () => {
    const suggestion = ErrorRecovery.getRecoverySuggestion("All good");
    expect(suggestion.category).toBe("generic");
  });
});

describe("ErrorRecovery - Recovery Suggestions", () => {
  test("recovery suggestions have meaningful content", () => {
    const categories = Object.keys(ErrorRecovery.RECOVERY_SUGGESTIONS) as Array<
      keyof typeof ErrorRecovery.RECOVERY_SUGGESTIONS
    >;

    for (const category of categories) {
      const suggestion = ErrorRecovery.RECOVERY_SUGGESTIONS[category];
      expect(suggestion.category).toBe(category);
      expect(suggestion.message).toBeTruthy();
      expect(suggestion.suggestions.length).toBeGreaterThan(0);
      suggestion.suggestions.forEach((s) => {
        expect(s).toBeTruthy();
      });
    }
  });

  test("formatRecoverySuggestion creates readable output", () => {
    const suggestion = ErrorRecovery.RECOVERY_SUGGESTIONS.command;
    const formatted = ErrorRecovery.formatRecoverySuggestion(suggestion);

    expect(formatted).toContain("[ERROR RECOVERY");
    expect(formatted).toContain("Suggested actions:");
    expect(formatted).toContain("Stilgar escalation");
  });
});

describe("ErrorRecovery - 3-Strike Protocol", () => {
  beforeEach(() => {
    SessionManager.clearSessions();
    SessionManager.setDefaultConfig(createMockConfig());
  });

  test("strike 1: logs error and continues", async () => {
    SessionManager.getState("test-session");

    const result = await ErrorRecovery.checkForErrors(
      "bash",
      "bash: foo: command not found",
      "test-session"
    );

    expect(result.errorDetected).toBe(true);
    expect(result.strikeCount).toBe(1);
    expect(result.action).toBe("logged");
    expect(result.suggestion).toBeDefined();
  });

  test("strike 2: provides recovery suggestions", async () => {
    SessionManager.getState("test-session");

    // First error (use pattern that matches)
    await ErrorRecovery.checkForErrors("bash", "error: something went wrong", "test-session");

    // Second error
    const result = await ErrorRecovery.checkForErrors(
      "bash",
      "error: another failure",
      "test-session"
    );

    expect(result.errorDetected).toBe(true);
    expect(result.strikeCount).toBe(2);
    expect(result.action).toBe("suggested");
    expect(result.recoveryMessage).toBeTruthy();
    expect(result.recoveryMessage).toContain("Suggested actions:");
  });

  test("strike 3: escalates to Stilgar", async () => {
    SessionManager.getState("test-session");

    // First two errors
    await ErrorRecovery.checkForErrors("bash", "error: first failure", "test-session");
    await ErrorRecovery.checkForErrors("bash", "error: second failure", "test-session");

    // Third error - should escalate
    const result = await ErrorRecovery.checkForErrors(
      "bash",
      "error: third failure",
      "test-session"
    );

    expect(result.errorDetected).toBe(true);
    expect(result.strikeCount).toBe(3);
    expect(result.action).toBe("escalated");
    expect(result.escalationMessage).toBeTruthy();
    expect(result.escalationMessage).toContain("STILGAR ESCALATION");
  });

  test("successful operation resets strike counter", async () => {
    SessionManager.getState("test-session");

    // Two errors
    await ErrorRecovery.checkForErrors("bash", "error: first", "test-session");
    await ErrorRecovery.checkForErrors("bash", "error: second", "test-session");
    expect(ErrorRecovery.getStrikeCount("test-session")).toBe(2);

    // Successful operation
    const result = await ErrorRecovery.checkForErrors(
      "bash",
      "Success!",
      "test-session"
    );

    expect(result.errorDetected).toBe(false);
    expect(result.strikeCount).toBe(0);
    expect(result.action).toBe("reset");
    expect(ErrorRecovery.getStrikeCount("test-session")).toBe(0);
  });

  test("isEscalated returns true after 3 strikes", async () => {
    SessionManager.getState("test-session");

    expect(ErrorRecovery.isEscalated("test-session")).toBe(false);

    // Three errors
    await ErrorRecovery.checkForErrors("bash", "error: one", "test-session");
    await ErrorRecovery.checkForErrors("bash", "error: two", "test-session");
    await ErrorRecovery.checkForErrors("bash", "error: three", "test-session");

    expect(ErrorRecovery.isEscalated("test-session")).toBe(true);
  });

  test("successful operation clears escalation state", async () => {
    SessionManager.getState("test-session");

    // Trigger escalation
    await ErrorRecovery.checkForErrors("bash", "error: one", "test-session");
    await ErrorRecovery.checkForErrors("bash", "error: two", "test-session");
    await ErrorRecovery.checkForErrors("bash", "error: three", "test-session");
    expect(ErrorRecovery.isEscalated("test-session")).toBe(true);

    // Successful operation
    await ErrorRecovery.checkForErrors("bash", "Success!", "test-session");
    expect(ErrorRecovery.isEscalated("test-session")).toBe(false);
  });

  test("strike count persists across 4+ errors", async () => {
    SessionManager.getState("test-session");

    for (let i = 1; i <= 5; i++) {
      const result = await ErrorRecovery.checkForErrors(
        "bash",
        `error: failure number ${i}`,
        "test-session"
      );
      expect(result.strikeCount).toBe(i);
      if (i >= 3) {
        expect(result.action).toBe("escalated");
      }
    }
  });
});

describe("ErrorRecovery - State Management", () => {
  beforeEach(() => {
    SessionManager.clearSessions();
    SessionManager.setDefaultConfig(createMockConfig());
  });

  test("getStrikeCount returns 0 for new session", () => {
    SessionManager.getState("new-session");
    expect(ErrorRecovery.getStrikeCount("new-session")).toBe(0);
  });

  test("getStrikeCount returns 0 for non-existent session", () => {
    expect(ErrorRecovery.getStrikeCount("nonexistent")).toBe(0);
  });

  test("getErrorRecoveryState returns state after errors", async () => {
    SessionManager.getState("test-session");

    await ErrorRecovery.checkForErrors("bash", "error: first", "test-session");
    await ErrorRecovery.checkForErrors("bash", "error: second", "test-session");
    await ErrorRecovery.checkForErrors("bash", "error: third", "test-session");

    const state = ErrorRecovery.getErrorRecoveryState("test-session");

    expect(state).toBeDefined();
    expect(state?.escalated).toBe(true);
    expect(state?.escalatedAt).toBeDefined();
    expect(state?.triggeringTool).toBe("bash");
    expect(state?.strikeCount).toBe(3);
  });

  test("resetErrorRecovery clears all state", async () => {
    SessionManager.getState("test-session");

    // Trigger escalation
    await ErrorRecovery.checkForErrors("bash", "error: first", "test-session");
    await ErrorRecovery.checkForErrors("bash", "error: second", "test-session");
    await ErrorRecovery.checkForErrors("bash", "error: third", "test-session");

    expect(ErrorRecovery.getStrikeCount("test-session")).toBe(3);
    expect(ErrorRecovery.isEscalated("test-session")).toBe(true);

    ErrorRecovery.resetErrorRecovery("test-session");

    expect(ErrorRecovery.getStrikeCount("test-session")).toBe(0);
    expect(ErrorRecovery.isEscalated("test-session")).toBe(false);
    expect(ErrorRecovery.getErrorRecoveryState("test-session")).toBeUndefined();
  });

  test("last error info is stored", async () => {
    SessionManager.getState("test-session");

    await ErrorRecovery.checkForErrors(
      "bash",
      "Permission denied: cannot access /etc/shadow",
      "test-session"
    );

    const lastError = SessionManager.getMetadata("test-session", "lastError") as {
      timestamp: number;
      tool: string;
      output: string;
      category: string;
    };

    expect(lastError).toBeDefined();
    expect(lastError.tool).toBe("bash");
    expect(lastError.output).toContain("Permission denied");
    expect(lastError.category).toBe("permission");
    expect(lastError.timestamp).toBeDefined();
  });
});

describe("ErrorRecovery - Output Text Extraction", () => {
  test("extracts text from string", () => {
    expect(ErrorRecovery.extractOutputText("hello world")).toBe("hello world");
  });

  test("extracts text from object with stdout", () => {
    const output = { stdout: "standard output", stderr: "", exitCode: 0 };
    expect(ErrorRecovery.extractOutputText(output)).toContain("standard output");
  });

  test("extracts text from object with stderr", () => {
    const output = { stdout: "", stderr: "error output", exitCode: 1 };
    expect(ErrorRecovery.extractOutputText(output)).toContain("error output");
  });

  test("extracts text from object with message", () => {
    const output = { message: "error message" };
    expect(ErrorRecovery.extractOutputText(output)).toContain("error message");
  });

  test("extracts text from nested error object", () => {
    const output = { error: { message: "nested error" } };
    expect(ErrorRecovery.extractOutputText(output)).toContain("nested error");
  });

  test("combines multiple output properties", () => {
    const output = {
      stdout: "stdout text",
      stderr: "stderr text",
      message: "message text",
    };
    const extracted = ErrorRecovery.extractOutputText(output);
    expect(extracted).toContain("stdout text");
    expect(extracted).toContain("stderr text");
    expect(extracted).toContain("message text");
  });

  test("returns empty string for null/undefined", () => {
    expect(ErrorRecovery.extractOutputText(null)).toBe("");
    expect(ErrorRecovery.extractOutputText(undefined)).toBe("");
  });

  test("converts numbers to string", () => {
    expect(ErrorRecovery.extractOutputText(42)).toBe("42");
  });
});

describe("ErrorRecovery - Escalation Message", () => {
  beforeEach(() => {
    SessionManager.clearSessions();
    SessionManager.setDefaultConfig(createMockConfig());
  });

  test("escalation message contains required sections", async () => {
    SessionManager.getState("test-session");

    await ErrorRecovery.checkForErrors("bash", "error: first", "test-session");
    await ErrorRecovery.checkForErrors("bash", "error: second", "test-session");
    const result = await ErrorRecovery.checkForErrors(
      "bash",
      "Permission denied",
      "test-session"
    );

    const message = result.escalationMessage!;

    expect(message).toContain("STILGAR ESCALATION");
    expect(message).toContain("3-Strike Protocol Triggered");
    expect(message).toContain("Error category:");
    expect(message).toContain("Triggering tool: bash");
    expect(message).toContain("Error context:");
    expect(message).toContain("Recommended approach:");
    expect(message).toContain("Standard recovery suggestions:");
  });

  test("escalation message includes error output", async () => {
    SessionManager.getState("test-session");

    const errorOutput = "error: Cannot connect to database";

    await ErrorRecovery.checkForErrors("bash", "error: first", "test-session");
    await ErrorRecovery.checkForErrors("bash", "error: second", "test-session");
    const result = await ErrorRecovery.checkForErrors(
      "bash",
      errorOutput,
      "test-session"
    );

    expect(result.escalationMessage).toContain("Cannot connect");
  });
});

describe("ErrorRecovery - Performance", () => {
  test("detectError completes in under 5ms for normal output", () => {
    const output = "This is a normal output without any errors. Everything is fine.";

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      ErrorRecovery.detectError(output);
    }
    const elapsed = performance.now() - start;

    // 100 calls should complete in under 500ms (5ms each)
    expect(elapsed).toBeLessThan(500);
  });

  test("detectError completes in under 5ms for error output", () => {
    const output = "bash: command not found: foo";

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      ErrorRecovery.detectError(output);
    }
    const elapsed = performance.now() - start;

    // 100 calls should complete in under 500ms (5ms each)
    expect(elapsed).toBeLessThan(500);
  });

  test("detectError handles large output efficiently", () => {
    // Create a 100KB output string
    const largeOutput = "x".repeat(100000) + " error: something went wrong";

    const start = performance.now();
    ErrorRecovery.detectError(largeOutput);
    const elapsed = performance.now() - start;

    // Single call with large output should still be fast
    expect(elapsed).toBeLessThan(50);
  });
});

describe("ErrorRecovery - Edge Cases", () => {
  beforeEach(() => {
    SessionManager.clearSessions();
    SessionManager.setDefaultConfig(createMockConfig());
  });

  test("handles empty string output", async () => {
    SessionManager.getState("test-session");

    const result = await ErrorRecovery.checkForErrors("bash", "", "test-session");

    expect(result.errorDetected).toBe(false);
    expect(result.action).toBe("none");
  });

  test("handles output with only whitespace", async () => {
    SessionManager.getState("test-session");

    const result = await ErrorRecovery.checkForErrors(
      "bash",
      "   \n\t  ",
      "test-session"
    );

    expect(result.errorDetected).toBe(false);
  });

  test("handles very long error messages", async () => {
    SessionManager.getState("test-session");

    const longError = "Error: " + "x".repeat(10000);

    const result = await ErrorRecovery.checkForErrors(
      "bash",
      longError,
      "test-session"
    );

    expect(result.errorDetected).toBe(true);
  });

  test("handles multiple error patterns in same output", () => {
    const output = "error: command not found\nPermission denied\nENOENT";

    expect(ErrorRecovery.detectError(output)).toBe(true);

    // Should return first matching pattern's category
    const suggestion = ErrorRecovery.getRecoverySuggestion(output);
    expect(suggestion.category).toBeDefined();
  });

  test("case insensitivity for error patterns", () => {
    expect(ErrorRecovery.detectError("COMMAND NOT FOUND")).toBe(true);
    expect(ErrorRecovery.detectError("command not found")).toBe(true);
    expect(ErrorRecovery.detectError("Command Not Found")).toBe(true);
    expect(ErrorRecovery.detectError("PERMISSION DENIED")).toBe(true);
    expect(ErrorRecovery.detectError("syntaxerror")).toBe(true);
  });

  test("does not false positive on similar words", () => {
    // "error" in middle of word shouldn't trigger
    expect(ErrorRecovery.detectError("terrorize")).toBe(false);
    expect(ErrorRecovery.detectError("mirror")).toBe(false);
    // But "Error" as word should trigger
    expect(ErrorRecovery.detectError("An Error occurred")).toBe(true);
  });
});

describe("ErrorRecovery - Integration with SessionManager", () => {
  beforeEach(() => {
    SessionManager.clearSessions();
    SessionManager.setDefaultConfig(createMockConfig());
  });

  test("error count syncs with SessionManager", async () => {
    SessionManager.getState("test-session");

    await ErrorRecovery.checkForErrors("bash", "error: first", "test-session");
    expect(SessionManager.getState("test-session").errorCount).toBe(1);

    await ErrorRecovery.checkForErrors("bash", "error: second", "test-session");
    expect(SessionManager.getState("test-session").errorCount).toBe(2);

    await ErrorRecovery.checkForErrors("bash", "success", "test-session");
    expect(SessionManager.getState("test-session").errorCount).toBe(0);
  });

  test("metadata is properly stored and retrieved", async () => {
    SessionManager.getState("test-session");

    await ErrorRecovery.checkForErrors("bash", "error: first", "test-session");
    await ErrorRecovery.checkForErrors("bash", "error: second", "test-session");
    await ErrorRecovery.checkForErrors("bash", "error: third", "test-session");

    // Check errorRecovery metadata
    const errorRecovery = SessionManager.getMetadata(
      "test-session",
      "errorRecovery"
    );
    expect(errorRecovery).toBeDefined();

    // Check lastError metadata
    const lastError = SessionManager.getMetadata("test-session", "lastError");
    expect(lastError).toBeDefined();
  });

  test("multiple sessions maintain independent state", async () => {
    SessionManager.getState("session-1");
    SessionManager.getState("session-2");

    // Session 1 gets 2 errors
    await ErrorRecovery.checkForErrors("bash", "error: one", "session-1");
    await ErrorRecovery.checkForErrors("bash", "error: two", "session-1");

    // Session 2 gets 1 error
    await ErrorRecovery.checkForErrors("bash", "error: one", "session-2");

    expect(ErrorRecovery.getStrikeCount("session-1")).toBe(2);
    expect(ErrorRecovery.getStrikeCount("session-2")).toBe(1);

    // Session 1 escalates
    await ErrorRecovery.checkForErrors("bash", "error: three", "session-1");
    expect(ErrorRecovery.isEscalated("session-1")).toBe(true);
    expect(ErrorRecovery.isEscalated("session-2")).toBe(false);
  });
});
