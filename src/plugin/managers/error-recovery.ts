/**
 * ErrorRecovery - Error detection and 3-strike recovery protocol
 *
 * Implements automatic error detection from tool outputs and a 3-strike
 * escalation protocol. On consecutive errors:
 * - Strike 1: Log warning, continue
 * - Strike 2: Show warning, suggest fixes
 * - Strike 3+: Escalate to Stilgar (Oracle) agent
 *
 * Key features:
 * - 22 error patterns from deep dive analysis
 * - Pattern-specific recovery suggestions
 * - Strike counter management via SessionManager
 * - Stilgar escalation with context injection
 */

import * as SessionManager from "./session-manager.js";
import { createLogger } from "../../lib/logger.js";
import type { ErrorRecoveryState, ErrorRecoveryResult, RecoverySuggestion } from "../types.js";

const logger = createLogger("atreides:error-recovery");

/**
 * Error patterns for detecting failures in tool outputs.
 *
 * ## Official 22 Patterns (Deep Dive Analysis)
 *
 * The original 22 patterns identified in the deep dive analysis are marked with [OFFICIAL].
 * These patterns were derived from analysis of common CI/CD failures, build errors,
 * and runtime exceptions across multiple languages and frameworks.
 *
 * Additional patterns (marked [EXTENDED]) have been added for improved detection
 * but are considered lower priority.
 *
 * ## Pattern Ordering
 *
 * Patterns are ordered by specificity (most specific first):
 * 1. Node.js error codes (ENOENT, EACCES, etc.)
 * 2. Language-specific errors (SyntaxError, TypeError, etc.)
 * 3. Build/compilation errors
 * 4. Test failures
 * 5. Network errors
 * 6. Generic indicators (last, to avoid false positives)
 *
 * ## False Positive Prevention
 *
 * The generic patterns at the end (`/\bError\b/`, `/\bfailed\b/i`) are intentionally
 * broad to catch edge cases. To reduce false positives:
 * - Check structural indicators first (exitCode, error property)
 * - Use word boundaries (\b) to avoid partial matches
 * - The `/\berror:/i` pattern requires a colon to match formatted error messages
 */
export const ERROR_PATTERNS: readonly RegExp[] = [
  // ==========================================================================
  // Shell/Command errors [OFFICIAL: 1-6]
  // ==========================================================================
  /command not found/i,                    // [OFFICIAL] Bash command errors
  /permission denied/i,                    // [OFFICIAL] File/process permissions
  /no such file or directory/i,            // [OFFICIAL] File system errors
  /ENOENT/i,                               // [OFFICIAL] Node.js: file not found
  /EACCES/i,                               // [OFFICIAL] Node.js: permission denied
  /EPERM/i,                                // [OFFICIAL] Node.js: operation not permitted

  // ==========================================================================
  // Module/Import errors [OFFICIAL: 7-9]
  // ==========================================================================
  /cannot find module/i,                   // [OFFICIAL] Node.js module resolution
  /module not found/i,                     // [OFFICIAL] Webpack/bundler errors
  /import .* not found/i,                  // [OFFICIAL] ES module import errors

  // ==========================================================================
  // Compilation/Build errors [OFFICIAL: 10-12]
  // ==========================================================================
  /failed to compile/i,                    // [OFFICIAL] Generic compilation failure
  /compilation failed/i,                   // [OFFICIAL] Alternative phrasing
  /build failed/i,                         // [OFFICIAL] Build system errors

  // ==========================================================================
  // Test failures [OFFICIAL: 13-15]
  // ==========================================================================
  /test.*failed/i,                         // [OFFICIAL] Generic test failure
  /tests? (failed|failing)/i,              // [OFFICIAL] Plural/verb forms
  /FAILED/,                                // [OFFICIAL] Jest/Mocha uppercase output

  // ==========================================================================
  // Language-specific errors [OFFICIAL: 16-21]
  // ==========================================================================
  /SyntaxError/i,                          // [OFFICIAL] JS/Python syntax errors
  /TypeError/i,                            // [OFFICIAL] Type-related errors
  /ReferenceError/i,                       // [OFFICIAL] Undefined variable access
  /null pointer/i,                         // [OFFICIAL] Java/C++ null errors
  /segmentation fault/i,                   // [OFFICIAL] C/C++ memory errors
  /undefined is not/i,                     // [OFFICIAL] JS undefined errors

  // ==========================================================================
  // Runtime errors [EXTENDED: exception handling]
  // ==========================================================================
  /\bexception\b/i,                        // [EXTENDED] Generic exception (word boundary)
  /Exception:/,                            // [EXTENDED] Java-style exception format
  /traceback \(most recent call last\)/i,  // [EXTENDED] Python traceback header
  /Traceback/,                             // [EXTENDED] Python traceback (capital)

  // ==========================================================================
  // Network errors [OFFICIAL: 22 + EXTENDED]
  // ==========================================================================
  /connection refused/i,                   // [OFFICIAL] Network connection errors
  /ECONNREFUSED/i,                         // [EXTENDED] Node.js connection refused
  /ETIMEDOUT/i,                            // [EXTENDED] Node.js timeout error

  // ==========================================================================
  // Resource errors [EXTENDED]
  // ==========================================================================
  /out of memory/i,                        // [EXTENDED] Memory exhaustion
  /ENOMEM/i,                               // [EXTENDED] Node.js out of memory

  // ==========================================================================
  // Generic error indicators [EXTENDED - use with caution]
  // ==========================================================================
  // These patterns are intentionally placed last and use word boundaries
  // to minimize false positives. They catch formatted error messages.
  /\berror:(?!\s*0\b)/i,                   // [EXTENDED] "error:" but not "error: 0" (exit code)
  /\bERROR:(?!\s*None)/,                   // [EXTENDED] Uppercase ERROR: (not ERROR: None)
  /\bError\b(?!\.prototype)/,              // [EXTENDED] "Error" but not "Error.prototype"
  /\bfatal error\b/i,                      // [EXTENDED] Fatal errors (high confidence)
] as const;

/**
 * Count of official patterns from deep dive (for reference).
 * This includes patterns 1-22 as marked above.
 */
export const OFFICIAL_PATTERN_COUNT = 22;

/**
 * Pattern category mapping for recovery suggestions.
 */
type ErrorCategory =
  | "command"
  | "permission"
  | "file"
  | "module"
  | "build"
  | "test"
  | "syntax"
  | "type"
  | "network"
  | "memory"
  | "generic";

/**
 * Map patterns to categories for targeted recovery suggestions.
 *
 * This map must include every pattern in ERROR_PATTERNS to ensure
 * all detected errors receive appropriate recovery suggestions.
 *
 * Categories:
 * - command: Shell command not found or execution errors
 * - permission: File or process permission denied
 * - file: File or directory not found
 * - module: Module/import resolution failures
 * - build: Compilation and build errors
 * - test: Test failures and assertions
 * - syntax: Syntax errors in code
 * - type: Type errors and null references
 * - network: Connection and timeout errors
 * - memory: Memory exhaustion and segfaults
 * - generic: Catch-all for unclassified errors
 */
const PATTERN_CATEGORIES: Map<RegExp, ErrorCategory> = new Map([
  // Shell/Command errors → command, permission, file
  [/command not found/i, "command"],
  [/permission denied/i, "permission"],
  [/no such file or directory/i, "file"],
  [/ENOENT/i, "file"],
  [/EACCES/i, "permission"],
  [/EPERM/i, "permission"],

  // Module/Import errors → module
  [/cannot find module/i, "module"],
  [/module not found/i, "module"],
  [/import .* not found/i, "module"],

  // Compilation/Build errors → build
  [/failed to compile/i, "build"],
  [/compilation failed/i, "build"],
  [/build failed/i, "build"],

  // Test failures → test
  [/test.*failed/i, "test"],
  [/tests? (failed|failing)/i, "test"],
  [/FAILED/, "test"],

  // Language-specific errors → syntax, type
  [/SyntaxError/i, "syntax"],
  [/TypeError/i, "type"],
  [/ReferenceError/i, "type"],
  [/null pointer/i, "type"],
  [/segmentation fault/i, "memory"],
  [/undefined is not/i, "type"],

  // Runtime errors → generic (exception patterns)
  [/\bexception\b/i, "generic"],
  [/Exception:/, "generic"],
  [/traceback \(most recent call last\)/i, "generic"],
  [/Traceback/, "generic"],

  // Network errors → network
  [/connection refused/i, "network"],
  [/ECONNREFUSED/i, "network"],
  [/ETIMEDOUT/i, "network"],

  // Resource errors → memory
  [/out of memory/i, "memory"],
  [/ENOMEM/i, "memory"],

  // Generic error indicators → generic
  [/\berror:(?!\s*0\b)/i, "generic"],
  [/\bERROR:(?!\s*None)/, "generic"],
  [/\bError\b(?!\.prototype)/, "generic"],
  [/\bfatal error\b/i, "generic"],
]);

/**
 * Recovery suggestions by error category.
 * Provides actionable guidance for each type of error.
 */
export const RECOVERY_SUGGESTIONS: Record<ErrorCategory, RecoverySuggestion> = {
  command: {
    category: "command",
    message: "Command not found",
    suggestions: [
      "Verify the command is installed and available in PATH",
      "Check for typos in the command name",
      "Install the required package or tool",
      "Use 'which <command>' or 'command -v <command>' to check availability",
    ],
  },
  permission: {
    category: "permission",
    message: "Permission denied",
    suggestions: [
      "Check file/directory permissions with 'ls -la'",
      "Verify you have the necessary access rights",
      "Consider if sudo is appropriate (use with caution)",
      "Check ownership with 'stat <file>'",
    ],
  },
  file: {
    category: "file",
    message: "File or directory not found",
    suggestions: [
      "Verify the file path exists",
      "Check for typos in the path",
      "Use 'ls' or 'find' to locate the file",
      "Ensure any required files are created first",
    ],
  },
  module: {
    category: "module",
    message: "Module not found",
    suggestions: [
      "Run 'npm install' or equivalent package manager command",
      "Check if the module is in package.json/requirements.txt",
      "Verify import path is correct (relative vs absolute)",
      "Check if node_modules/venv is properly set up",
    ],
  },
  build: {
    category: "build",
    message: "Build/compilation failed",
    suggestions: [
      "Review the error output for specific issues",
      "Check for syntax errors in recently modified files",
      "Ensure all dependencies are installed",
      "Try cleaning the build cache and rebuilding",
    ],
  },
  test: {
    category: "test",
    message: "Test failure detected",
    suggestions: [
      "Review failing test output for assertion details",
      "Check if test expectations match implementation",
      "Verify test fixtures and mock data are correct",
      "Run tests in isolation to identify conflicts",
    ],
  },
  syntax: {
    category: "syntax",
    message: "Syntax error detected",
    suggestions: [
      "Check for missing brackets, parentheses, or quotes",
      "Verify proper indentation (especially Python)",
      "Look for unclosed strings or template literals",
      "Run a linter to identify syntax issues",
    ],
  },
  type: {
    category: "type",
    message: "Type error detected",
    suggestions: [
      "Check for null/undefined access without guards",
      "Verify variable types match expected usage",
      "Add null checks or optional chaining (?.) ",
      "Review function argument types",
    ],
  },
  network: {
    category: "network",
    message: "Network/connection error",
    suggestions: [
      "Verify the service is running and accessible",
      "Check network connectivity and firewall rules",
      "Confirm the correct host and port are being used",
      "Increase timeout values if the service is slow",
    ],
  },
  memory: {
    category: "memory",
    message: "Memory/resource error",
    suggestions: [
      "Check for memory leaks or unbounded growth",
      "Reduce batch sizes or process in chunks",
      "Increase available memory limits",
      "Review for infinite loops or recursion",
    ],
  },
  generic: {
    category: "generic",
    message: "Error detected",
    suggestions: [
      "Review the full error output for details",
      "Check recent changes that might have caused this",
      "Search for the error message online for solutions",
      "Consider reverting recent changes if unclear",
    ],
  },
};

/**
 * Check if output has structural error indicators (exitCode, error property).
 *
 * @param output - Tool output to analyze
 * @returns true if structural error indicators are present
 */
export function hasStructuralError(output: unknown): boolean {
  if (output === null || output === undefined) return false;

  if (typeof output === "object") {
    const obj = output as Record<string, unknown>;

    // Check for error property (any truthy value)
    if (obj["error"]) return true;

    // Check for non-zero exit code
    if (obj["exitCode"] !== undefined && obj["exitCode"] !== 0) return true;
  }

  return false;
}

/**
 * Detect if output contains an error.
 * Checks both pattern-based detection and structural indicators.
 *
 * @param output - Tool output to analyze
 * @returns true if an error is detected
 */
export function detectError(output: unknown): boolean {
  // Check structural indicators first (exit code, error property)
  if (hasStructuralError(output)) return true;

  // Then check pattern-based detection
  const text = extractOutputText(output);
  if (!text) return false;

  return ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Detect error and return the matching pattern.
 * Useful for getting specific recovery suggestions.
 *
 * @param output - Tool output to analyze
 * @returns Matching RegExp or undefined if no error detected
 */
export function detectErrorPattern(output: unknown): RegExp | undefined {
  const text = extractOutputText(output);
  if (!text) return undefined;

  return ERROR_PATTERNS.find((pattern) => pattern.test(text));
}

/**
 * Get the error category for a matched pattern.
 *
 * @param pattern - The matched error pattern
 * @returns Error category or 'generic' as fallback
 */
export function getErrorCategory(pattern: RegExp): ErrorCategory {
  for (const [p, category] of PATTERN_CATEGORIES.entries()) {
    if (p.source === pattern.source && p.flags === pattern.flags) {
      return category;
    }
  }
  return "generic";
}

/**
 * Get recovery suggestions for a detected error.
 *
 * @param output - Tool output containing the error
 * @returns RecoverySuggestion with actionable guidance
 */
export function getRecoverySuggestion(output: unknown): RecoverySuggestion {
  const pattern = detectErrorPattern(output);
  if (!pattern) {
    return RECOVERY_SUGGESTIONS.generic;
  }

  const category = getErrorCategory(pattern);
  return RECOVERY_SUGGESTIONS[category];
}

/**
 * Extract text content from various output formats for error pattern matching.
 *
 * ## Field Extraction Order
 *
 * This function combines text from multiple fields in order of priority:
 *
 * | Field     | Source                           | Included |
 * |-----------|----------------------------------|----------|
 * | stdout    | Shell command standard output    | ✓        |
 * | stderr    | Shell command standard error     | ✓        |
 * | output    | Generic output field             | ✓        |
 * | message   | Result/error message             | ✓        |
 * | error     | Error string or object.message   | ✓        |
 *
 * ## Exit Code Handling
 *
 * The `exitCode` field is NOT included in the text output because:
 * - It's a numeric value, not text for pattern matching
 * - It's checked separately in `hasStructuralError()` for non-zero values
 * - Including "exitCode: 1" as text could cause false positives
 *
 * To check for exit code errors, use `hasStructuralError(output)` which
 * returns true for non-zero exit codes.
 *
 * ## Text Combination
 *
 * All text fields are joined with newlines to preserve line-based patterns.
 * This allows patterns like `traceback \(most recent call last\)` to match
 * across field boundaries.
 *
 * @param output - Tool output in any format
 * @returns Combined text from all text fields, joined by newlines
 */
export function extractOutputText(output: unknown): string {
  if (output === null || output === undefined) {
    return "";
  }

  if (typeof output === "string") {
    return output;
  }

  if (typeof output === "object") {
    const obj = output as Record<string, unknown>;

    // Collect text from all relevant fields
    // Order: stdout → stderr → output → message → error
    const textParts: string[] = [];

    // Standard shell output fields
    if (typeof obj["stdout"] === "string" && obj["stdout"]) {
      textParts.push(obj["stdout"]);
    }
    if (typeof obj["stderr"] === "string" && obj["stderr"]) {
      textParts.push(obj["stderr"]);
    }

    // Generic output field (Task tool, etc.)
    if (typeof obj["output"] === "string" && obj["output"]) {
      textParts.push(obj["output"]);
    }

    // Result/error message
    if (typeof obj["message"] === "string" && obj["message"]) {
      textParts.push(obj["message"]);
    }

    // Error field (string or object with message)
    if (typeof obj["error"] === "string" && obj["error"]) {
      textParts.push(obj["error"]);
    } else if (obj["error"] && typeof obj["error"] === "object") {
      const errObj = obj["error"] as Record<string, unknown>;
      if (typeof errObj["message"] === "string" && errObj["message"]) {
        textParts.push(errObj["message"]);
      }
      // Also check for stack trace in error objects
      if (typeof errObj["stack"] === "string" && errObj["stack"]) {
        textParts.push(errObj["stack"]);
      }
    }

    // Note: exitCode is NOT included - it's checked in hasStructuralError()
    // Including "exitCode" text could cause false positive pattern matches

    return textParts.join("\n");
  }

  return String(output);
}

/**
 * Check tool output for errors and manage the 3-strike protocol.
 *
 * ## 3-Strike Escalation Protocol
 *
 * This function implements a progressive error handling strategy:
 *
 * **On Error:**
 * - Strike 1: Log warning, continue (action: "logged")
 * - Strike 2: Show warning with recovery suggestions (action: "suggested")
 * - Strike 3+: Escalate to Stilgar with full context (action: "escalated")
 *
 * **On Success:**
 * - Resets strike counter to 0 via `SessionManager.resetErrorCount()`
 * - If previously escalated, clears the `escalated` flag and sets `resolvedAt`
 * - Next error after reset starts at strike 1 (not strike 4)
 *
 * ## State Transitions
 *
 * ```
 * [Success] → errorCount: 0, escalated: false
 *     ↓ (error)
 * [Strike 1] → errorCount: 1, action: "logged"
 *     ↓ (error)
 * [Strike 2] → errorCount: 2, action: "suggested" + recovery message
 *     ↓ (error)
 * [Strike 3] → errorCount: 3, escalated: true, action: "escalated"
 *     ↓ (success)
 * [Reset] → errorCount: 0, escalated: false, resolvedAt: timestamp
 * ```
 *
 * @param tool - Name of the tool that was executed
 * @param output - Tool output to analyze
 * @param sessionId - Session identifier for state tracking
 * @returns ErrorRecoveryResult with action taken
 */
export async function checkForErrors(
  tool: string,
  output: unknown,
  sessionId: string
): Promise<ErrorRecoveryResult> {
  const hasError = detectError(output);

  if (hasError) {
    const errorCount = SessionManager.incrementErrorCount(sessionId);
    const outputText = extractOutputText(output);
    const suggestion = getRecoverySuggestion(output);

    // Store last error info in session metadata
    SessionManager.setMetadata(sessionId, "lastError", {
      timestamp: Date.now(),
      tool,
      output: outputText.substring(0, 500), // Truncate for storage
      category: suggestion.category,
    });

    if (errorCount === 1) {
      // Strike 1: Log and continue
      logger.warn(`Error detected (strike 1/3)`, {
        tool,
        sessionId,
        category: suggestion.category,
      });

      return {
        errorDetected: true,
        strikeCount: errorCount,
        action: "logged",
        suggestion,
      };
    } else if (errorCount === 2) {
      // Strike 2: Show warning and suggest recovery
      logger.warn(`Error detected (strike 2/3) - recovery suggestions provided`, {
        tool,
        sessionId,
        category: suggestion.category,
      });

      return {
        errorDetected: true,
        strikeCount: errorCount,
        action: "suggested",
        suggestion,
        recoveryMessage: formatRecoverySuggestion(suggestion),
      };
    } else {
      // Strike 3+: Escalate to Stilgar
      logger.error(`Error threshold reached (strike ${errorCount}/3) - escalating to Stilgar`, {
        tool,
        sessionId,
        category: suggestion.category,
      });

      // Mark session as escalated
      SessionManager.setMetadata(sessionId, "errorRecovery", {
        escalated: true,
        escalatedAt: Date.now(),
        triggeringTool: tool,
        strikeCount: errorCount,
      });

      return {
        errorDetected: true,
        strikeCount: errorCount,
        action: "escalated",
        suggestion,
        escalationMessage: generateEscalationMessage(sessionId, tool, suggestion),
      };
    }
  } else {
    // =========================================================================
    // SUCCESS PATH: Reset escalation state
    // =========================================================================
    // A successful tool execution breaks the error streak and resets the counter.
    // This is critical for the 3-strike protocol: after reset, the next error
    // starts at strike 1 (not strike 4), giving the session a fresh start.

    const previousCount = getStrikeCount(sessionId);

    // Step 1: Reset the strike counter to 0
    // This ensures subsequent errors start fresh at strike 1
    SessionManager.resetErrorCount(sessionId);

    // Step 2: Clear escalation state if session was escalated
    // This is important because:
    // - The `escalated` flag controls whether Stilgar guidance is shown
    // - Setting `resolvedAt` provides an audit trail of when recovery occurred
    // - The spread operator preserves other metadata (triggeringTool, escalatedAt)
    const escalationState = SessionManager.getMetadata(sessionId, "errorRecovery") as
      | ErrorRecoveryState
      | undefined;

    if (escalationState?.escalated) {
      // Reset the escalated flag while preserving history for debugging
      SessionManager.setMetadata(sessionId, "errorRecovery", {
        ...escalationState,        // Preserve: escalatedAt, triggeringTool, strikeCount
        escalated: false,          // Clear: no longer in escalated state
        resolvedAt: Date.now(),    // Record: when the escalation was resolved
      });

      logger.info("Error recovery: escalation resolved after successful operation", {
        sessionId,
        tool,
      });
    }

    return {
      errorDetected: false,
      strikeCount: 0,
      action: previousCount > 0 ? "reset" : "none",
    };
  }
}

/**
 * Get current strike count for a session.
 *
 * @param sessionId - Session identifier
 * @returns Current error count
 */
export function getStrikeCount(sessionId: string): number {
  const state = SessionManager.getStateOrUndefined(sessionId);
  return state?.errorCount ?? 0;
}

/**
 * Check if a session is currently in escalated state.
 *
 * @param sessionId - Session identifier
 * @returns true if escalated to Stilgar
 */
export function isEscalated(sessionId: string): boolean {
  const escalationState = SessionManager.getMetadata(sessionId, "errorRecovery") as
    | ErrorRecoveryState
    | undefined;
  return escalationState?.escalated ?? false;
}

/**
 * Get the error recovery state for a session.
 *
 * @param sessionId - Session identifier
 * @returns ErrorRecoveryState or undefined
 */
export function getErrorRecoveryState(sessionId: string): ErrorRecoveryState | undefined {
  return SessionManager.getMetadata(sessionId, "errorRecovery") as
    | ErrorRecoveryState
    | undefined;
}

/**
 * Format recovery suggestion as a user-friendly message.
 *
 * @param suggestion - Recovery suggestion to format
 * @returns Formatted message string
 */
export function formatRecoverySuggestion(suggestion: RecoverySuggestion): string {
  const lines = [
    `[ERROR RECOVERY - ${suggestion.message}]`,
    "",
    "Suggested actions:",
    ...suggestion.suggestions.map((s, i) => `  ${i + 1}. ${s}`),
    "",
    "If issues persist, one more error will trigger Stilgar escalation.",
  ];

  return lines.join("\n");
}

/**
 * Generate escalation message for Stilgar agent.
 *
 * @param sessionId - Session identifier
 * @param tool - Tool that triggered escalation
 * @param suggestion - Recovery suggestion for context
 * @returns Formatted escalation message
 */
export function generateEscalationMessage(
  sessionId: string,
  tool: string,
  suggestion: RecoverySuggestion
): string {
  const lastError = SessionManager.getMetadata(sessionId, "lastError") as
    | { timestamp: number; tool: string; output: string; category: string }
    | undefined;

  const lines = [
    "[STILGAR ESCALATION - 3-Strike Protocol Triggered]",
    "",
    "The session has encountered 3+ consecutive errors.",
    `Error category: ${suggestion.category}`,
    `Triggering tool: ${tool}`,
    "",
    "Error context:",
    lastError?.output ? `  ${lastError.output.substring(0, 300)}...` : "  (No output captured)",
    "",
    "Recommended approach:",
    "  1. Analyze the error pattern and root cause",
    "  2. Consider alternative approaches",
    "  3. Review recent changes for potential issues",
    "  4. If blocked, ask the user for clarification or guidance",
    "",
    "Standard recovery suggestions:",
    ...suggestion.suggestions.map((s) => `  - ${s}`),
  ];

  return lines.join("\n");
}

/**
 * Reset error recovery state for a session.
 * Clears strike count and escalation state.
 *
 * @param sessionId - Session identifier
 */
export function resetErrorRecovery(sessionId: string): void {
  SessionManager.resetErrorCount(sessionId);
  SessionManager.setMetadata(sessionId, "errorRecovery", undefined);
  SessionManager.setMetadata(sessionId, "lastError", undefined);
  logger.debug("Error recovery state reset", { sessionId });
}
