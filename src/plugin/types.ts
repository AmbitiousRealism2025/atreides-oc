/**
 * Plugin Types for Atreides OpenCode
 *
 * This module defines all type definitions for the plugin system including:
 * - SessionState: Per-session state management
 * - Hook handler types: Type-safe hook definitions
 * - Error types: Plugin-specific error handling
 * - Utility types: Helper types for plugin development
 */

import type { Config } from "../lib/config.js";

// =============================================================================
// OpenCode Context Types (provided by OpenCode runtime)
// =============================================================================

/**
 * OpenCode project context provided during plugin initialization.
 * Contains metadata about the current project.
 */
export interface OpenCodeProject {
  /** Absolute path to the project root */
  path: string;
  /** Project name derived from directory or package.json */
  name?: string;
}

/**
 * OpenCode client interface for plugin-to-runtime communication.
 * Allows plugins to interact with the OpenCode runtime.
 */
export interface OpenCodeClient {
  /** Send a message to the OpenCode runtime */
  notify?: (event: string, data?: unknown) => void;
  /** Log a message through OpenCode's logging system */
  log?: (level: string, message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Shell execution interface provided by OpenCode.
 * Allows plugins to execute shell commands.
 */
export interface OpenCodeShell {
  /** Execute a shell command and return the result */
  (command: string, options?: { cwd?: string; timeout?: number }): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;
}

/**
 * Complete plugin context provided by OpenCode during initialization.
 */
export interface PluginContext {
  /** Project information */
  project: OpenCodeProject;
  /** OpenCode client interface */
  client: OpenCodeClient;
  /** Shell execution function */
  $: OpenCodeShell;
  /** Current working directory */
  directory: string;
  /** Git worktree path (if applicable) */
  worktree?: string;
}

// =============================================================================
// Session State Types
// =============================================================================

/**
 * Workflow phase enumeration.
 * Represents the current phase of the development workflow.
 *
 * Phase flow: intent → assessment → exploration → implementation → verification
 * - idle: Initial state before any activity
 * - intent: User has stated their goal/task
 * - assessment: Analyzing the problem before exploration
 * - exploration: Reading files, searching code, gathering context
 * - implementation: Writing code, making changes
 * - verification: Testing, validating changes
 */
export type WorkflowPhase =
  | "intent"
  | "assessment"
  | "exploration"
  | "implementation"
  | "verification"
  | "idle";

/**
 * Record of a phase transition in the workflow.
 * Used for tracking phase history and debugging workflow behavior.
 */
export interface PhaseTransition {
  /** Previous workflow phase */
  from: WorkflowPhase;
  /** New workflow phase */
  to: WorkflowPhase;
  /** Timestamp when transition occurred */
  timestamp: number;
  /** Tool that triggered the transition (if applicable) */
  triggeredBy?: string;
  /** Optional reason for the transition */
  reason?: string;
}

/**
 * Extended workflow state tracked per session.
 * Includes phase history and intent classification.
 */
export interface WorkflowState {
  /** Current workflow phase */
  currentPhase: WorkflowPhase;
  /** History of phase transitions */
  phaseHistory: PhaseTransition[];
  /** Classified intent type (heuristic-based) */
  intentClassification?: IntentType;
  /** Timestamp when workflow started */
  startedAt: number;
  /** Whether workflow has been completed (reached verification) */
  completed: boolean;
}

/**
 * Intent classification types (heuristic-based).
 * Categorizes the user's request to guide workflow behavior.
 */
export type IntentType =
  | "feature"        // New feature implementation
  | "bugfix"         // Bug fix or issue resolution
  | "refactor"       // Code refactoring
  | "exploration"    // Codebase exploration/understanding
  | "documentation"  // Documentation updates
  | "test"           // Test-related work
  | "config"         // Configuration changes
  | "unknown";       // Cannot classify

/**
 * Per-session state managed by the plugin.
 * Stored in a Map keyed by sessionId.
 */
export interface SessionState {
  /** Unique session identifier */
  sessionId: string;
  /** Session creation timestamp */
  createdAt: Date;
  /** Last activity timestamp */
  lastActivityAt: Date;
  /** Current workflow phase (shortcut for workflow.currentPhase) */
  phase: WorkflowPhase;
  /** Full workflow state including history and intent */
  workflow: WorkflowState;
  /** Consecutive error count for 3-strikes protocol */
  errorCount: number;
  /** Whether todos have been created in this session */
  todosCreated: boolean;
  /** Number of todos created */
  todoCount: number;
  /** Number of todos completed */
  todosCompleted: number;
  /** Tool execution history for the session */
  toolHistory: ToolExecutionRecord[];
  /** Plugin configuration snapshot for this session */
  config: Config;
  /** Custom metadata storage */
  metadata: Record<string, unknown>;
}

/**
 * Record of a tool execution within a session.
 */
export interface ToolExecutionRecord {
  /** Tool name that was executed */
  tool: string;
  /** Timestamp of execution */
  timestamp: Date;
  /** Whether execution was successful */
  success: boolean;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// Hook Handler Types
// =============================================================================

/**
 * Event hook payload - fired for session lifecycle events.
 */
export interface EventHookPayload {
  /** Event type (e.g., 'session.created', 'session.deleted') */
  type: string;
  /** Session identifier */
  sessionId: string;
  /** Additional event data */
  data?: Record<string, unknown>;
}

/**
 * Stop hook payload - fired when user tries to stop/end session.
 */
export interface StopHookPayload {
  /** Session identifier */
  sessionId: string;
}

/**
 * Stop hook result - determines if stop is allowed.
 */
export interface StopHookResult {
  /** Whether to allow the stop action */
  allow: boolean;
  /** Message to display if stop is blocked */
  message?: string;
}

/**
 * Tool execute before hook payload.
 */
export interface ToolBeforeHookPayload {
  /** Tool being executed */
  tool: string;
  /** Tool input parameters */
  input: unknown;
  /** Session identifier */
  sessionId: string;
}

/**
 * Tool execute before hook result.
 */
export interface ToolBeforeHookResult {
  /** Whether to allow the tool execution */
  allow: boolean;
  /** Message to display if blocked */
  message?: string;
  /** Modified input (if transformation needed) */
  modified?: unknown;
}

/**
 * Tool execute after hook payload.
 */
export interface ToolAfterHookPayload {
  /** Tool that was executed */
  tool: string;
  /** Tool input parameters */
  input: unknown;
  /** Tool output/result */
  output: unknown;
  /** Session identifier */
  sessionId: string;
}

/**
 * System prompt transform hook payload.
 */
export interface SystemTransformHookPayload {
  /** Current system prompt */
  system: string;
  /** Session identifier */
  sessionId: string;
}

/**
 * System prompt transform hook result.
 */
export interface SystemTransformHookResult {
  /** Transformed system prompt */
  system: string;
}

/**
 * Session compaction hook payload.
 */
export interface CompactionHookPayload {
  /** Session identifier */
  sessionId: string;
  /** Current compaction summary */
  summary: string;
}

/**
 * Session compaction hook result.
 */
export interface CompactionHookResult {
  /** Enhanced compaction summary with preserved state */
  summary: string;
}

// =============================================================================
// Hook Handler Function Types
// =============================================================================

/** Event hook handler function type */
export type EventHookHandler = (
  payload: EventHookPayload
) => void | Promise<void>;

/** Stop hook handler function type */
export type StopHookHandler = (
  payload: StopHookPayload
) => StopHookResult | Promise<StopHookResult>;

/** Tool before hook handler function type */
export type ToolBeforeHookHandler = (
  payload: ToolBeforeHookPayload
) => ToolBeforeHookResult | Promise<ToolBeforeHookResult>;

/** Tool after hook handler function type */
export type ToolAfterHookHandler = (
  payload: ToolAfterHookPayload
) => void | Promise<void>;

/** System transform hook handler function type */
export type SystemTransformHookHandler = (
  payload: SystemTransformHookPayload
) => SystemTransformHookResult | Promise<SystemTransformHookResult>;

/** Compaction hook handler function type */
export type CompactionHookHandler = (
  payload: CompactionHookPayload
) => CompactionHookResult | Promise<CompactionHookResult>;

// =============================================================================
// Plugin Hooks Interface
// =============================================================================

/**
 * Complete plugin hooks object returned by the plugin function.
 */
export interface PluginHooks {
  /** Session lifecycle event handler */
  event: EventHookHandler;
  /** Session stop handler */
  stop: StopHookHandler;
  /** Pre-tool execution handler */
  "tool.execute.before": ToolBeforeHookHandler;
  /** Post-tool execution handler */
  "tool.execute.after": ToolAfterHookHandler;
  /** System prompt transformation handler */
  "experimental.chat.system.transform": SystemTransformHookHandler;
  /** Session compaction handler */
  "experimental.session.compacting": CompactionHookHandler;
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Base error class for Atreides plugin errors.
 */
export class AtreidesPluginError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AtreidesPluginError";
  }
}

/**
 * Error thrown when a hook execution fails.
 */
export class HookExecutionError extends AtreidesPluginError {
  constructor(
    hookName: string,
    originalError: Error,
    context?: Record<string, unknown>
  ) {
    super(
      `Hook '${hookName}' failed: ${originalError.message}`,
      "HOOK_EXECUTION_ERROR",
      { hookName, originalError: originalError.message, ...context }
    );
    this.name = "HookExecutionError";
  }
}

/**
 * Error thrown when session state is invalid or missing.
 */
export class SessionStateError extends AtreidesPluginError {
  constructor(sessionId: string, reason: string) {
    super(`Session '${sessionId}': ${reason}`, "SESSION_STATE_ERROR", {
      sessionId,
    });
    this.name = "SessionStateError";
  }
}

/**
 * Error thrown when security validation fails.
 */
export class SecurityValidationError extends AtreidesPluginError {
  constructor(
    tool: string,
    reason: string,
    context?: Record<string, unknown>
  ) {
    super(
      `Security validation failed for '${tool}': ${reason}`,
      "SECURITY_VALIDATION_ERROR",
      { tool, ...context }
    );
    this.name = "SecurityValidationError";
  }
}

// =============================================================================
// Security Hardening Types
// =============================================================================

/**
 * Action to take after security validation.
 * - allow: Command/file operation is safe to execute
 * - deny: Command/file operation is blocked
 * - ask: Requires user confirmation before proceeding
 */
export type SecurityAction = "allow" | "deny" | "ask";

/**
 * Result of command validation through the security pipeline.
 */
export interface CommandValidationResult {
  /** Action to take */
  action: SecurityAction;
  /** Reason for the action (if denied or ask) */
  reason?: string;
  /** Pattern that matched (for debugging/logging) */
  matchedPattern?: string;
  /** Normalized command used for validation */
  normalizedCommand?: string;
}

/**
 * Result of file path validation.
 */
export interface FileValidationResult {
  /** Action to take */
  action: SecurityAction;
  /** Reason for the action (if denied or ask) */
  reason?: string;
  /** Pattern that matched */
  matchedPattern?: string;
}

/**
 * Configuration for security patterns.
 * Extends the base security config from Config.
 */
export interface SecurityPatternConfig {
  /** Additional blocked command patterns (RegExp strings) */
  blockedPatterns: readonly RegExp[];
  /** Warning patterns that trigger "ask" action */
  warningPatterns: readonly RegExp[];
  /** Blocked file patterns */
  blockedFiles: readonly RegExp[];
  /** Blocked path patterns */
  blockedPaths: readonly RegExp[];
}

/**
 * Security validation statistics for monitoring.
 */
export interface SecurityValidationStats {
  /** Total commands validated */
  commandsValidated: number;
  /** Commands blocked */
  commandsBlocked: number;
  /** Commands requiring confirmation */
  commandsWarned: number;
  /** Files blocked */
  filesBlocked: number;
  /** Obfuscation attempts detected */
  obfuscationDetected: number;
  /** Average validation time in ms */
  avgValidationTimeMs: number;
}

// =============================================================================
// Todo Enforcer Types
// =============================================================================

/**
 * Represents a single todo item tracked by TodoEnforcer.
 */
export interface TodoItem {
  /** Unique identifier for this todo */
  id: string;
  /** Human-readable description of the todo */
  description: string;
  /** Timestamp when the todo was created (ms since epoch) */
  createdAt: number;
  /** Timestamp when the todo was completed (ms since epoch), undefined if pending */
  completedAt?: number;
}

/**
 * Result of checking pending todos before session stop.
 */
export interface PendingTodosResult {
  /** Whether the stop action should be allowed */
  allow: boolean;
  /** Message explaining why stop was blocked (if blocked) */
  reason?: string;
  /** Count of pending todos */
  pendingCount: number;
  /** List of pending todo descriptions (for display) */
  pendingTodos: string[];
}

// =============================================================================
// Error Recovery Types
// =============================================================================

/**
 * Error recovery state tracked per session.
 * Stored in session metadata under 'errorRecovery' key.
 */
export interface ErrorRecoveryState {
  /** Whether the session has been escalated to Stilgar */
  escalated: boolean;
  /** Timestamp when escalation occurred */
  escalatedAt?: number;
  /** Tool that triggered the escalation */
  triggeringTool?: string;
  /** Strike count at time of escalation */
  strikeCount?: number;
  /** Timestamp when escalation was resolved */
  resolvedAt?: number;
}

/**
 * Last error information stored in session metadata.
 */
export interface LastErrorInfo {
  /** Timestamp when error occurred */
  timestamp: number;
  /** Tool that produced the error */
  tool: string;
  /** Truncated output from the error */
  output: string;
  /** Categorized error type */
  category: string;
}

/**
 * Recovery suggestion for a specific error category.
 */
export interface RecoverySuggestion {
  /** Error category identifier */
  category: string;
  /** Human-readable error message */
  message: string;
  /** List of actionable recovery suggestions */
  suggestions: string[];
}

/**
 * Result from the error recovery check.
 */
export interface ErrorRecoveryResult {
  /** Whether an error was detected */
  errorDetected: boolean;
  /** Current strike count (0 if reset) */
  strikeCount: number;
  /** Action taken: logged, suggested, escalated, reset, or none */
  action: "logged" | "suggested" | "escalated" | "reset" | "none";
  /** Recovery suggestion (if error detected) */
  suggestion?: RecoverySuggestion;
  /** Formatted recovery message (for strike 2) */
  recoveryMessage?: string;
  /** Formatted escalation message (for strike 3+) */
  escalationMessage?: string;
}

// =============================================================================
// Tool Output Contract Types
// =============================================================================

/**
 * Standard tool output shape expected by the plugin.
 *
 * Tools may return different output shapes, but the plugin expects to find
 * error information in specific fields. This interface documents the expected
 * contract for tool outputs to enable consistent error detection.
 *
 * ## Field Priority for Error Detection
 *
 * The error recovery system checks fields in this order:
 * 1. `exitCode` - Non-zero indicates failure (Bash, shell tools)
 * 2. `error` - Boolean or error object/message
 * 3. `stderr` - Standard error output text
 * 4. `stdout` - Standard output (checked for error patterns)
 * 5. `output` - Generic output field
 * 6. `message` - Result message
 *
 * ## Tool-Specific Output Shapes
 *
 * | Tool   | Primary Fields                              |
 * |--------|---------------------------------------------|
 * | Bash   | `stdout`, `stderr`, `exitCode`              |
 * | Read   | `content` or error string                   |
 * | Write  | `success`, `message`                        |
 * | Edit   | `success`, `message`                        |
 * | Glob   | Array of file paths or error                |
 * | Grep   | Array of matches or error                   |
 * | Task   | `output`, `error`, `status`                 |
 */
export interface ToolOutput {
  /** Exit code for shell commands (0 = success, non-zero = failure) */
  exitCode?: number;
  /** Standard output text */
  stdout?: string;
  /** Standard error text */
  stderr?: string;
  /** Generic output field */
  output?: string;
  /** Result message */
  message?: string;
  /** Error indicator (boolean, string, or object) */
  error?: boolean | string | { message?: string; code?: string };
  /** Success indicator */
  success?: boolean;
  /** File content (for Read tool) */
  content?: string;
  /** Status string (for Task tool) */
  status?: string;
}

/**
 * Structured error information extracted from tool output.
 */
export interface ExtractedToolError {
  /** Whether an error was detected */
  hasError: boolean;
  /** Error message if available */
  message?: string;
  /** Error code or exit code */
  code?: number | string;
  /** Source of the error (field name) */
  source?: "exitCode" | "error" | "stderr" | "stdout" | "output" | "message";
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Extract the return type of an async function.
 */
export type AsyncReturnType<T extends (...args: unknown[]) => unknown> =
  T extends (...args: unknown[]) => Promise<infer R>
    ? R
    : T extends (...args: unknown[]) => infer R
      ? R
      : never;

/**
 * Make all properties of T optional and nullable.
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Hook names as a union type for type-safe hook references.
 */
export type HookName = keyof PluginHooks;

/**
 * Map of hook names to their safe default return values.
 */
export interface HookSafeDefaults {
  event: void;
  stop: StopHookResult;
  "tool.execute.before": ToolBeforeHookResult;
  "tool.execute.after": void;
  "experimental.chat.system.transform": SystemTransformHookResult;
  "experimental.session.compacting": CompactionHookResult;
}
