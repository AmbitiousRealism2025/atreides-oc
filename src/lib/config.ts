import { readFile } from "node:fs/promises";
import { join } from "node:path";

// =============================================================================
// Configuration Schema
// =============================================================================

/**
 * Identity configuration for the AI persona.
 *
 * ## Configuration Path
 * ```json
 * {
 *   "atreides": {
 *     "identity": { ... }
 *   }
 * }
 * ```
 */
export interface IdentityConfig {
  /**
   * The persona name displayed in response prefixes.
   * @default "Muad'Dib"
   * @example "Muad'Dib", "Claude", "Atlas"
   */
  personaName: string;

  /**
   * Whether to prefix all AI responses with `[personaName]: `.
   * When enabled, injects rules into system prompt requiring the prefix.
   * @default true
   */
  responsePrefix: boolean;

  /**
   * Whether to announce agent delegations.
   * When enabled, outputs like "[Muad'Dib]: Delegating to Explore agent..."
   * @default true
   */
  delegationAnnouncements: boolean;

  /**
   * Custom agent display name mappings (optional).
   * Overrides default display names for specific agent IDs.
   * @example { "my-agent": "My Custom Agent" }
   */
  agentDisplayNames?: Record<string, string>;
}

/**
 * Workflow configuration for phase tracking and todo enforcement.
 *
 * ## Configuration Path
 * ```json
 * {
 *   "atreides": {
 *     "workflow": { ... }
 *   }
 * }
 * ```
 */
export interface WorkflowConfig {
  /**
   * Enable the 5-phase workflow tracking system.
   * Phases: idle → intent → assessment → exploration → implementation → verification
   * @default true
   */
  enablePhaseTracking: boolean;

  /**
   * Block session stop if there are pending todos.
   * When enabled, checkPendingTodos() must return allow:true before session ends.
   * @default true
   */
  strictTodoEnforcement: boolean;

  /**
   * Automatically escalate to Stilgar after 3 consecutive errors.
   * When enabled, sets stilgarEscalation metadata on 3rd strike.
   * @default true
   */
  autoEscalateOnError: boolean;
}

/**
 * Logging configuration for session logging and state persistence.
 *
 * ## Configuration Path
 * ```json
 * {
 *   "atreides": {
 *     "logging": { ... }
 *   }
 * }
 * ```
 */
export interface LoggingConfig {
  /**
   * Enable file-based session logging to ~/.atreides/logs/.
   * @default true
   */
  enableSessionLogging: boolean;

  /**
   * Enable state persistence to ~/.atreides/state/.
   * @default true
   */
  enableStatePersistence: boolean;

  /**
   * Maximum number of log files to keep.
   * Older files are deleted when limit is exceeded.
   * @default 50
   */
  maxLogFiles: number;

  /**
   * Maximum number of state files to keep.
   * Older files are deleted when limit is exceeded.
   * @default 100
   */
  maxStateFiles: number;

  /**
   * Maximum size per log file in bytes.
   * Files are rotated when limit is exceeded.
   * @default 10485760 (10MB)
   */
  maxLogFileSizeBytes: number;

  /**
   * Auto-save interval for state persistence in milliseconds.
   * Set to 0 to disable auto-save.
   * @default 30000 (30 seconds)
   */
  autoSaveIntervalMs: number;

  /**
   * Enable PII filtering for logs and persisted state.
   * Filters email addresses, API keys, tokens, etc.
   * @default true
   */
  enablePiiFiltering: boolean;

  /**
   * Log levels to include in session logs.
   * @default ["debug", "info", "warn", "error"]
   */
  logLevels: ("debug" | "info" | "warn" | "error")[];

  /**
   * Custom PII patterns to filter (regex strings).
   * Added to default patterns (email, API keys, etc.).
   * @default []
   */
  customPiiPatterns: string[];
}

/**
 * Think Mode configuration for model switching based on task complexity.
 *
 * ## Configuration Path
 * ```json
 * {
 *   "atreides": {
 *     "thinkMode": { ... }
 *   }
 * }
 * ```
 */
export interface ThinkModeConfig {
  enabled: boolean;
  defaultModel: string;
  thinkModel: string;
  fastModel: string;
  autoSwitch: boolean;
  complexityThreshold: number;
  trackPerformance: boolean;
}

/**
 * Notification event types that can trigger user notifications.
 */
export type NotificationEventType =
  | "session.started"
  | "session.completed"
  | "phase.transition"
  | "error.strike"
  | "error.escalation"
  | "error.recovery"
  | "security.blocked"
  | "security.warning"
  | "todo.pending"
  | "compaction.completed"
  | "custom";

/**
 * Notification configuration for session event notifications.
 *
 * ## Configuration Path
 * ```json
 * {
 *   "atreides": {
 *     "notifications": { ... }
 *   }
 * }
 * ```
 */
export interface NotificationConfig {
  /**
   * Enable session notifications globally.
   * When enabled, important events will be published via OpenCode's notify API.
   * @default true
   */
  enabled: boolean;

  /**
   * Event types to send notifications for.
   * Empty array means all events are enabled.
   * @default ["error.escalation", "session.completed", "security.blocked"]
   */
  enabledEvents: NotificationEventType[];

  /**
   * Minimum severity level to notify.
   * Events below this severity are suppressed.
   * Severity order: info < success < warning < error
   * @default "warning"
   */
  minSeverity: "info" | "warning" | "error" | "success";

  /**
   * Throttle interval in milliseconds.
   * Prevents notification spam by limiting notifications per event type.
   * Set to 0 to disable throttling.
   * @default 1000
   */
  throttleMs: number;

  /**
   * Show notification for each error strike (1-2), not just escalation (3).
   * @default false
   */
  notifyOnEveryStrike: boolean;
}

/**
 * Security configuration for command validation and file protection.
 *
 * ## Configuration Path
 * ```json
 * {
 *   "atreides": {
 *     "security": { ... }
 *   }
 * }
 * ```
 */
export interface SecurityConfig {
  /**
   * Enable multi-layer obfuscation detection for commands.
   * Detects URL encoding, hex, base64, unicode bypasses.
   * @default true
   */
  enableObfuscationDetection: boolean;

  /**
   * Additional command patterns to block (extends built-in list).
   * Patterns are matched against normalized command strings.
   * @example ["proprietary-tool --dangerous"]
   * @default []
   */
  blockedPatterns: string[];

  /**
   * Additional command patterns requiring user confirmation.
   * Matched patterns show warning but allow execution.
   * @example ["deploy", "migrate"]
   * @default []
   */
  warningPatterns: string[];

  /**
   * Additional file paths to block access to.
   * Supports glob patterns.
   * @example [".vault/*", "secrets/**"]
   * @default []
   */
  blockedFiles: string[];
}

/**
 * Complete Atreides configuration schema.
 *
 * ## opencode.json Structure
 *
 * ```json
 * {
 *   "atreides": {
 *     "identity": {
 *       "personaName": "Muad'Dib",
 *       "responsePrefix": true,
 *       "delegationAnnouncements": true,
 *       "agentDisplayNames": {}
 *     },
 *     "workflow": {
 *       "enablePhaseTracking": true,
 *       "strictTodoEnforcement": true,
 *       "autoEscalateOnError": true
 *     },
 *     "security": {
 *       "enableObfuscationDetection": true,
 *       "blockedPatterns": [],
 *       "warningPatterns": [],
 *       "blockedFiles": []
 *     },
 *     "notifications": {
 *       "enabled": true,
 *       "enabledEvents": ["error.escalation", "session.completed", "security.blocked"],
 *       "minSeverity": "warning",
 *       "throttleMs": 1000,
 *       "notifyOnEveryStrike": false
 *     }
 *   }
 * }
 * ```
 */
export interface Config {
  identity: IdentityConfig;
  workflow: WorkflowConfig;
  security: SecurityConfig;
  logging: LoggingConfig;
  thinkMode: ThinkModeConfig;
  notifications: NotificationConfig;
}

/**
 * Validation error with field path and message.
 */
export interface ConfigValidationError {
  path: string;
  message: string;
}

/**
 * Result of configuration validation.
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
}

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Default configuration values.
 * Used when config file is missing or fields are not specified.
 */
const DEFAULT_CONFIG: Config = {
  identity: {
    personaName: "Muad'Dib",
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
  logging: {
    enableSessionLogging: true,
    enableStatePersistence: true,
    maxLogFiles: 50,
    maxStateFiles: 100,
    maxLogFileSizeBytes: 10 * 1024 * 1024, // 10MB
    autoSaveIntervalMs: 30000, // 30 seconds
    enablePiiFiltering: true,
    logLevels: ["debug", "info", "warn", "error"],
    customPiiPatterns: [],
  },
  thinkMode: {
    enabled: true,
    defaultModel: "claude-sonnet-4",
    thinkModel: "claude-opus-4",
    fastModel: "claude-haiku-4-5",
    autoSwitch: false,
    complexityThreshold: 0.7,
    trackPerformance: true,
  },
  notifications: {
    enabled: true,
    enabledEvents: ["error.escalation", "session.completed", "security.blocked"],
    minSeverity: "warning",
    throttleMs: 1000,
    notifyOnEveryStrike: false,
  },
};

/**
 * Create a fresh copy of the default configuration.
 * Useful for testing and initialization.
 *
 * @returns A new Config object with default values
 */
export function createDefaultConfig(): Config {
  return {
    identity: { ...DEFAULT_CONFIG.identity },
    workflow: { ...DEFAULT_CONFIG.workflow },
    security: {
      ...DEFAULT_CONFIG.security,
      blockedPatterns: [...DEFAULT_CONFIG.security.blockedPatterns],
      warningPatterns: [...DEFAULT_CONFIG.security.warningPatterns],
      blockedFiles: [...DEFAULT_CONFIG.security.blockedFiles],
    },
    logging: {
      ...DEFAULT_CONFIG.logging,
      logLevels: [...DEFAULT_CONFIG.logging.logLevels],
      customPiiPatterns: [...DEFAULT_CONFIG.logging.customPiiPatterns],
    },
    thinkMode: { ...DEFAULT_CONFIG.thinkMode },
    notifications: {
      ...DEFAULT_CONFIG.notifications,
      enabledEvents: [...DEFAULT_CONFIG.notifications.enabledEvents],
    },
  };
}

/**
 * Validate a configuration object.
 * Checks for required fields and valid values.
 *
 * @param config - Configuration to validate
 * @returns Validation result with errors if any
 */
export function validateConfig(config: unknown): ConfigValidationResult {
  const errors: ConfigValidationError[] = [];

  if (!config || typeof config !== "object") {
    return { valid: false, errors: [{ path: "", message: "Config must be an object" }] };
  }

  const cfg = config as Partial<Config>;

  // Validate identity section
  if (cfg.identity) {
    if (typeof cfg.identity.personaName !== "undefined" && typeof cfg.identity.personaName !== "string") {
      errors.push({ path: "identity.personaName", message: "Must be a string" });
    }
    if (typeof cfg.identity.responsePrefix !== "undefined" && typeof cfg.identity.responsePrefix !== "boolean") {
      errors.push({ path: "identity.responsePrefix", message: "Must be a boolean" });
    }
    if (typeof cfg.identity.delegationAnnouncements !== "undefined" && typeof cfg.identity.delegationAnnouncements !== "boolean") {
      errors.push({ path: "identity.delegationAnnouncements", message: "Must be a boolean" });
    }
    if (cfg.identity.agentDisplayNames !== undefined && typeof cfg.identity.agentDisplayNames !== "object") {
      errors.push({ path: "identity.agentDisplayNames", message: "Must be an object" });
    }
  }

  // Validate workflow section
  if (cfg.workflow) {
    if (typeof cfg.workflow.enablePhaseTracking !== "undefined" && typeof cfg.workflow.enablePhaseTracking !== "boolean") {
      errors.push({ path: "workflow.enablePhaseTracking", message: "Must be a boolean" });
    }
    if (typeof cfg.workflow.strictTodoEnforcement !== "undefined" && typeof cfg.workflow.strictTodoEnforcement !== "boolean") {
      errors.push({ path: "workflow.strictTodoEnforcement", message: "Must be a boolean" });
    }
    if (typeof cfg.workflow.autoEscalateOnError !== "undefined" && typeof cfg.workflow.autoEscalateOnError !== "boolean") {
      errors.push({ path: "workflow.autoEscalateOnError", message: "Must be a boolean" });
    }
  }

  // Validate security section
  if (cfg.security) {
    if (typeof cfg.security.enableObfuscationDetection !== "undefined" && typeof cfg.security.enableObfuscationDetection !== "boolean") {
      errors.push({ path: "security.enableObfuscationDetection", message: "Must be a boolean" });
    }
    if (cfg.security.blockedPatterns !== undefined && !Array.isArray(cfg.security.blockedPatterns)) {
      errors.push({ path: "security.blockedPatterns", message: "Must be an array" });
    }
    if (cfg.security.warningPatterns !== undefined && !Array.isArray(cfg.security.warningPatterns)) {
      errors.push({ path: "security.warningPatterns", message: "Must be an array" });
    }
    if (cfg.security.blockedFiles !== undefined && !Array.isArray(cfg.security.blockedFiles)) {
      errors.push({ path: "security.blockedFiles", message: "Must be an array" });
    }
  }

  // Validate logging section
  if (cfg.logging) {
    if (typeof cfg.logging.enableSessionLogging !== "undefined" && typeof cfg.logging.enableSessionLogging !== "boolean") {
      errors.push({ path: "logging.enableSessionLogging", message: "Must be a boolean" });
    }
    if (typeof cfg.logging.enableStatePersistence !== "undefined" && typeof cfg.logging.enableStatePersistence !== "boolean") {
      errors.push({ path: "logging.enableStatePersistence", message: "Must be a boolean" });
    }
    if (typeof cfg.logging.maxLogFiles !== "undefined" && typeof cfg.logging.maxLogFiles !== "number") {
      errors.push({ path: "logging.maxLogFiles", message: "Must be a number" });
    }
    if (typeof cfg.logging.maxStateFiles !== "undefined" && typeof cfg.logging.maxStateFiles !== "number") {
      errors.push({ path: "logging.maxStateFiles", message: "Must be a number" });
    }
    if (typeof cfg.logging.maxLogFileSizeBytes !== "undefined" && typeof cfg.logging.maxLogFileSizeBytes !== "number") {
      errors.push({ path: "logging.maxLogFileSizeBytes", message: "Must be a number" });
    }
    if (typeof cfg.logging.autoSaveIntervalMs !== "undefined" && typeof cfg.logging.autoSaveIntervalMs !== "number") {
      errors.push({ path: "logging.autoSaveIntervalMs", message: "Must be a number" });
    }
    if (typeof cfg.logging.enablePiiFiltering !== "undefined" && typeof cfg.logging.enablePiiFiltering !== "boolean") {
      errors.push({ path: "logging.enablePiiFiltering", message: "Must be a boolean" });
    }
    if (cfg.logging.logLevels !== undefined && !Array.isArray(cfg.logging.logLevels)) {
      errors.push({ path: "logging.logLevels", message: "Must be an array" });
    }
    if (cfg.logging.customPiiPatterns !== undefined && !Array.isArray(cfg.logging.customPiiPatterns)) {
      errors.push({ path: "logging.customPiiPatterns", message: "Must be an array" });
    }
  }

  // Validate thinkMode section
  if (cfg.thinkMode) {
    if (typeof cfg.thinkMode.enabled !== "undefined" && typeof cfg.thinkMode.enabled !== "boolean") {
      errors.push({ path: "thinkMode.enabled", message: "Must be a boolean" });
    }
    if (typeof cfg.thinkMode.defaultModel !== "undefined" && typeof cfg.thinkMode.defaultModel !== "string") {
      errors.push({ path: "thinkMode.defaultModel", message: "Must be a string" });
    }
    if (typeof cfg.thinkMode.thinkModel !== "undefined" && typeof cfg.thinkMode.thinkModel !== "string") {
      errors.push({ path: "thinkMode.thinkModel", message: "Must be a string" });
    }
    if (typeof cfg.thinkMode.fastModel !== "undefined" && typeof cfg.thinkMode.fastModel !== "string") {
      errors.push({ path: "thinkMode.fastModel", message: "Must be a string" });
    }
    if (typeof cfg.thinkMode.autoSwitch !== "undefined" && typeof cfg.thinkMode.autoSwitch !== "boolean") {
      errors.push({ path: "thinkMode.autoSwitch", message: "Must be a boolean" });
    }
    if (typeof cfg.thinkMode.complexityThreshold !== "undefined" && typeof cfg.thinkMode.complexityThreshold !== "number") {
      errors.push({ path: "thinkMode.complexityThreshold", message: "Must be a number" });
    }
    if (typeof cfg.thinkMode.trackPerformance !== "undefined" && typeof cfg.thinkMode.trackPerformance !== "boolean") {
      errors.push({ path: "thinkMode.trackPerformance", message: "Must be a boolean" });
    }
  }

  // Validate notifications section
  if (cfg.notifications) {
    if (typeof cfg.notifications.enabled !== "undefined" && typeof cfg.notifications.enabled !== "boolean") {
      errors.push({ path: "notifications.enabled", message: "Must be a boolean" });
    }
    if (cfg.notifications.enabledEvents !== undefined && !Array.isArray(cfg.notifications.enabledEvents)) {
      errors.push({ path: "notifications.enabledEvents", message: "Must be an array" });
    }
    if (typeof cfg.notifications.minSeverity !== "undefined" && !["info", "warning", "error", "success"].includes(cfg.notifications.minSeverity)) {
      errors.push({ path: "notifications.minSeverity", message: "Must be one of: info, warning, error, success" });
    }
    if (typeof cfg.notifications.throttleMs !== "undefined" && typeof cfg.notifications.throttleMs !== "number") {
      errors.push({ path: "notifications.throttleMs", message: "Must be a number" });
    }
    if (typeof cfg.notifications.notifyOnEveryStrike !== "undefined" && typeof cfg.notifications.notifyOnEveryStrike !== "boolean") {
      errors.push({ path: "notifications.notifyOnEveryStrike", message: "Must be a boolean" });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Load configuration from opencode.json.
 * Merges with defaults and validates.
 *
 * @param projectPath - Path to the project directory
 * @returns Merged configuration with defaults
 * @throws Never - returns default config on error
 */
export async function loadConfig(projectPath: string): Promise<Config> {
  const configPath = join(projectPath, "opencode.json");

  try {
    const content = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(content) as { atreides?: Partial<Config> };
    const atreidesConfig = parsed.atreides ?? {};

    // Validate the config
    const validation = validateConfig(atreidesConfig);
    if (!validation.valid) {
      console.warn(`Config validation warnings in ${configPath}:`, validation.errors);
      // Continue with valid fields, use defaults for invalid ones
    }

    const securityConfig: Partial<SecurityConfig> = atreidesConfig.security ?? {};
    const loggingConfig: Partial<LoggingConfig> = atreidesConfig.logging ?? {};
    const thinkModeConfig: Partial<ThinkModeConfig> = atreidesConfig.thinkMode ?? {};
    const notificationsConfig: Partial<NotificationConfig> = atreidesConfig.notifications ?? {};
    return {
      ...DEFAULT_CONFIG,
      ...atreidesConfig,
      identity: { ...DEFAULT_CONFIG.identity, ...atreidesConfig.identity },
      workflow: { ...DEFAULT_CONFIG.workflow, ...atreidesConfig.workflow },
      security: {
        ...DEFAULT_CONFIG.security,
        ...securityConfig,
        blockedPatterns: [...(securityConfig.blockedPatterns ?? DEFAULT_CONFIG.security.blockedPatterns)],
        warningPatterns: [...(securityConfig.warningPatterns ?? DEFAULT_CONFIG.security.warningPatterns)],
        blockedFiles: [...(securityConfig.blockedFiles ?? DEFAULT_CONFIG.security.blockedFiles)],
      },
      logging: {
        ...DEFAULT_CONFIG.logging,
        ...loggingConfig,
        logLevels: [...(loggingConfig.logLevels ?? DEFAULT_CONFIG.logging.logLevels)],
        customPiiPatterns: [...(loggingConfig.customPiiPatterns ?? DEFAULT_CONFIG.logging.customPiiPatterns)],
      },
      thinkMode: { ...DEFAULT_CONFIG.thinkMode, ...thinkModeConfig },
      notifications: {
        ...DEFAULT_CONFIG.notifications,
        ...notificationsConfig,
        enabledEvents: [...(notificationsConfig.enabledEvents ?? DEFAULT_CONFIG.notifications.enabledEvents)],
      },
    };
  } catch {
    return createDefaultConfig();
  }
}

/**
 * Export the default configuration for reference.
 * Useful for testing and documentation.
 */
export { DEFAULT_CONFIG };
