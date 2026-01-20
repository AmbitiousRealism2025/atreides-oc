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
 *     }
 *   }
 * }
 * ```
 */
export interface Config {
  identity: IdentityConfig;
  workflow: WorkflowConfig;
  security: SecurityConfig;
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

    const securityConfig = atreidesConfig.security ?? {};
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
