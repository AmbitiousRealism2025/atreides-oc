/**
 * CompactionHandler - Preserves critical session state during context compaction
 *
 * This module handles the preservation of critical session state when OpenCode
 * performs context compaction. It ensures that workflow phase, pending todos,
 * error state, and recent tool history survive compaction events.
 *
 * Key features:
 * - Serializes critical state (workflow phase, todos, strike counter)
 * - Formats state as markdown for injection into compacted context
 * - Provides state restoration from compacted markdown
 * - Preserves error escalation state for continuity
 * - Performance optimized (<10ms per compaction)
 *
 * ## State Preservation Flow
 *
 * 1. **Compaction Event**: OpenCode triggers `experimental.session.compacting` hook
 * 2. **State Extraction**: `extractPreservedState()` collects critical state
 * 3. **Markdown Formatting**: `formatAsMarkdown()` creates readable block
 * 4. **Injection**: Block appended to compacted summary
 *
 * ## State Restoration Flow (Post-Compaction)
 *
 * When a session resumes after compaction:
 * 1. AI sees the `<!-- ATREIDES STATE -->` block in context
 * 2. `parsePreservedStateFromMarkdown()` extracts state from markdown
 * 3. `restoreState()` applies state to SessionManager
 *
 * Note: Automatic restoration requires OpenCode to call a restoration hook,
 * which is not currently implemented. The markdown block serves as a
 * human/AI-readable fallback that provides continuity guidance.
 */

import type { SessionState, WorkflowPhase, ToolExecutionRecord, ErrorRecoveryState } from "../types.js";
import * as SessionManager from "./session-manager.js";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger("atreides:compaction-handler");

/**
 * Represents a pending todo item for preservation.
 */
export interface PendingTodo {
  /** Todo item identifier */
  id: string;
  /** Human-readable description of the todo */
  description: string;
  /** Current status of the todo */
  status: "pending" | "in_progress";
}

/**
 * Represents the tool execution summary for preservation.
 */
export interface ToolHistoryEntry {
  /** Tool name that was executed */
  tool: string;
  /** Whether execution was successful */
  success: boolean;
}

/**
 * Critical state that is preserved during compaction.
 *
 * ## Interface Relationship with SessionState
 *
 * PreservedState is a subset of SessionState optimized for serialization:
 *
 * | PreservedState Field | SessionState Source                    |
 * |---------------------|----------------------------------------|
 * | workflowPhase       | workflow.currentPhase                  |
 * | intentClassification| workflow.intentClassification          |
 * | pendingTodos        | External from TodoEnforcer             |
 * | strikeCount         | errorCount                             |
 * | escalated           | metadata.errorRecovery.escalated       |
 * | escalatedAt         | metadata.errorRecovery.escalatedAt     |
 * | triggeringTool      | metadata.errorRecovery.triggeringTool  |
 * | lastErrorOutput     | metadata.lastError.output              |
 * | recentTools         | toolHistory (last 10)                  |
 * | totalTodos          | todoCount                              |
 * | completedTodos      | todosCompleted                         |
 * | personaName         | config.identity.personaName            |
 */
export interface PreservedState {
  /** Current workflow phase */
  workflowPhase: WorkflowPhase;
  /** Intent classification (if set) */
  intentClassification?: string;
  /** List of pending todos with descriptions */
  pendingTodos: PendingTodo[];
  /** Current strike count for error recovery */
  strikeCount: number;
  /** Whether session is in escalated state (Stilgar mode) */
  escalated: boolean;
  /** Timestamp when escalation occurred (for audit) */
  escalatedAt?: number;
  /** Tool that triggered the escalation */
  triggeringTool?: string;
  /** Truncated last error output for context */
  lastErrorOutput?: string;
  /** Recent tool executions (last 10) */
  recentTools: ToolHistoryEntry[];
  /** Total todos count */
  totalTodos: number;
  /** Completed todos count */
  completedTodos: number;
  /** Identity persona name (if configured) */
  personaName?: string;
}

/**
 * Result of the state preservation operation.
 */
export interface PreservationResult {
  /** Whether preservation was successful */
  success: boolean;
  /** The preserved state (if successful) */
  state?: PreservedState;
  /** Error message (if failed) */
  error?: string;
  /** Time taken in milliseconds */
  durationMs: number;
}

/**
 * CompactionHandler preserves critical session state during OpenCode's context compaction.
 *
 * Usage:
 * ```typescript
 * const handler = new CompactionHandler();
 * const markdown = await handler.preserveState('session-1');
 * // Returns markdown-formatted state block to inject into compacted context
 * ```
 */
export class CompactionHandler {
  private pendingTodosMap: Map<string, PendingTodo[]> = new Map();

  /**
   * Creates a new CompactionHandler instance.
   */
  constructor() {
    logger.debug("CompactionHandler initialized");
  }

  /**
   * Store pending todos for a session.
   * Called when todowrite tool is executed to capture todo descriptions.
   *
   * @param sessionId - Session identifier
   * @param todos - Array of todo items from todowrite output
   */
  public storePendingTodos(
    sessionId: string,
    todos: Array<{ id?: string; content?: string; description?: string; status?: string }>
  ): void {
    const pending: PendingTodo[] = todos
      .filter((t) => t.status === "pending" || t.status === "in_progress")
      .map((t, index) => ({
        id: t.id ?? `todo-${index}`,
        description: t.content ?? t.description ?? "No description",
        status: (t.status as "pending" | "in_progress") ?? "pending",
      }));

    this.pendingTodosMap.set(sessionId, pending);
    logger.debug("Stored pending todos", { sessionId, count: pending.length });
  }

  /**
   * Get stored pending todos for a session.
   *
   * @param sessionId - Session identifier
   * @returns Array of pending todos or empty array
   */
  public getPendingTodos(sessionId: string): PendingTodo[] {
    return this.pendingTodosMap.get(sessionId) ?? [];
  }

  /**
   * Clear stored todos for a session.
   *
   * @param sessionId - Session identifier
   */
  public clearSessionTodos(sessionId: string): void {
    this.pendingTodosMap.delete(sessionId);
  }

  /**
   * Preserve critical state for a session during compaction.
   *
   * @param sessionId - Unique session identifier
   * @param personaName - Optional persona name from config
   * @returns Markdown-formatted state block for injection
   */
  public async preserveState(
    sessionId: string,
    personaName?: string
  ): Promise<string> {
    const startTime = performance.now();

    try {
      const state = SessionManager.getStateOrUndefined(sessionId);

      if (!state) {
        logger.warn("No session state found for compaction", { sessionId });
        return "<!-- Atreides state preservation failed: session not found -->";
      }

      const preserved = this.extractPreservedState(state, personaName);
      const markdown = this.formatAsMarkdown(preserved);
      const durationMs = performance.now() - startTime;

      logger.debug("State preserved", { sessionId, durationMs: durationMs.toFixed(2) });

      return markdown;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("State preservation error", { sessionId, error: errorMessage });
      return "<!-- Atreides state preservation failed -->";
    }
  }

  /**
   * Extract the PreservedState from a SessionState.
   * Includes error escalation state for Stilgar continuity.
   *
   * @param state - Session state to extract from
   * @param personaName - Optional persona name
   * @returns Extracted preserved state
   */
  public extractPreservedState(
    state: SessionState,
    personaName?: string
  ): PreservedState {
    // Get pending todos from our storage or create from counts
    const storedTodos = this.pendingTodosMap.get(state.sessionId) ?? [];

    // Extract recent tools (last 10)
    const recentTools: ToolHistoryEntry[] = state.toolHistory
      .slice(-10)
      .map((t: ToolExecutionRecord) => ({
        tool: t.tool,
        success: t.success,
      }));

    // Extract error recovery state from metadata
    const errorRecovery = state.metadata?.errorRecovery as ErrorRecoveryState | undefined;
    const lastError = state.metadata?.lastError as { output?: string; tool?: string } | undefined;

    return {
      workflowPhase: state.workflow.currentPhase,
      intentClassification: state.workflow.intentClassification,
      pendingTodos: storedTodos,
      strikeCount: state.errorCount,
      // Error escalation details for Stilgar continuity
      escalated: errorRecovery?.escalated ?? false,
      escalatedAt: errorRecovery?.escalatedAt,
      triggeringTool: lastError?.tool ?? errorRecovery?.triggeringTool,
      // Truncate error output to avoid bloating the preserved state (max 500 chars)
      lastErrorOutput: lastError?.output?.substring(0, 500),
      recentTools,
      totalTodos: state.todoCount,
      completedTodos: state.todosCompleted,
      personaName,
    };
  }

  /**
   * Format preserved state as markdown for injection into compacted context.
   *
   * @param state - Preserved state to format
   * @returns Markdown-formatted state block
   */
  public formatAsMarkdown(state: PreservedState): string {
    const lines: string[] = [
      "",
      "---",
      "<!-- ATREIDES STATE -->",
      "",
      `**Workflow Phase:** ${state.workflowPhase}`,
    ];

    // Add intent classification if present
    if (state.intentClassification) {
      lines.push(`**Intent:** ${state.intentClassification}`);
    }

    // Add pending todos section
    const pendingCount = state.pendingTodos.length;
    lines.push("");
    lines.push(`**Pending Todos:** ${pendingCount}`);

    if (pendingCount > 0) {
      state.pendingTodos.forEach((todo) => {
        const marker = todo.status === "in_progress" ? "[-]" : "[ ]";
        lines.push(`${marker} ${todo.description}`);
      });
    }

    // Add todo summary
    if (state.totalTodos > 0) {
      lines.push("");
      lines.push(
        `**Todo Progress:** ${state.completedTodos}/${state.totalTodos} completed`
      );
    }

    // Add error recovery info with escalation details
    lines.push("");
    lines.push(
      `**Error Recovery:** ${state.strikeCount} strike${state.strikeCount !== 1 ? "s" : ""}`
    );

    // Add escalation info if session is in Stilgar mode
    if (state.escalated) {
      lines.push(`**Escalation Status:** ACTIVE (Stilgar mode)`);
      if (state.triggeringTool) {
        lines.push(`**Triggering Tool:** ${state.triggeringTool}`);
      }
      if (state.escalatedAt) {
        lines.push(`**Escalated At:** ${new Date(state.escalatedAt).toISOString()}`);
      }
    }

    // Add truncated error output if available (helps AI understand context)
    if (state.lastErrorOutput) {
      lines.push("");
      lines.push("**Last Error Output (truncated):**");
      lines.push("```");
      lines.push(state.lastErrorOutput);
      lines.push("```");
    }

    // Add recent tool history
    if (state.recentTools.length > 0) {
      lines.push("");
      lines.push("**Recent Tool History:**");
      state.recentTools.forEach((t) => {
        const status = t.success ? "✓" : "✗";
        lines.push(`- ${t.tool} (${status})`);
      });
    }

    // Add identity if configured
    if (state.personaName) {
      lines.push("");
      lines.push(`**Identity:** ${state.personaName}`);
    }

    lines.push("");
    lines.push("<!-- END ATREIDES STATE -->");
    lines.push("---");
    lines.push("");

    return lines.join("\n");
  }

  /**
   * Parse preserved state from a markdown string.
   * Used to restore state when a compacted context is loaded.
   *
   * @param markdown - The markdown content to parse
   * @returns Parsed PreservedState or null if not found/invalid
   */
  public parsePreservedStateFromMarkdown(markdown: string): PreservedState | null {
    // Find the ATREIDES STATE block
    const stateMatch = markdown.match(
      /<!-- ATREIDES STATE -->([\s\S]*?)<!-- END ATREIDES STATE -->/
    );

    if (!stateMatch || !stateMatch[1]) {
      return null;
    }

    const stateBlock = stateMatch[1];

    try {
      // Parse workflow phase
      const phaseMatch = stateBlock.match(/\*\*Workflow Phase:\*\*\s*(\w+)/);
      const workflowPhase = (phaseMatch?.[1] ?? "idle") as WorkflowPhase;

      // Parse intent
      const intentMatch = stateBlock.match(/\*\*Intent:\*\*\s*(\w+)/);
      const intentClassification = intentMatch?.[1];

      // Parse strike count
      const strikeMatch = stateBlock.match(/\*\*Error Recovery:\*\*\s*(\d+)/);
      const strikeCount = parseInt(strikeMatch?.[1] ?? "0", 10);

      // Parse escalation status
      const escalatedMatch = stateBlock.match(/\*\*Escalation Status:\*\*\s*ACTIVE/);
      const escalated = !!escalatedMatch;

      // Parse triggering tool
      const toolMatch = stateBlock.match(/\*\*Triggering Tool:\*\*\s*(\S+)/);
      const triggeringTool = toolMatch?.[1];

      // Parse escalation timestamp
      const escalatedAtMatch = stateBlock.match(/\*\*Escalated At:\*\*\s*([\d\-T:.Z]+)/);
      const escalatedAt = escalatedAtMatch?.[1]
        ? new Date(escalatedAtMatch[1]).getTime()
        : undefined;

      // Parse error output
      const errorOutputMatch = stateBlock.match(
        /\*\*Last Error Output \(truncated\):\*\*\s*```\n?([\s\S]*?)```/
      );
      const lastErrorOutput = errorOutputMatch?.[1]?.trim();

      // Parse todo progress
      const progressMatch = stateBlock.match(
        /\*\*Todo Progress:\*\*\s*(\d+)\/(\d+)/
      );
      const completedTodos = parseInt(progressMatch?.[1] ?? "0", 10);
      const totalTodos = parseInt(progressMatch?.[2] ?? "0", 10);

      // Parse pending todos
      const pendingTodos: PendingTodo[] = [];
      const todoMatches = stateBlock.matchAll(/\[([- ])\]\s+(.+)/g);
      let todoIndex = 0;
      for (const match of todoMatches) {
        pendingTodos.push({
          id: `restored-${todoIndex++}`,
          description: match[2]?.trim() ?? "",
          status: match[1] === "-" ? "in_progress" : "pending",
        });
      }

      // Parse identity
      const identityMatch = stateBlock.match(/\*\*Identity:\*\*\s*(.+)/);
      const personaName = identityMatch?.[1]?.trim();

      // Parse recent tools
      const recentTools: ToolHistoryEntry[] = [];
      const toolHistory = stateBlock.match(
        /\*\*Recent Tool History:\*\*\n([\s\S]*?)(?=\n\*\*|\n<!--|$)/
      );
      if (toolHistory?.[1]) {
        const toolLines = toolHistory[1].matchAll(/- (\S+) \(([✓✗])\)/g);
        for (const toolLine of toolLines) {
          recentTools.push({
            tool: toolLine[1] ?? "",
            success: toolLine[2] === "✓",
          });
        }
      }

      return {
        workflowPhase,
        intentClassification,
        pendingTodos,
        strikeCount,
        escalated,
        escalatedAt,
        triggeringTool,
        lastErrorOutput,
        recentTools,
        totalTodos,
        completedTodos,
        personaName,
      };
    } catch (error) {
      logger.error("Failed to parse preserved state", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Restore preserved state to a session.
   * Call this after parsing state from a compacted context.
   *
   * @param sessionId - Session to restore state to
   * @param preservedState - The state to restore
   * @returns True if restoration was successful
   */
  public restoreState(sessionId: string, preservedState: PreservedState): boolean {
    try {
      const existingState = SessionManager.getStateOrUndefined(sessionId);

      if (!existingState) {
        logger.warn("Cannot restore state: session not found", { sessionId });
        return false;
      }

      // Restore workflow state
      existingState.phase = preservedState.workflowPhase;
      existingState.workflow.currentPhase = preservedState.workflowPhase;
      if (preservedState.intentClassification) {
        existingState.workflow.intentClassification = preservedState.intentClassification;
      }

      // Restore error count
      existingState.errorCount = preservedState.strikeCount;

      // Restore todo counts
      existingState.todoCount = preservedState.totalTodos;
      existingState.todosCompleted = preservedState.completedTodos;

      // Restore escalation state in metadata
      if (preservedState.escalated) {
        existingState.metadata.errorRecovery = {
          escalated: true,
          escalatedAt: preservedState.escalatedAt,
          triggeringTool: preservedState.triggeringTool,
        };
      }

      // Store pending todos in our map
      if (preservedState.pendingTodos.length > 0) {
        this.pendingTodosMap.set(sessionId, preservedState.pendingTodos);
      }

      // Update the session state
      SessionManager.setState(sessionId, existingState);

      logger.info("State restored from compaction", {
        sessionId,
        phase: preservedState.workflowPhase,
        strikeCount: preservedState.strikeCount,
        escalated: preservedState.escalated,
        pendingTodos: preservedState.pendingTodos.length,
      });

      return true;
    } catch (error) {
      logger.error("Failed to restore state", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Perform full preservation and return detailed result.
   *
   * @param sessionId - Session identifier
   * @param personaName - Optional persona name
   * @returns Detailed preservation result with timing
   */
  public async preserveStateWithResult(
    sessionId: string,
    personaName?: string
  ): Promise<PreservationResult> {
    const startTime = performance.now();

    try {
      const state = SessionManager.getStateOrUndefined(sessionId);

      if (!state) {
        return {
          success: false,
          error: "Session not found",
          durationMs: performance.now() - startTime,
        };
      }

      const preserved = this.extractPreservedState(state, personaName);

      return {
        success: true,
        state: preserved,
        durationMs: performance.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: performance.now() - startTime,
      };
    }
  }
}

/**
 * Singleton instance of CompactionHandler.
 * Use this for most operations to share state across the plugin.
 */
export const compactionHandler = new CompactionHandler();

/**
 * Factory function to create a new CompactionHandler instance.
 * Use when you need a fresh instance (e.g., for testing).
 *
 * @returns New CompactionHandler instance
 */
export function createCompactionHandler(): CompactionHandler {
  return new CompactionHandler();
}
