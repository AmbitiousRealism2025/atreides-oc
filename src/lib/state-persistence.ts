/**
 * State Persistence - File-based session state persistence for Atreides
 *
 * Implements persistent state storage to ~/.atreides/state/{session-id}.json with:
 * - Automatic state serialization/deserialization
 * - State rotation policy (max sessions)
 * - Atomic writes to prevent corruption
 * - State recovery for session resumption
 *
 * State files are stored at: ~/.atreides/state/{session-id}.json
 * Each file contains the full serialized session state.
 */

import { mkdir, writeFile, readFile, readdir, stat, unlink, rename } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createLogger } from "./logger.js";
import { filterPiiFromObject } from "./session-logger.js";
import type { SessionState, WorkflowPhase } from "../plugin/types.js";

const logger = createLogger("atreides:state-persistence");

// =============================================================================
// Types
// =============================================================================

/**
 * Serialized session state for file storage.
 * Contains a subset of SessionState suitable for persistence.
 */
export interface PersistedSessionState {
  /** Version for migration support */
  version: number;
  /** Session identifier */
  sessionId: string;
  /** Session creation timestamp (ISO 8601) */
  createdAt: string;
  /** Last activity timestamp (ISO 8601) */
  lastActivityAt: string;
  /** Last save timestamp (ISO 8601) */
  savedAt: string;
  /** Current workflow phase */
  phase: WorkflowPhase;
  /** Workflow state */
  workflow: {
    currentPhase: WorkflowPhase;
    phaseHistory: Array<{
      from: WorkflowPhase;
      to: WorkflowPhase;
      timestamp: number;
      triggeredBy?: string;
      reason?: string;
    }>;
    intentClassification?: string;
    startedAt: number;
    completed: boolean;
  };
  /** Consecutive error count */
  errorCount: number;
  /** Todo tracking */
  todos: {
    created: boolean;
    count: number;
    completed: number;
  };
  /** Recent tool history (last 50 entries) */
  toolHistory: Array<{
    tool: string;
    timestamp: string;
    success: boolean;
    durationMs?: number;
    error?: string;
  }>;
  /** Custom metadata (filtered for PII) */
  metadata: Record<string, unknown>;
}

/**
 * Configuration for state persistence.
 */
export interface StatePersistenceConfig {
  /** Enable state persistence */
  enabled: boolean;
  /** Maximum number of state files to keep (default: 100) */
  maxStateFiles: number;
  /** Auto-save interval in milliseconds (0 to disable, default: 30000) */
  autoSaveIntervalMs: number;
  /** Enable PII filtering for persisted state */
  enablePiiFiltering: boolean;
  /** Maximum tool history entries to persist (default: 50) */
  maxToolHistoryEntries: number;
}

/**
 * Default persistence configuration.
 */
export const DEFAULT_PERSISTENCE_CONFIG: StatePersistenceConfig = {
  enabled: true,
  maxStateFiles: 100,
  autoSaveIntervalMs: 30000, // 30 seconds
  enablePiiFiltering: true,
  maxToolHistoryEntries: 50,
};

/**
 * Current persisted state schema version.
 */
const STATE_VERSION = 1;

// =============================================================================
// State Directory
// =============================================================================

/**
 * Base directory for Atreides state files.
 */
const STATE_DIR = join(homedir(), ".atreides", "state");

// =============================================================================
// State Persistence Class
// =============================================================================

/**
 * State Persistence Manager for file-based state storage.
 */
export class StatePersistence {
  private config: StatePersistenceConfig;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  private autoSaveTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

  constructor(config: Partial<StatePersistenceConfig> = {}) {
    this.config = { ...DEFAULT_PERSISTENCE_CONFIG, ...config };
  }

  /**
   * Initialize the persistence system (create directories if needed).
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInitialize();
    await this.initPromise;
    this.initialized = true;
  }

  private async _doInitialize(): Promise<void> {
    if (!this.config.enabled) return;

    try {
      await mkdir(STATE_DIR, { recursive: true });
      logger.debug("State persistence directory initialized", { path: STATE_DIR });
    } catch (error) {
      logger.error("Failed to create state directory", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get the state file path for a session.
   */
  getStatePath(sessionId: string): string {
    return join(STATE_DIR, `${sessionId}.json`);
  }

  /**
   * Convert SessionState to PersistedSessionState for storage.
   */
  private serializeState(state: SessionState): PersistedSessionState {
    const toolHistory = state.toolHistory.slice(-this.config.maxToolHistoryEntries);

    // Build workflow object, conditionally including optional fields
    const workflowData: PersistedSessionState["workflow"] = {
      currentPhase: state.workflow.currentPhase,
      phaseHistory: state.workflow.phaseHistory,
      startedAt: state.workflow.startedAt,
      completed: state.workflow.completed,
    };
    if (state.workflow.intentClassification) {
      workflowData.intentClassification = state.workflow.intentClassification;
    }

    const persisted: PersistedSessionState = {
      version: STATE_VERSION,
      sessionId: state.sessionId,
      createdAt: state.createdAt.toISOString(),
      lastActivityAt: state.lastActivityAt.toISOString(),
      savedAt: new Date().toISOString(),
      phase: state.phase,
      workflow: workflowData,
      errorCount: state.errorCount,
      todos: {
        created: state.todosCreated,
        count: state.todoCount,
        completed: state.todosCompleted,
      },
      toolHistory: toolHistory.map(t => {
        const entry: {
          tool: string;
          timestamp: string;
          success: boolean;
          durationMs?: number;
          error?: string;
        } = {
          tool: t.tool,
          timestamp: t.timestamp.toISOString(),
          success: t.success,
        };
        if (t.durationMs !== undefined) entry.durationMs = t.durationMs;
        if (t.error !== undefined) entry.error = t.error;
        return entry;
      }),
      metadata: this.config.enablePiiFiltering
        ? filterPiiFromObject(state.metadata)
        : state.metadata,
    };

    return persisted;
  }

  /**
   * Convert PersistedSessionState back to partial SessionState for restoration.
   */
  private deserializeState(persisted: PersistedSessionState): Partial<SessionState> {
    // Build workflow state, handling optional intentClassification
    // Using Object.assign to conditionally add optional properties
    const workflowState = {
      currentPhase: persisted.workflow.currentPhase,
      phaseHistory: persisted.workflow.phaseHistory,
      startedAt: persisted.workflow.startedAt,
      completed: persisted.workflow.completed,
    } as SessionState["workflow"];

    if (persisted.workflow.intentClassification) {
      Object.assign(workflowState, {
        intentClassification: persisted.workflow.intentClassification as SessionState["workflow"]["intentClassification"],
      });
    }

    return {
      sessionId: persisted.sessionId,
      createdAt: new Date(persisted.createdAt),
      lastActivityAt: new Date(persisted.lastActivityAt),
      phase: persisted.phase,
      workflow: workflowState,
      errorCount: persisted.errorCount,
      todosCreated: persisted.todos.created,
      todoCount: persisted.todos.count,
      todosCompleted: persisted.todos.completed,
      toolHistory: persisted.toolHistory.map(t => {
        const record: SessionState["toolHistory"][number] = {
          tool: t.tool,
          timestamp: new Date(t.timestamp),
          success: t.success,
        };
        if (t.durationMs !== undefined) record.durationMs = t.durationMs;
        if (t.error !== undefined) record.error = t.error;
        return record;
      }),
      metadata: persisted.metadata,
    };
  }

  /**
   * Save session state to file.
   *
   * @param state - Session state to save
   * @returns True if save was successful
   */
  async saveState(state: SessionState): Promise<boolean> {
    if (!this.config.enabled) return false;

    await this.initialize();

    const statePath = this.getStatePath(state.sessionId);
    const tempPath = `${statePath}.tmp`;

    try {
      const persisted = this.serializeState(state);
      const content = JSON.stringify(persisted, null, 2);

      // Write to temp file first (atomic write)
      await writeFile(tempPath, content, "utf-8");

      // Rename temp file to actual file
      await rename(tempPath, statePath);

      logger.debug("Session state saved", { sessionId: state.sessionId });
      return true;
    } catch (error) {
      logger.error("Failed to save session state", {
        sessionId: state.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Clean up temp file if it exists
      try {
        await unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }

      return false;
    }
  }

  /**
   * Load session state from file.
   *
   * @param sessionId - Session identifier
   * @returns Partial session state or null if not found
   */
  async loadState(sessionId: string): Promise<Partial<SessionState> | null> {
    if (!this.config.enabled) return null;

    await this.initialize();

    const statePath = this.getStatePath(sessionId);

    try {
      const content = await readFile(statePath, "utf-8");
      const persisted = JSON.parse(content) as PersistedSessionState;

      // Validate version
      if (persisted.version !== STATE_VERSION) {
        logger.warn("State file version mismatch, attempting migration", {
          sessionId,
          fileVersion: persisted.version,
          currentVersion: STATE_VERSION,
        });
        // Future: Add migration logic here
      }

      const state = this.deserializeState(persisted);
      logger.debug("Session state loaded", { sessionId });
      return state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // File doesn't exist, that's fine
        return null;
      }

      logger.error("Failed to load session state", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Check if a state file exists for a session.
   */
  async hasState(sessionId: string): Promise<boolean> {
    const statePath = this.getStatePath(sessionId);
    try {
      await stat(statePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete state file for a session.
   */
  async deleteState(sessionId: string): Promise<boolean> {
    if (!this.config.enabled) return false;

    const statePath = this.getStatePath(sessionId);

    try {
      await unlink(statePath);
      logger.debug("Session state deleted", { sessionId });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // File didn't exist, that's fine
        return true;
      }

      logger.error("Failed to delete session state", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * List all persisted session IDs.
   */
  async listSessions(): Promise<string[]> {
    if (!this.config.enabled) return [];

    await this.initialize();

    try {
      const files = await readdir(STATE_DIR);
      return files
        .filter(f => f.endsWith(".json") && !f.endsWith(".tmp"))
        .map(f => f.replace(/\.json$/, ""));
    } catch {
      return [];
    }
  }

  /**
   * Clean up old state files to maintain the max file limit.
   */
  async cleanupOldStates(): Promise<number> {
    if (!this.config.enabled) return 0;

    await this.initialize();

    try {
      const files = await readdir(STATE_DIR);
      const stateFiles = files.filter(f => f.endsWith(".json") && !f.endsWith(".tmp"));

      if (stateFiles.length <= this.config.maxStateFiles) {
        return 0;
      }

      // Get file stats and sort by modification time
      const fileStats = await Promise.all(
        stateFiles.map(async f => {
          const path = join(STATE_DIR, f);
          const stats = await stat(path);
          return { name: f, path, mtime: stats.mtime.getTime() };
        })
      );

      fileStats.sort((a, b) => a.mtime - b.mtime);

      // Delete oldest files
      const filesToDelete = fileStats.slice(0, fileStats.length - this.config.maxStateFiles);
      let deleted = 0;

      for (const file of filesToDelete) {
        try {
          await unlink(file.path);
          deleted++;
          logger.debug("Deleted old state file", { file: file.name });
        } catch {
          // Ignore deletion errors
        }
      }

      return deleted;
    } catch (error) {
      logger.error("Failed to cleanup old states", {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Start auto-save timer for a session.
   *
   * @param sessionId - Session identifier
   * @param getState - Function to get current session state
   */
  startAutoSave(sessionId: string, getState: () => SessionState | undefined): void {
    if (!this.config.enabled || this.config.autoSaveIntervalMs <= 0) return;

    // Stop existing timer if any
    this.stopAutoSave(sessionId);

    const timer = setInterval(async () => {
      const state = getState();
      if (state) {
        await this.saveState(state);
      }
    }, this.config.autoSaveIntervalMs);

    this.autoSaveTimers.set(sessionId, timer);
    logger.debug("Auto-save started", { sessionId, intervalMs: this.config.autoSaveIntervalMs });
  }

  /**
   * Stop auto-save timer for a session.
   */
  stopAutoSave(sessionId: string): void {
    const timer = this.autoSaveTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.autoSaveTimers.delete(sessionId);
      logger.debug("Auto-save stopped", { sessionId });
    }
  }

  /**
   * Stop all auto-save timers.
   */
  stopAllAutoSave(): void {
    for (const [sessionId, timer] of this.autoSaveTimers) {
      clearInterval(timer);
      logger.debug("Auto-save stopped", { sessionId });
    }
    this.autoSaveTimers.clear();
  }

  /**
   * Get state file metadata (without loading full content).
   */
  async getStateMetadata(
    sessionId: string
  ): Promise<{ exists: boolean; savedAt?: string; size?: number } | null> {
    const statePath = this.getStatePath(sessionId);

    try {
      const stats = await stat(statePath);
      const content = await readFile(statePath, "utf-8");
      const parsed = JSON.parse(content) as PersistedSessionState;

      return {
        exists: true,
        savedAt: parsed.savedAt,
        size: stats.size,
      };
    } catch {
      return { exists: false };
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/**
 * Default state persistence instance.
 */
let defaultPersistence: StatePersistence | null = null;

/**
 * Get or create the default state persistence instance.
 */
export function getStatePersistence(config?: Partial<StatePersistenceConfig>): StatePersistence {
  if (!defaultPersistence) {
    defaultPersistence = new StatePersistence(config);
  }
  return defaultPersistence;
}

/**
 * Reset the default persistence instance (primarily for testing).
 */
export function resetStatePersistence(): void {
  if (defaultPersistence) {
    defaultPersistence.stopAllAutoSave();
  }
  defaultPersistence = null;
}
