/**
 * Session Logger - File-based structured logging for Atreides sessions
 *
 * Implements persistent logging to ~/.atreides/logs/{session-id}.log with:
 * - Structured JSON logging format (one JSON object per line - JSONL)
 * - Log rotation policy (max sessions, max file size)
 * - PII filtering for privacy controls
 * - Automatic directory creation
 *
 * Log files are stored at: ~/.atreides/logs/{session-id}.log
 * Each line is a JSON object with timestamp, level, event, and data fields.
 */

import { mkdir, appendFile, readdir, stat, unlink, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createLogger } from "./logger.js";

const consoleLogger = createLogger("atreides:session-logger");

// =============================================================================
// Types
// =============================================================================

/**
 * Log levels for session logging.
 */
export type SessionLogLevel = "debug" | "info" | "warn" | "error";

/**
 * Event types that can be logged.
 */
export type SessionLogEvent =
  | "session.created"
  | "session.deleted"
  | "session.activity"
  | "phase.transition"
  | "tool.before"
  | "tool.after"
  | "tool.error"
  | "error.strike"
  | "error.escalation"
  | "error.recovery"
  | "todo.created"
  | "todo.completed"
  | "todo.pending"
  | "security.blocked"
  | "security.warned"
  | "compaction.started"
  | "compaction.completed"
  | "state.saved"
  | "state.restored"
  | "custom";

/**
 * Structure of a log entry.
 */
export interface SessionLogEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Log level */
  level: SessionLogLevel;
  /** Session identifier */
  sessionId: string;
  /** Event type */
  event: SessionLogEvent;
  /** Event-specific data (PII filtered) */
  data?: Record<string, unknown>;
  /** Duration in milliseconds (for timed events) */
  durationMs?: number;
}

/**
 * Configuration for session logging.
 */
export interface SessionLoggerConfig {
  /** Enable file-based session logging */
  enabled: boolean;
  /** Maximum number of log files to keep (default: 50) */
  maxLogFiles: number;
  /** Maximum size per log file in bytes (default: 10MB) */
  maxFileSizeBytes: number;
  /** Enable PII filtering (default: true) */
  enablePiiFiltering: boolean;
  /** Custom PII patterns to filter (in addition to defaults) */
  customPiiPatterns: string[];
  /** Log levels to include (default: all) */
  logLevels: SessionLogLevel[];
}

/**
 * Default logging configuration.
 */
export const DEFAULT_LOGGER_CONFIG: SessionLoggerConfig = {
  enabled: true,
  maxLogFiles: 50,
  maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
  enablePiiFiltering: true,
  customPiiPatterns: [],
  logLevels: ["debug", "info", "warn", "error"],
};

// =============================================================================
// PII Filtering
// =============================================================================

/**
 * Default PII patterns to filter from logs.
 * These patterns match common sensitive data formats.
 */
const DEFAULT_PII_PATTERNS: RegExp[] = [
  // Email addresses
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  // API keys (common formats: sk_, pk_, api_, key_, secret_, token_)
  /\b(sk_|pk_|api_|key_|secret_|token_|bearer_|auth_)[a-zA-Z0-9_-]{20,}\b/gi,
  // Credit card numbers (basic pattern)
  /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
  // SSN (US Social Security Numbers)
  /\b\d{3}-\d{2}-\d{4}\b/g,
  // Phone numbers (various formats)
  /\b(\+\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}\b/g,
  // IP addresses (IPv4)
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
  // JWT tokens
  /\beyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g,
  // AWS access keys
  /\b(AKIA|ABIA|ACCA|AGPA|AIDA|AIPA|ANPA|ANVA|AROA|ASCA|ASIA)[A-Z0-9]{16}\b/g,
  // AWS secret keys
  /\b[A-Za-z0-9/+=]{40}\b/g,
  // GitHub tokens
  /\b(ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9_]{36,}\b/g,
  // Private keys
  /-----BEGIN (RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
  // Passwords in common formats (password=, pwd=, passwd=)
  /\b(password|passwd|pwd|secret|token|api_key|apikey)\s*[:=]\s*['"]?[^\s'"]+['"]?/gi,
  // Home directory paths (replace with ~)
  new RegExp(homedir().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
];

/**
 * Redaction placeholder for filtered PII.
 */
const PII_REDACTED = "[REDACTED]";
const HOME_REDACTED = "~";

/**
 * Filter PII from a string value.
 *
 * @param value - String to filter
 * @param customPatterns - Additional patterns to filter
 * @returns Filtered string with PII redacted
 */
export function filterPii(value: string, customPatterns: RegExp[] = []): string {
  let filtered = value;

  // Apply home directory replacement first (use ~ instead of [REDACTED])
  const homePattern = new RegExp(homedir().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  filtered = filtered.replace(homePattern, HOME_REDACTED);

  // Apply default patterns
  for (const pattern of DEFAULT_PII_PATTERNS) {
    // Skip home directory pattern as we already handled it
    if (pattern.source.includes(homedir().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))) {
      continue;
    }
    filtered = filtered.replace(pattern, PII_REDACTED);
  }

  // Apply custom patterns
  for (const pattern of customPatterns) {
    filtered = filtered.replace(pattern, PII_REDACTED);
  }

  return filtered;
}

/**
 * Recursively filter PII from an object's string values.
 *
 * @param obj - Object to filter
 * @param customPatterns - Additional patterns to filter
 * @returns New object with PII filtered
 */
export function filterPiiFromObject(
  obj: Record<string, unknown>,
  customPatterns: RegExp[] = []
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip keys that are known to be sensitive
    const sensitiveKeys = ["password", "secret", "token", "apiKey", "api_key", "credential", "auth"];
    if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
      filtered[key] = PII_REDACTED;
      continue;
    }

    if (typeof value === "string") {
      filtered[key] = filterPii(value, customPatterns);
    } else if (Array.isArray(value)) {
      filtered[key] = value.map(item => {
        if (typeof item === "string") {
          return filterPii(item, customPatterns);
        } else if (item && typeof item === "object") {
          return filterPiiFromObject(item as Record<string, unknown>, customPatterns);
        }
        return item;
      });
    } else if (value && typeof value === "object") {
      filtered[key] = filterPiiFromObject(value as Record<string, unknown>, customPatterns);
    } else {
      filtered[key] = value;
    }
  }

  return filtered;
}

// =============================================================================
// Session Logger Class
// =============================================================================

/**
 * Base directory for Atreides logs.
 */
const LOGS_DIR = join(homedir(), ".atreides", "logs");

/**
 * Session Logger for file-based structured logging.
 */
export class SessionLogger {
  private config: SessionLoggerConfig;
  private customPiiPatterns: RegExp[];
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: Partial<SessionLoggerConfig> = {}) {
    this.config = { ...DEFAULT_LOGGER_CONFIG, ...config };
    this.customPiiPatterns = this.config.customPiiPatterns.map(p => new RegExp(p, "g"));
  }

  /**
   * Initialize the logger (create directories if needed).
   * Safe to call multiple times - will only initialize once.
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
      await mkdir(LOGS_DIR, { recursive: true });
      consoleLogger.debug("Session logs directory initialized", { path: LOGS_DIR });
    } catch (error) {
      consoleLogger.error("Failed to create logs directory", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get the log file path for a session.
   */
  getLogPath(sessionId: string): string {
    return join(LOGS_DIR, `${sessionId}.log`);
  }

  /**
   * Log an event to the session log file.
   *
   * @param sessionId - Session identifier
   * @param level - Log level
   * @param event - Event type
   * @param data - Optional event data
   * @param durationMs - Optional duration in milliseconds
   */
  async log(
    sessionId: string,
    level: SessionLogLevel,
    event: SessionLogEvent,
    data?: Record<string, unknown>,
    durationMs?: number
  ): Promise<void> {
    if (!this.config.enabled) return;
    if (!this.config.logLevels.includes(level)) return;

    await this.initialize();

    const entry: SessionLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      sessionId,
      event,
      ...(data && { data: this.config.enablePiiFiltering ? filterPiiFromObject(data, this.customPiiPatterns) : data }),
      ...(durationMs !== undefined && { durationMs }),
    };

    const logPath = this.getLogPath(sessionId);
    const line = JSON.stringify(entry) + "\n";

    try {
      // Check file size before writing
      try {
        const stats = await stat(logPath);
        if (stats.size >= this.config.maxFileSizeBytes) {
          // File is too large, rotate it
          await this.rotateLogFile(sessionId);
        }
      } catch {
        // File doesn't exist yet, that's fine
      }

      await appendFile(logPath, line, "utf-8");
    } catch (error) {
      consoleLogger.error("Failed to write session log", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Rotate a log file when it exceeds max size.
   * Renames the file with a timestamp suffix.
   */
  private async rotateLogFile(sessionId: string): Promise<void> {
    const logPath = this.getLogPath(sessionId);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rotatedPath = join(LOGS_DIR, `${sessionId}.${timestamp}.log`);

    try {
      const { rename } = await import("node:fs/promises");
      await rename(logPath, rotatedPath);
      consoleLogger.debug("Rotated log file", { sessionId, rotatedPath });
    } catch (error) {
      consoleLogger.error("Failed to rotate log file", {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Clean up old log files to maintain the max file limit.
   * Deletes the oldest files when limit is exceeded.
   */
  async cleanupOldLogs(): Promise<number> {
    if (!this.config.enabled) return 0;

    await this.initialize();

    try {
      const files = await readdir(LOGS_DIR);
      const logFiles = files.filter(f => f.endsWith(".log"));

      if (logFiles.length <= this.config.maxLogFiles) {
        return 0;
      }

      // Get file stats and sort by modification time
      const fileStats = await Promise.all(
        logFiles.map(async f => {
          const path = join(LOGS_DIR, f);
          const stats = await stat(path);
          return { name: f, path, mtime: stats.mtime.getTime() };
        })
      );

      fileStats.sort((a, b) => a.mtime - b.mtime);

      // Delete oldest files
      const filesToDelete = fileStats.slice(0, fileStats.length - this.config.maxLogFiles);
      let deleted = 0;

      for (const file of filesToDelete) {
        try {
          await unlink(file.path);
          deleted++;
          consoleLogger.debug("Deleted old log file", { file: file.name });
        } catch {
          // Ignore deletion errors
        }
      }

      return deleted;
    } catch (error) {
      consoleLogger.error("Failed to cleanup old logs", {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Read log entries for a session.
   *
   * @param sessionId - Session identifier
   * @param options - Read options
   * @returns Array of log entries
   */
  async readLogs(
    sessionId: string,
    options: { limit?: number; offset?: number; level?: SessionLogLevel } = {}
  ): Promise<SessionLogEntry[]> {
    const logPath = this.getLogPath(sessionId);

    try {
      const content = await readFile(logPath, "utf-8");
      const lines = content.trim().split("\n");
      let entries = lines.map(line => JSON.parse(line) as SessionLogEntry);

      // Filter by level if specified
      if (options.level) {
        entries = entries.filter(e => e.level === options.level);
      }

      // Apply offset and limit
      const offset = options.offset ?? 0;
      const limit = options.limit ?? entries.length;
      entries = entries.slice(offset, offset + limit);

      return entries;
    } catch {
      return [];
    }
  }

  // =========================================================================
  // Convenience Methods
  // =========================================================================

  async debug(sessionId: string, event: SessionLogEvent, data?: Record<string, unknown>): Promise<void> {
    return this.log(sessionId, "debug", event, data);
  }

  async info(sessionId: string, event: SessionLogEvent, data?: Record<string, unknown>): Promise<void> {
    return this.log(sessionId, "info", event, data);
  }

  async warn(sessionId: string, event: SessionLogEvent, data?: Record<string, unknown>): Promise<void> {
    return this.log(sessionId, "warn", event, data);
  }

  async error(sessionId: string, event: SessionLogEvent, data?: Record<string, unknown>): Promise<void> {
    return this.log(sessionId, "error", event, data);
  }

  // =========================================================================
  // Event-Specific Logging Methods
  // =========================================================================

  /**
   * Log a session created event.
   */
  async logSessionCreated(sessionId: string, data?: Record<string, unknown>): Promise<void> {
    return this.info(sessionId, "session.created", data);
  }

  /**
   * Log a session deleted event.
   */
  async logSessionDeleted(sessionId: string, data?: Record<string, unknown>): Promise<void> {
    return this.info(sessionId, "session.deleted", data);
  }

  /**
   * Log a phase transition event.
   */
  async logPhaseTransition(
    sessionId: string,
    from: string,
    to: string,
    triggeredBy?: string,
    reason?: string
  ): Promise<void> {
    return this.info(sessionId, "phase.transition", {
      from,
      to,
      triggeredBy,
      reason,
    });
  }

  /**
   * Log a tool execution (before).
   */
  async logToolBefore(sessionId: string, tool: string, input?: unknown): Promise<void> {
    return this.debug(sessionId, "tool.before", {
      tool,
      // Only log a summary of input, not full content
      inputSummary: typeof input === "object" && input !== null
        ? Object.keys(input as object).join(", ")
        : typeof input,
    });
  }

  /**
   * Log a tool execution (after).
   */
  async logToolAfter(
    sessionId: string,
    tool: string,
    success: boolean,
    durationMs?: number,
    error?: string
  ): Promise<void> {
    return this.log(
      sessionId,
      success ? "debug" : "warn",
      success ? "tool.after" : "tool.error",
      { tool, success, error },
      durationMs
    );
  }

  /**
   * Log an error strike event.
   */
  async logErrorStrike(sessionId: string, strikeCount: number, tool: string, error: string): Promise<void> {
    return this.warn(sessionId, "error.strike", { strikeCount, tool, error });
  }

  /**
   * Log an error escalation event.
   */
  async logErrorEscalation(sessionId: string, strikeCount: number, tool: string): Promise<void> {
    return this.error(sessionId, "error.escalation", { strikeCount, tool });
  }

  /**
   * Log a security blocked event.
   */
  async logSecurityBlocked(sessionId: string, tool: string, reason: string, pattern?: string): Promise<void> {
    return this.warn(sessionId, "security.blocked", { tool, reason, pattern });
  }

  /**
   * Log state saved event.
   */
  async logStateSaved(sessionId: string): Promise<void> {
    return this.debug(sessionId, "state.saved", {});
  }

  /**
   * Log state restored event.
   */
  async logStateRestored(sessionId: string): Promise<void> {
    return this.info(sessionId, "state.restored", {});
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/**
 * Default session logger instance.
 * Use this for most logging operations.
 */
let defaultLogger: SessionLogger | null = null;

/**
 * Get or create the default session logger instance.
 */
export function getSessionLogger(config?: Partial<SessionLoggerConfig>): SessionLogger {
  if (!defaultLogger) {
    defaultLogger = new SessionLogger(config);
  }
  return defaultLogger;
}

/**
 * Reset the default logger instance (primarily for testing).
 */
export function resetSessionLogger(): void {
  defaultLogger = null;
}
