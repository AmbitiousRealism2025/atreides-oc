import type {
  EventHookPayload,
  StopHookPayload,
  StopHookResult,
  ToolBeforeHookPayload,
  ToolBeforeHookResult,
  ToolAfterHookPayload,
  SystemTransformHookPayload,
  SystemTransformHookResult,
  CompactionHookPayload,
  CompactionHookResult,
  PluginContext,
} from "./types.js";
import type { Config } from "../lib/config.js";
import { createLogger } from "../lib/logger.js";
import {
  createStopHookResult,
  createToolBeforeResult,
  createSystemTransformResult,
  createCompactionResult,
} from "./utils.js";
import * as SessionManager from "./managers/session-manager.js";
import { workflowEngine } from "./managers/workflow-engine.js";
import * as ErrorRecovery from "./managers/error-recovery.js";
import { toolInterceptor } from "./managers/tool-interceptor.js";
import { IdentityManager } from "./managers/identity-manager.js";
import { SystemPromptInjector } from "./managers/system-prompt-injector.js";
import { compactionHandler } from "./managers/compaction-handler.js";
import { todoEnforcer } from "./managers/todo-enforcer.js";

const logger = createLogger("atreides:handlers");

/**
 * Create an event handler for session lifecycle events.
 *
 * This handler implements the session state initialization pattern based on
 * OpenCode's Map-based architecture. The pattern ensures consistent state
 * management across the plugin lifecycle.
 *
 * ## Session Initialization Flow
 *
 * 1. When `session.created` event fires:
 *    - `SessionManager.initializeSessionState()` creates a new SessionState object
 *      with default values (phase: "idle", errorCount: 0, workflow state, etc.)
 *    - `SessionManager.setState()` stores this state in the internal Map<sessionId, SessionState>
 *
 * 2. The state remains accessible throughout the session via `SessionManager.getState()`
 *
 * 3. When `session.deleted` event fires:
 *    - State is removed from the Map via `SessionManager.deleteSession()`
 *    - Related caches (compaction todos, enforcer todos) are also cleared
 *
 * @example
 * ```typescript
 * // Session lifecycle
 * // 1. session.created → initializeSessionState() → setState() → state stored in Map
 * // 2. During session → getState() retrieves from Map, modifications persist
 * // 3. session.deleted → deleteSession() → state removed from Map
 * ```
 *
 * @param config - Plugin configuration
 * @param _context - Plugin context (unused but available for future extensions)
 * @returns Event hook handler function
 */
export function createEventHandler(
  config: Config,
  _context: PluginContext
) {
  return async (payload: EventHookPayload): Promise<void> => {
    const { type, sessionId } = payload;
    logger.debug(`Event: ${type}`, { sessionId });

    switch (type) {
      case "session.created": {
        // Step 1: Initialize session state with default values (phase: "idle", errorCount: 0, etc.)
        // This creates a fresh SessionState object based on the provided config
        const state = SessionManager.initializeSessionState(sessionId, config);
        // Step 2: Store the initialized state in the SessionManager's internal Map
        // The Map provides O(1) access for subsequent state operations
        SessionManager.setState(sessionId, state);
        logger.info("Session initialized", { sessionId });
        break;
      }

      case "session.deleted": {
        SessionManager.deleteSession(sessionId);
        compactionHandler.clearSessionTodos(sessionId);
        todoEnforcer.clearSessionTodos(sessionId);
        logger.info("Session cleaned up", { sessionId });
        break;
      }

      case "session.idle": {
        SessionManager.updateActivity(sessionId);
        break;
      }

      default:
        logger.debug(`Unhandled event type: ${type}`, { sessionId });
    }
  };
}

export function createStopHandler(
  config: Config
) {
  return async (payload: StopHookPayload): Promise<StopHookResult> => {
    const { sessionId } = payload;
    const state = SessionManager.getStateOrUndefined(sessionId);

    if (!state) {
      return createStopHookResult(true);
    }

    // Check for pending todos if strict enforcement is enabled
    if (config.workflow.strictTodoEnforcement) {
      const todoResult = await todoEnforcer.checkPendingTodos(sessionId);
      if (!todoResult.allow) {
        logger.info("Stop blocked due to pending todos", {
          sessionId,
          pendingCount: todoResult.pendingCount,
        });
        return createStopHookResult(false, todoResult.reason);
      }
    }

    // Log workflow status on stop (informational, doesn't block)
    if (config.workflow.enablePhaseTracking && state.phase !== "idle") {
      const phaseHistory = workflowEngine.getPhaseHistory(sessionId);
      const completed = workflowEngine.isWorkflowComplete(sessionId);

      if (!completed && state.phase !== "verification") {
        logger.info("Session stopping before workflow completion", {
          sessionId,
          currentPhase: state.phase,
          phaseCount: phaseHistory.length,
        });
      }
    }

    return createStopHookResult(true);
  };
}

/**
 * Create a tool before handler for security validation.
 *
 * ## Security Action Behavior
 *
 * The security validation returns one of three actions:
 *
 * ### `deny` - Block Execution
 * - Returns `{ allow: false, message: "..." }`
 * - Tool execution is blocked entirely
 * - Security event is logged to session metadata
 *
 * ### `ask` - Warn and Continue
 * - Returns `{ allow: true, message: "[SECURITY WARNING] ..." }`
 * - Tool execution proceeds with a warning message
 * - The warning message is included in the tool result
 * - **Note**: OpenCode does not currently support interactive user confirmation
 *   from plugin hooks. The "ask" action is implemented as a warning that
 *   allows execution to proceed while alerting the AI to the potential risk.
 *
 * ### `allow` - Normal Execution
 * - Returns `{ allow: true }` with no message
 * - Tool execution proceeds normally
 *
 * ## Future Enhancement: User Confirmation Flow
 *
 * When OpenCode adds support for interactive confirmation from plugins:
 * 1. The `ask` action would pause execution and prompt the user
 * 2. User would see: "[SECURITY] Command requires confirmation: {reason}"
 * 3. User chooses: [Allow] [Deny] [Allow All Similar]
 * 4. Handler would return based on user choice
 *
 * @param config - Plugin configuration
 * @returns Tool before hook handler function
 */
export function createToolBeforeHandler(
  config: Config
) {
  return async (payload: ToolBeforeHookPayload): Promise<ToolBeforeHookResult> => {
    const { tool, sessionId, input } = payload;

    logger.debug(`Tool before: ${tool}`, { sessionId });

    // Security validation via ToolInterceptor (if enabled)
    if (config.security.enableObfuscationDetection) {
      const validationResult = await toolInterceptor.beforeExecute(tool, input, sessionId);

      if (validationResult.action === "deny") {
        logger.warn("Security validation denied tool execution", {
          tool,
          sessionId,
          reason: validationResult.reason,
          pattern: validationResult.matchedPattern,
        });

        // Store security event in session metadata
        SessionManager.setMetadata(sessionId, "lastSecurityBlock", {
          timestamp: Date.now(),
          tool,
          reason: validationResult.reason,
          pattern: validationResult.matchedPattern,
        });

        return createToolBeforeResult(
          false,
          `[SECURITY] ${validationResult.reason}. Pattern: ${validationResult.matchedPattern}`
        );
      }

      if (validationResult.action === "ask") {
        logger.info("Security validation requires user confirmation", {
          tool,
          sessionId,
          reason: validationResult.reason,
        });

        // Store warning event in session metadata for audit trail
        SessionManager.setMetadata(sessionId, "lastSecurityWarning", {
          timestamp: Date.now(),
          tool,
          reason: validationResult.reason,
          pattern: validationResult.matchedPattern,
        });

        // For "ask" action, we return allow: true but include a warning message
        // The warning message alerts the AI to proceed with caution
        // Note: Interactive user confirmation is not currently supported by OpenCode
        return createToolBeforeResult(
          true,
          `[SECURITY WARNING] ${validationResult.reason}. Pattern matched: ${validationResult.matchedPattern}. Proceed with caution.`
        );
      }
    } else {
      // Even when security is disabled, call beforeExecute to start timing
      await toolInterceptor.beforeExecute(tool, input, sessionId);
    }

    return createToolBeforeResult(true);
  };
}

export function createToolAfterHandler(
  config: Config
) {
  return async (payload: ToolAfterHookPayload): Promise<void> => {
    const { tool, sessionId, output, input } = payload;

    // Log tool execution via ToolInterceptor (handles duration tracking and history)
    await toolInterceptor.afterExecute(tool, output, sessionId);

    const state = SessionManager.getStateOrUndefined(sessionId);
    if (state) {
      // Use ErrorRecovery module for comprehensive error handling
      const recoveryResult = await ErrorRecovery.checkForErrors(tool, output, sessionId);

      // Log recovery actions based on result
      if (recoveryResult.action === "suggested" && recoveryResult.recoveryMessage) {
        logger.info("Error recovery suggestions provided", {
          tool,
          sessionId,
          strikeCount: recoveryResult.strikeCount,
        });
      } else if (recoveryResult.action === "escalated") {
        logger.warn("Session escalated to Stilgar due to repeated errors", {
          tool,
          sessionId,
          strikeCount: recoveryResult.strikeCount,
        });

        // Trigger auto-escalation if configured
        if (config.workflow.autoEscalateOnError) {
          SessionManager.setMetadata(sessionId, "stilgarEscalation", {
            message: recoveryResult.escalationMessage,
            timestamp: Date.now(),
          });
        }
      }

      // Update workflow phase based on tool usage (if phase tracking enabled)
      if (config.workflow.enablePhaseTracking) {
        await workflowEngine.updatePhase(tool, sessionId, input);
      }

      if (tool === "todowrite") {
        const todoData = output as {
          todos?: Array<{
            id?: string;
            content?: string;
            description?: string;
            status?: string;
          }>
        } | undefined;
        if (todoData?.todos) {
          const total = todoData.todos.length;
          const completed = todoData.todos.filter(
            (t) => t.status === "completed"
          ).length;
          SessionManager.updateTodos(sessionId, total, completed);

          // Store pending todos for compaction preservation
          compactionHandler.storePendingTodos(sessionId, todoData.todos);
        }
      }
    }

    logger.debug(`Tool after: ${tool}`, { sessionId });
  };
}

/**
 * Create a system transform handler that injects orchestration rules.
 *
 * This handler:
 * 1. **Starts the workflow** on first user interaction (idle → intent transition)
 * 2. Uses SystemPromptInjector to inject AGENTS.md and identity header
 * 3. Adds phase-specific workflow guidance
 * 4. Adds error recovery messages based on strike count
 *
 * ## Workflow Initialization Strategy
 *
 * The `experimental.chat.system.transform` hook is the earliest point where we can
 * detect user interaction. Unlike tool hooks which only fire during tool execution,
 * this hook fires for every AI response, including the initial one before any tools
 * are called.
 *
 * On first invocation for a session (when phase is "idle" and workflowStarted is not set):
 * - Calls `workflowEngine.startWorkflow(sessionId)` to transition idle → intent
 * - Sets `workflowStarted: true` in session metadata to prevent repeated calls
 * - This ensures Intent → Assessment progression happens before any tool execution
 *
 * @example
 * ```
 * // Hook execution order:
 * // 1. User sends first message
 * // 2. system.transform hook fires → startWorkflow() called → idle → intent
 * // 3. AI processes and potentially calls tools
 * // 4. tool.execute.after hook fires → further phase transitions
 * ```
 *
 * @param config - Plugin configuration
 * @param projectPath - Project path for AGENTS.md location (optional)
 * @returns System transform hook handler
 */
export function createSystemTransformHandler(
  config: Config,
  projectPath?: string
) {
  // Create managers for the handler
  const identityManager = new IdentityManager(config);
  const systemPromptInjector = new SystemPromptInjector(identityManager, projectPath);

  return async (
    payload: SystemTransformHookPayload
  ): Promise<SystemTransformHookResult> => {
    const { system, sessionId } = payload;
    const state = SessionManager.getStateOrUndefined(sessionId);

    // Start workflow on first user interaction if phase tracking is enabled
    // This ensures the workflow transitions from idle → intent before any tool execution
    if (state && config.workflow.enablePhaseTracking) {
      const workflowStarted = SessionManager.getMetadata(sessionId, "workflowStarted") as boolean | undefined;

      if (!workflowStarted && state.phase === "idle") {
        // Transition from idle to intent phase
        workflowEngine.startWorkflow(sessionId);

        // Set flag to prevent repeated startWorkflow calls on subsequent transforms
        SessionManager.setMetadata(sessionId, "workflowStarted", true);

        logger.debug("Workflow started on first system transform", { sessionId });
      }
    }

    // Use SystemPromptInjector to inject AGENTS.md and identity header
    let enhanced = await systemPromptInjector.inject(system, sessionId);

    // Add phase-specific guidance using WorkflowEngine
    if (state && state.phase !== "idle" && config.workflow.enablePhaseTracking) {
      const phaseGuidance = workflowEngine.generatePhaseGuidance(
        state.phase,
        state.workflow.intentClassification
      );
      if (phaseGuidance) {
        enhanced += `\n\n${phaseGuidance}\n`;
      }
    }

    // Add error recovery guidance based on strike count
    if (state && state.errorCount > 0) {
      // Check for escalation state
      const isEscalated = ErrorRecovery.isEscalated(sessionId);
      const escalationData = SessionManager.getMetadata(sessionId, "stilgarEscalation") as
        | { message: string; timestamp: number }
        | undefined;

      if (isEscalated && escalationData?.message) {
        // Include full Stilgar escalation message
        enhanced += `\n\n${escalationData.message}\n`;
      } else if (state.errorCount >= 2) {
        // Strike 2: Include recovery suggestions
        const suggestion = ErrorRecovery.getRecoverySuggestion(
          SessionManager.getMetadata(sessionId, "lastError")
        );
        const recoveryBlock = `\n\n[ERROR RECOVERY - Strike ${state.errorCount}/3]
${suggestion.message}

Suggested actions:
${suggestion.suggestions.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}

Proceed carefully. ${state.errorCount === 2 ? "One more error will trigger Stilgar escalation." : ""}
`;
        enhanced += recoveryBlock;
      } else {
        // Strike 1: Simple warning
        const errorBlock = `\n\n[ERROR RECOVERY]\nConsecutive errors: ${state.errorCount}/3. Proceed carefully.\n`;
        enhanced += errorBlock;
      }
    }

    return createSystemTransformResult(enhanced);
  };
}

/**
 * Get the SystemPromptInjector and IdentityManager for external access.
 * Useful for testing or advanced use cases.
 *
 * @param config - Plugin configuration
 * @param projectPath - Project path for AGENTS.md location
 * @returns Object containing managers
 */
export function createSystemTransformManagers(config: Config, projectPath?: string) {
  const identityManager = new IdentityManager(config);
  const systemPromptInjector = new SystemPromptInjector(identityManager, projectPath);
  return { identityManager, systemPromptInjector };
}

/**
 * Create a compaction handler that preserves critical session state.
 *
 * This handler uses the CompactionHandler class to:
 * 1. Extract critical state (workflow phase, todos, strike counter)
 * 2. Format state as markdown
 * 3. Inject into compacted context
 *
 * @param config - Plugin configuration
 * @returns Compaction hook handler
 */
export function createCompactionHandler(
  config: Config
) {
  return async (
    payload: CompactionHookPayload
  ): Promise<CompactionHookResult> => {
    const { summary, sessionId } = payload;
    const state = SessionManager.getStateOrUndefined(sessionId);

    if (!state) {
      return createCompactionResult(summary);
    }

    // Use CompactionHandler to preserve state
    const personaName = config.identity.personaName;
    const stateBlock = await compactionHandler.preserveState(sessionId, personaName);

    return createCompactionResult(summary + stateBlock);
  };
}
