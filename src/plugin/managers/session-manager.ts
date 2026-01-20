/**
 * SessionManager - Map-based session state management
 *
 * Implements the session lifecycle management using OpenCode's Map-based state pattern.
 * This is the foundation for all stateful orchestration features.
 *
 * Key features:
 * - In-memory Map for session state storage
 * - Auto-initialization on getState() if session doesn't exist
 * - Session cleanup on deletion
 * - Multiple concurrent sessions supported
 */

import type { SessionState, WorkflowPhase, WorkflowState, ToolExecutionRecord } from "../types.js";
import type { Config } from "../../lib/config.js";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger("atreides:session-manager");

/**
 * Internal session state storage.
 * Uses Map for O(1) lookups and automatic garbage collection on delete.
 */
const sessions = new Map<string, SessionState>();

/**
 * Default config used when auto-initializing sessions without explicit config.
 * This allows getState() to work even before plugin initialization.
 */
let defaultConfig: Config | null = null;

/**
 * Set the default config used for auto-initialization.
 * Called during plugin initialization.
 */
export function setDefaultConfig(config: Config): void {
  defaultConfig = config;
}

/**
 * Initialize a new session state.
 * Creates a fresh SessionState with default values.
 *
 * @param sessionId - Unique session identifier
 * @param config - Plugin configuration to associate with this session
 * @returns Newly created SessionState
 */
/**
 * Create initial workflow state for a new session.
 *
 * @returns Initial WorkflowState
 */
export function createInitialWorkflowState(): WorkflowState {
  const state: WorkflowState = {
    currentPhase: "idle",
    phaseHistory: [],
    startedAt: Date.now(),
    completed: false,
  };
  return state;
}

export function initializeSessionState(
  sessionId: string,
  config: Config
): SessionState {
  const now = new Date();
  const workflow = createInitialWorkflowState();
  return {
    sessionId,
    createdAt: now,
    lastActivityAt: now,
    phase: workflow.currentPhase,
    workflow,
    errorCount: 0,
    todosCreated: false,
    todoCount: 0,
    todosCompleted: 0,
    toolHistory: [] as ToolExecutionRecord[],
    config,
    metadata: {},
  };
}

/**
 * Get session state by ID.
 * If session doesn't exist, auto-initializes a new one.
 * This provides lazy initialization for sessions.
 *
 * @param sessionId - Unique session identifier
 * @param config - Optional config to use for initialization (uses defaultConfig if not provided)
 * @returns SessionState for the given sessionId
 * @throws Error if no config is available for auto-initialization
 */
export function getState(sessionId: string, config?: Config): SessionState {
  let state = sessions.get(sessionId);
  if (!state) {
    const initConfig = config ?? defaultConfig;
    if (!initConfig) {
      throw new Error(
        `Cannot auto-initialize session '${sessionId}': no config available. ` +
        `Call setDefaultConfig() first or provide config parameter.`
      );
    }
    state = initializeSessionState(sessionId, initConfig);
    sessions.set(sessionId, state);
    logger.debug("Session auto-initialized", { sessionId });
  }
  return state;
}

/**
 * Get session state by ID, returning undefined if not found.
 * Use this when you need to check if a session exists without auto-creating.
 *
 * @param sessionId - Unique session identifier
 * @returns SessionState if found, undefined otherwise
 */
export function getStateOrUndefined(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId);
}

/**
 * Set session state explicitly.
 * Used when initializing from events or restoring state.
 *
 * @param sessionId - Unique session identifier
 * @param state - SessionState to store
 */
export function setState(sessionId: string, state: SessionState): void {
  sessions.set(sessionId, state);
  logger.debug("Session state set", { sessionId });
}

/**
 * Delete session state.
 * Removes all state associated with a session ID.
 * Safe to call even if session doesn't exist.
 *
 * @param sessionId - Unique session identifier
 * @returns true if session existed and was deleted, false otherwise
 */
export function deleteSession(sessionId: string): boolean {
  const existed = sessions.has(sessionId);
  sessions.delete(sessionId);
  if (existed) {
    logger.debug("Session deleted", { sessionId });
  }
  return existed;
}

/**
 * Check if a session exists.
 *
 * @param sessionId - Unique session identifier
 * @returns true if session exists, false otherwise
 */
export function hasSession(sessionId: string): boolean {
  return sessions.has(sessionId);
}

/**
 * Get all sessions.
 * Returns a copy of the sessions map to prevent external mutation.
 *
 * @returns Copy of the sessions Map
 */
export function getAllSessions(): Map<string, SessionState> {
  return new Map(sessions);
}

/**
 * Get the count of active sessions.
 *
 * @returns Number of active sessions
 */
export function getSessionCount(): number {
  return sessions.size;
}

/**
 * Clear all sessions.
 * Removes all stored session state.
 * Primarily used for testing.
 */
export function clearSessions(): void {
  const count = sessions.size;
  sessions.clear();
  defaultConfig = null;
  logger.debug("All sessions cleared", { count });
}

/**
 * Update session activity timestamp.
 * Called when any activity occurs in a session.
 *
 * @param sessionId - Unique session identifier
 */
export function updateActivity(sessionId: string): void {
  const state = sessions.get(sessionId);
  if (state) {
    state.lastActivityAt = new Date();
  }
}

/**
 * Record a tool execution in session history.
 *
 * @param sessionId - Unique session identifier
 * @param record - Tool execution record to add
 */
export function addToolExecution(
  sessionId: string,
  record: ToolExecutionRecord
): void {
  const state = sessions.get(sessionId);
  if (state) {
    state.toolHistory.push(record);
    state.lastActivityAt = new Date();
  }
}

/**
 * Increment error count for a session.
 * Used for 3-strikes error recovery protocol.
 *
 * @param sessionId - Unique session identifier
 * @returns New error count, or 0 if session not found
 */
export function incrementErrorCount(sessionId: string): number {
  const state = sessions.get(sessionId);
  if (state) {
    state.errorCount++;
    return state.errorCount;
  }
  return 0;
}

/**
 * Reset error count for a session.
 * Called when a successful operation occurs.
 *
 * @param sessionId - Unique session identifier
 */
export function resetErrorCount(sessionId: string): void {
  const state = sessions.get(sessionId);
  if (state) {
    state.errorCount = 0;
  }
}

/**
 * Update todo tracking state.
 *
 * @param sessionId - Unique session identifier
 * @param total - Total number of todos
 * @param completed - Number of completed todos
 */
export function updateTodos(
  sessionId: string,
  total: number,
  completed: number
): void {
  const state = sessions.get(sessionId);
  if (state) {
    state.todosCreated = true;
    state.todoCount = total;
    state.todosCompleted = completed;
  }
}

/**
 * Update workflow phase for a session.
 * Updates both the shortcut `phase` field and the `workflow.currentPhase`.
 *
 * @param sessionId - Unique session identifier
 * @param phase - New workflow phase
 */
export function setPhase(sessionId: string, phase: WorkflowPhase): void {
  const state = sessions.get(sessionId);
  if (state) {
    state.phase = phase;
    state.workflow.currentPhase = phase;
    state.lastActivityAt = new Date();
    logger.debug("Phase updated", { sessionId, phase });
  }
}

/**
 * Get the workflow state for a session.
 *
 * @param sessionId - Unique session identifier
 * @returns WorkflowState or undefined if session not found
 */
export function getWorkflowState(sessionId: string): WorkflowState | undefined {
  const state = sessions.get(sessionId);
  return state?.workflow;
}

/**
 * Set custom metadata for a session.
 *
 * @param sessionId - Unique session identifier
 * @param key - Metadata key
 * @param value - Metadata value
 */
export function setMetadata(
  sessionId: string,
  key: string,
  value: unknown
): void {
  const state = sessions.get(sessionId);
  if (state) {
    state.metadata[key] = value;
  }
}

/**
 * Get custom metadata from a session.
 *
 * @param sessionId - Unique session identifier
 * @param key - Metadata key
 * @returns Metadata value or undefined
 */
export function getMetadata(sessionId: string, key: string): unknown {
  const state = sessions.get(sessionId);
  return state?.metadata[key];
}
