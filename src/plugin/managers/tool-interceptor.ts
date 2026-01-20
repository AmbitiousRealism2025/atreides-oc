/**
 * ToolInterceptor - Central point for tool call tracking and validation
 *
 * Orchestrates pre-execution validation (delegating to SecurityHardening)
 * and post-execution logging, serving as the central point for tool call tracking.
 *
 * Key features:
 * - Pre-execution security validation
 * - Post-execution logging with duration tracking
 * - Tool call history management (limited to 100 entries)
 * - Performance monitoring (<5ms overhead target)
 */

import { createLogger } from "../../lib/logger.js";
import type {
  SecurityAction,
  CommandValidationResult,
  FileValidationResult,
  ToolExecutionRecord,
} from "../types.js";
import * as SessionManager from "./session-manager.js";
import * as SecurityHardening from "./security-hardening.js";

const logger = createLogger("atreides:tool-interceptor");

/**
 * Maximum number of tool calls to keep in history.
 * Older entries are removed when this limit is exceeded.
 */
const MAX_HISTORY_SIZE = 100;

/**
 * Result of pre-execution validation.
 */
export interface BeforeExecuteResult {
  /** Action to take: allow, deny, or ask for user confirmation */
  action: SecurityAction;
  /** Reason for deny/ask action */
  reason?: string;
  /** Pattern that triggered the action */
  matchedPattern?: string;
}

/**
 * Tracking data for an in-flight tool execution.
 * Used to compute duration between beforeExecute and afterExecute.
 */
interface ExecutionTracker {
  /** Tool being executed */
  tool: string;
  /** Start time (high-resolution) */
  startTime: number;
  /** Session ID */
  sessionId: string;
}

/**
 * ToolInterceptor class - orchestrates tool validation and logging.
 *
 * This class provides a centralized interface for:
 * - Pre-execution security validation (delegates to SecurityHardening)
 * - Post-execution logging and history tracking
 * - Performance measurement (execution duration)
 *
 * @example
 * ```typescript
 * const interceptor = new ToolInterceptor();
 *
 * // Before tool execution
 * const result = await interceptor.beforeExecute('bash', { command: 'ls' }, 'session-1');
 * if (result.action === 'deny') {
 *   // Block execution
 * }
 *
 * // After tool execution
 * await interceptor.afterExecute('bash', { success: true }, 'session-1');
 * ```
 */
export class ToolInterceptor {
  /**
   * Map of execution trackers keyed by `${sessionId}:${tool}`.
   * Used to track in-flight executions for duration calculation.
   */
  private executionTrackers: Map<string, ExecutionTracker> = new Map();

  /**
   * Validates a tool execution before it runs.
   *
   * Delegates to SecurityHardening for security validation of:
   * - Bash/shell commands: validates command content
   * - File operations (read/write/edit): validates file paths
   * - Other tools: allows by default
   *
   * @param tool - The tool name being executed
   * @param input - The tool input parameters
   * @param sessionId - The session identifier
   * @returns Validation result with action (allow/deny/ask) and optional reason
   */
  async beforeExecute(
    tool: string,
    input: unknown,
    sessionId: string
  ): Promise<BeforeExecuteResult> {
    const startTime = performance.now();

    try {
      // Start tracking this execution for duration measurement
      const trackerKey = this.getTrackerKey(sessionId, tool);
      this.executionTrackers.set(trackerKey, {
        tool,
        startTime,
        sessionId,
      });

      // Update session activity
      SessionManager.updateActivity(sessionId);

      // Validate with SecurityHardening
      const validationResult = SecurityHardening.validateToolInput(tool, input);

      const duration = performance.now() - startTime;
      logger.debug("beforeExecute completed", {
        tool,
        sessionId,
        action: validationResult.action,
        durationMs: duration.toFixed(2),
      });

      return this.toBeforeExecuteResult(validationResult);
    } catch (error) {
      logger.error("Tool validation error", {
        tool,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Fail closed - deny on error
      return {
        action: "deny",
        reason: "Validation error occurred",
      };
    }
  }

  /**
   * Logs a tool execution after it completes.
   *
   * Records the execution in session history including:
   * - Tool name
   * - Timestamp
   * - Success/failure status
   * - Execution duration
   * - Error message (if any)
   *
   * Also enforces history size limit (100 entries).
   *
   * @param tool - The tool name that was executed
   * @param output - The tool output/result
   * @param sessionId - The session identifier
   */
  async afterExecute(
    tool: string,
    output: unknown,
    sessionId: string
  ): Promise<void> {
    try {
      const state = SessionManager.getStateOrUndefined(sessionId);
      if (!state) {
        logger.warn("Session not found for afterExecute", { sessionId, tool });
        return;
      }

      // Calculate duration from tracked start time
      const trackerKey = this.getTrackerKey(sessionId, tool);
      const tracker = this.executionTrackers.get(trackerKey);
      let durationMs: number | undefined;

      if (tracker) {
        durationMs = performance.now() - tracker.startTime;
        this.executionTrackers.delete(trackerKey);
      }

      // Determine success/failure from output
      const { success, error } = this.extractResultStatus(output);

      // Create execution record
      const record: ToolExecutionRecord = {
        tool,
        timestamp: new Date(),
        success,
        durationMs,
        error,
      };

      // Add to history
      state.toolHistory.push(record);

      // Enforce history size limit
      if (state.toolHistory.length > MAX_HISTORY_SIZE) {
        state.toolHistory = state.toolHistory.slice(-MAX_HISTORY_SIZE);
      }

      // Update last activity
      state.lastActivityAt = new Date();

      logger.debug("afterExecute completed", {
        tool,
        sessionId,
        success,
        durationMs: durationMs?.toFixed(2),
        historySize: state.toolHistory.length,
      });
    } catch (error) {
      logger.error("Tool logging error", {
        tool,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Never throw from afterExecute
    }
  }

  /**
   * Gets the tool execution history for a session.
   *
   * @param sessionId - The session identifier
   * @returns Array of tool execution records, or empty array if session not found
   */
  getToolHistory(sessionId: string): ToolExecutionRecord[] {
    const state = SessionManager.getStateOrUndefined(sessionId);
    return state?.toolHistory ?? [];
  }

  /**
   * Gets statistics about tool executions in a session.
   *
   * @param sessionId - The session identifier
   * @returns Statistics object with counts and timing info
   */
  getToolStats(sessionId: string): {
    totalCalls: number;
    successCount: number;
    failureCount: number;
    avgDurationMs: number;
    toolBreakdown: Record<string, number>;
  } {
    const history = this.getToolHistory(sessionId);

    const stats = {
      totalCalls: history.length,
      successCount: 0,
      failureCount: 0,
      avgDurationMs: 0,
      toolBreakdown: {} as Record<string, number>,
    };

    if (history.length === 0) {
      return stats;
    }

    let totalDuration = 0;
    let durationCount = 0;

    for (const record of history) {
      if (record.success) {
        stats.successCount++;
      } else {
        stats.failureCount++;
      }

      if (record.durationMs !== undefined) {
        totalDuration += record.durationMs;
        durationCount++;
      }

      stats.toolBreakdown[record.tool] = (stats.toolBreakdown[record.tool] ?? 0) + 1;
    }

    if (durationCount > 0) {
      stats.avgDurationMs = totalDuration / durationCount;
    }

    return stats;
  }

  /**
   * Clears in-flight execution trackers.
   * Useful for testing or session cleanup.
   */
  clearTrackers(): void {
    this.executionTrackers.clear();
  }

  /**
   * Generates a unique key for tracking an execution.
   */
  private getTrackerKey(sessionId: string, tool: string): string {
    return `${sessionId}:${tool}`;
  }

  /**
   * Converts SecurityHardening result to BeforeExecuteResult.
   */
  private toBeforeExecuteResult(
    result: CommandValidationResult | FileValidationResult
  ): BeforeExecuteResult {
    return {
      action: result.action,
      reason: result.reason,
      matchedPattern: result.matchedPattern,
    };
  }

  /**
   * Extracts success/failure status from tool output.
   */
  private extractResultStatus(output: unknown): { success: boolean; error?: string } {
    if (output === null || output === undefined) {
      return { success: true };
    }

    if (typeof output === "object") {
      const obj = output as Record<string, unknown>;

      // Check for explicit error field
      if (obj["error"] !== undefined) {
        const error = obj["error"];
        if (typeof error === "string" && error.length > 0) {
          return { success: false, error };
        }
        if (error === true) {
          return { success: false, error: "Unknown error" };
        }
      }

      // Check for explicit success field
      if (typeof obj["success"] === "boolean") {
        return {
          success: obj["success"],
          error: obj["success"] ? undefined : String(obj["message"] ?? "Operation failed"),
        };
      }

      // Check for exitCode (bash tool)
      if (typeof obj["exitCode"] === "number") {
        const exitCode = obj["exitCode"];
        return {
          success: exitCode === 0,
          error: exitCode !== 0 ? `Exit code: ${exitCode}` : undefined,
        };
      }
    }

    // Default to success if no error indicators
    return { success: true };
  }
}

/**
 * Singleton instance of ToolInterceptor.
 * Use this for standard plugin operation.
 */
export const toolInterceptor = new ToolInterceptor();
