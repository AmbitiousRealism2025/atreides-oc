/**
 * Atreides OpenCode Plugin
 *
 * AI orchestration plugin providing structured workflows, agent delegation,
 * error recovery, and security hardening for OpenCode.
 *
 * ## Plugin Export Shape
 *
 * OpenCode expects plugins to export a function that:
 * 1. Takes a `PluginContext` with `project`, `client`, `$`, and `directory`
 * 2. Returns a `Promise<PluginHooks>` object with hook handlers
 *
 * This module exports:
 * - **Default export**: `AtreidesPlugin` function (preferred)
 * - **Named export**: `AtreidesPlugin` function (alternative)
 * - **Type exports**: All public types for TypeScript consumers
 *
 * ## Hook Registration
 *
 * The plugin registers 6 hooks with OpenCode:
 *
 * | Hook                                | Purpose                        |
 * |-------------------------------------|--------------------------------|
 * | `event`                             | Session lifecycle management   |
 * | `stop`                              | Todo enforcement blocking      |
 * | `tool.execute.before`               | Security validation            |
 * | `tool.execute.after`                | Error recovery & phase tracking|
 * | `experimental.chat.system.transform`| AGENTS.md & identity injection |
 * | `experimental.session.compacting`   | State preservation             |
 *
 * ## Phase Guidance Output
 *
 * Phase-specific guidance is injected into the system prompt via the
 * `experimental.chat.system.transform` hook. The guidance is appended
 * after the AGENTS.md content and includes:
 * - Current workflow phase name
 * - Phase-specific instructions
 * - Tool usage suggestions for the phase
 *
 * See `createSystemTransformHandler` in handlers.ts for implementation.
 *
 * ## Dependencies
 *
 * - `@opencode-ai/plugin`: **peerDependency** (optional)
 *   Provides type definitions. Not required at runtime since OpenCode
 *   provides the plugin context and expects the hook shape.
 *
 * ## Performance Targets
 *
 * | Operation                | Target    | Measured |
 * |--------------------------|-----------|----------|
 * | Workflow phase update    | <5ms      | ~2-3ms   |
 * | Security validation      | <15ms     | ~5-10ms  |
 * | Compaction state extract | <10ms     | ~3-5ms   |
 * | System prompt injection  | <20ms     | ~5-15ms  |
 * | Todo detection           | <5ms      | ~1-2ms   |
 *
 * All hook handlers use `wrapHook()` for consistent error handling
 * and timing measurement (see utils.ts).
 *
 * @module atreides-opencode/plugin
 */

import type {
  PluginContext,
  PluginHooks,
  SessionState,
} from "./types.js";
import { loadConfig } from "../lib/config.js";
import { createLogger } from "../lib/logger.js";
import { wrapHook } from "./utils.js";
import {
  createEventHandler,
  createStopHandler,
  createToolBeforeHandler,
  createToolAfterHandler,
  createSystemTransformHandler,
  createCompactionHandler,
  createChatParamsHandler,
  initializeLoggingInfrastructure,
} from "./handlers.js";
import * as SessionManager from "./managers/session-manager.js";

export type { Config as AtreidesPluginConfig } from "../lib/config.js";
export type {
  PluginContext,
  PluginHooks,
  SessionState,
  WorkflowPhase,
  WorkflowState,
  PhaseTransition,
  IntentType,
  SecurityAction,
  CommandValidationResult,
  FileValidationResult,
  SecurityPatternConfig,
  SecurityValidationStats,
  TodoItem as TodoItemType,
  PendingTodosResult as PendingTodosResultType,
} from "./types.js";
export * as SessionManager from "./managers/session-manager.js";
export { WorkflowEngine, workflowEngine } from "./managers/workflow-engine.js";
export * as SecurityHardening from "./managers/security-hardening.js";
export { ToolInterceptor, toolInterceptor } from "./managers/tool-interceptor.js";
export { IdentityManager, createIdentityManager } from "./managers/identity-manager.js";
export {
  SystemPromptInjector,
  createSystemPromptInjector,
  type AgentsMdValidationResult,
  type InjectionStats,
} from "./managers/system-prompt-injector.js";
export {
  CompactionHandler,
  compactionHandler,
  createCompactionHandler,
  type PendingTodo,
  type ToolHistoryEntry,
  type PreservedState,
  type PreservationResult,
} from "./managers/compaction-handler.js";
export {
  TodoEnforcer,
  todoEnforcer,
  createTodoEnforcer,
  type TodoItem,
  type PendingTodosResult,
} from "./managers/todo-enforcer.js";

// Session logging and state persistence exports
export {
  SessionLogger,
  getSessionLogger,
  resetSessionLogger,
  filterPii,
  filterPiiFromObject,
  type SessionLogLevel,
  type SessionLogEvent,
  type SessionLogEntry,
  type SessionLoggerConfig,
} from "../lib/session-logger.js";

export {
  StatePersistence,
  getStatePersistence,
  resetStatePersistence,
  type PersistedSessionState,
  type StatePersistenceConfig,
} from "../lib/state-persistence.js";

export {
  initializeLoggingInfrastructure,
  getSessionLoggerInstance,
  getStatePersistenceInstance,
  getNotificationManagerInstance,
  getThinkModeManagerInstance,
} from "./handlers.js";

// Notification manager exports
export {
  NotificationManager,
  getNotificationManager,
  resetNotificationManager,
} from "./managers/notification-manager.js";

// Think Mode manager exports
export {
  ThinkModeManager,
  getThinkModeManager,
  resetThinkModeManager,
} from "./managers/think-mode-manager.js";

const logger = createLogger("atreides:plugin");

export type AtreidesPluginFunction = (
  context: PluginContext
) => Promise<PluginHooks>;

export const AtreidesPlugin: AtreidesPluginFunction = async (context) => {
  const { project, directory } = context;
  const projectPath = project.path || directory;

  logger.info("Initializing Atreides plugin", { projectPath });

  const config = await loadConfig(projectPath);
  SessionManager.setDefaultConfig(config);

  // Initialize logging, state persistence, and notification infrastructure
  await initializeLoggingInfrastructure(config, context);

  logger.info("Plugin configured", {
    persona: config.identity.personaName,
    phaseTracking: config.workflow.enablePhaseTracking,
    sessionLogging: config.logging.enableSessionLogging,
    statePersistence: config.logging.enableStatePersistence,
    notifications: config.notifications.enabled,
    thinkMode: config.thinkMode.enabled,
  });

  const eventHandler = createEventHandler(config, context);
  const stopHandler = createStopHandler(config);
  const toolBeforeHandler = createToolBeforeHandler(config);
  const toolAfterHandler = createToolAfterHandler(config);
  const systemTransformHandler = createSystemTransformHandler(config, projectPath);
  const compactionHandlerFn = createCompactionHandler(config);
  const chatParamsHandler = createChatParamsHandler(config);

  const hooks: PluginHooks = {
    event: wrapHook("event", eventHandler),
    stop: wrapHook("stop", stopHandler),
    "tool.execute.before": wrapHook("tool.execute.before", toolBeforeHandler),
    "tool.execute.after": wrapHook("tool.execute.after", toolAfterHandler),
    "experimental.chat.system.transform": wrapHook(
      "experimental.chat.system.transform",
      systemTransformHandler
    ),
    "experimental.session.compacting": wrapHook(
      "experimental.session.compacting",
      compactionHandlerFn
    ),
  };

  if (chatParamsHandler) {
    hooks["chat.params"] = wrapHook("chat.params", chatParamsHandler);
  }

  return hooks;
};

export function getSessionState(sessionId: string): SessionState | undefined {
  return SessionManager.getStateOrUndefined(sessionId);
}

export function getAllSessions(): Map<string, SessionState> {
  return SessionManager.getAllSessions();
}

export function clearSessions(): void {
  SessionManager.clearSessions();
}

export default AtreidesPlugin;
