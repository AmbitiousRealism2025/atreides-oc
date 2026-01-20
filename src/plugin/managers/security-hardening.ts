/**
 * SecurityHardening - Multi-layer command and file validation
 *
 * Implements comprehensive security validation including:
 * - 5-stage obfuscation detection pipeline
 * - 22+ blocked command patterns
 * - Warning patterns requiring user confirmation
 * - File operation guards (blocked files/paths)
 * - Log sanitization
 * - Performance optimization with caching (<15ms target)
 *
 * All patterns are compiled once at module load for performance.
 */

import { createLogger } from "../../lib/logger.js";
import type {
  CommandValidationResult,
  FileValidationResult,
  SecurityAction,
  SecurityValidationStats,
} from "../types.js";

const logger = createLogger("atreides:security-hardening");

// =============================================================================
// Blocked Command Patterns (22+ patterns)
// =============================================================================

/**
 * Blocked command patterns - commands that should NEVER be executed.
 * These represent dangerous operations that could harm the system.
 */
export const BLOCKED_COMMAND_PATTERNS: readonly RegExp[] = [
  // Destructive file operations
  /rm\s+(-[a-zA-Z]*)?r[a-zA-Z]*\s+(-[a-zA-Z]*\s+)*\/($|\s|;)/i, // rm -rf / (root deletion)
  /rm\s+(-[a-zA-Z]*)?r[a-zA-Z]*\s+(-[a-zA-Z]*\s+)*~($|\s|;)/i,  // rm -rf ~ (home deletion)
  /rm\s+(-[a-zA-Z]*)?r[a-zA-Z]*\s+(-[a-zA-Z]*\s+)*\*($|\s|;)/i, // rm -rf * (wildcard deletion)

  // Filesystem destruction
  /mkfs(\.[a-z0-9]+)?/i,                    // Format filesystem
  /dd\s+.*if=\/dev\/(zero|random|urandom)/i, // Disk wipe/overwrite
  /dd\s+.*of=\/dev\/(sd[a-z]|hd[a-z]|nvme)/i, // Direct disk write

  // Fork bomb and resource exhaustion
  /:\(\)\s*\{\s*:\|:&\s*\}\s*;?\s*:/,       // Bash fork bomb :(){ :|:& };:
  /\.\s*\|\s*\./,                            // Alternative fork bomb
  /while\s*\(\s*true\s*\).*fork/i,          // Explicit fork bomb

  // Remote code execution
  /curl\s+.*\|\s*(ba)?sh/i,                  // curl | bash
  /wget\s+.*\|\s*(ba)?sh/i,                  // wget | bash
  /curl\s+.*\|\s*python/i,                   // curl | python
  /wget\s+.*\|\s*python/i,                   // wget | python
  /curl\s+.*\>\s*.*\.sh\s*&&/i,             // curl > script.sh && (execute pattern)

  // Privilege escalation patterns
  /sudo\s+su\s*(-|$)/i,                      // sudo su -
  /sudo\s+-i($|\s)/,                         // sudo -i (root shell)
  /sudo\s+passwd\s+root/i,                   // Change root password

  // Dangerous permission changes
  /chmod\s+(-[a-zA-Z]*\s+)*777\s+\//i,       // chmod 777 / (root)
  /chmod\s+(-[a-zA-Z]*\s+)*777\s+~?\//i,    // chmod 777 ~/ or /
  /chmod\s+(-[a-zA-Z]*\s+)*(u\+s|4[0-7]{3})/i, // setuid bit
  /chown\s+(-[a-zA-Z]*\s+)*root[:\s]/i,     // chown to root

  // System file modification
  />\s*\/etc\/passwd/i,                      // Overwrite passwd
  />\s*\/etc\/shadow/i,                      // Overwrite shadow
  />\s*\/etc\/sudoers/i,                     // Overwrite sudoers

  // Network/firewall manipulation
  /iptables\s+-F/i,                          // Flush all firewall rules
  /ufw\s+disable/i,                          // Disable firewall

  // History manipulation (covering tracks)
  /history\s+-c/i,                           // Clear history
  />\s*~\/\.bash_history/i,                  // Overwrite bash history
  /export\s+HISTSIZE=0/i,                    // Disable history

  // Kernel/system manipulation
  /insmod|modprobe\s+/i,                     // Load kernel modules
  /echo\s+.*>\s*\/proc\//i,                  // Write to /proc
  /echo\s+.*>\s*\/sys\//i,                   // Write to /sys
] as const;

/**
 * Warning patterns - commands that require user confirmation.
 * These are potentially dangerous but may be legitimate.
 */
export const WARNING_COMMAND_PATTERNS: readonly RegExp[] = [
  // Elevated privileges
  /\bsudo\b/i,                               // Any sudo usage
  /\bsu\s+-?\s*$/i,                          // su without user (becomes root)
  /\bdoas\b/i,                               // OpenBSD doas

  // Permission changes
  /\bchmod\b/i,                              // Any chmod
  /\bchown\b/i,                              // Any chown
  /\bchgrp\b/i,                              // Any chgrp

  // Git dangerous operations
  /git\s+push\s+.*--force/i,                 // Force push
  /git\s+push\s+-f\b/i,                      // Force push short
  /git\s+reset\s+--hard/i,                   // Hard reset
  /git\s+clean\s+-[a-z]*f/i,                 // Force clean
  /git\s+checkout\s+--\s+\./i,              // Discard all changes

  // Package publishing
  /npm\s+publish/i,                          // npm publish
  /yarn\s+publish/i,                         // yarn publish
  /pip\s+.*upload/i,                         // pip upload
  /cargo\s+publish/i,                        // cargo publish

  // Container operations
  /docker\s+rm\s+-f/i,                       // Force remove container
  /docker\s+system\s+prune/i,               // System prune
  /kubectl\s+delete/i,                       // K8s delete

  // Database operations
  /drop\s+(database|table|schema)/i,         // SQL DROP
  /truncate\s+table/i,                       // SQL TRUNCATE
  /delete\s+from\s+\w+\s*($|where\s+1)/i,   // DELETE without proper WHERE

  // System service control
  /systemctl\s+(stop|disable|mask)/i,        // Stop/disable services
  /service\s+\w+\s+stop/i,                   // Stop service

  // Environment manipulation
  /export\s+PATH=/i,                         // PATH modification
  /\.bashrc|\.zshrc|\.profile/i,            // Shell config modification
] as const;

// =============================================================================
// Blocked File Patterns
// =============================================================================

/**
 * File patterns that should never be read/written by automated tools.
 * These typically contain secrets or sensitive configuration.
 */
export const BLOCKED_FILE_PATTERNS: readonly RegExp[] = [
  // Environment and secrets
  /\.env($|\.)/i,                            // .env, .env.local, .env.production
  /secrets?\./i,                             // secrets.json, secret.yaml
  /credentials?\./i,                         // credentials.json
  /\.secret$/i,                              // *.secret files

  // Cryptographic keys
  /\.pem$/i,                                 // PEM certificates
  /\.key$/i,                                 // Private keys
  /\.p12$/i,                                 // PKCS12 files
  /\.pfx$/i,                                 // PFX certificates
  /\.crt$/i,                                 // Certificates (may contain private keys)

  // SSH keys
  /id_rsa/i,                                 // RSA private key
  /id_dsa/i,                                 // DSA private key
  /id_ecdsa/i,                               // ECDSA private key
  /id_ed25519/i,                             // ED25519 private key
  /authorized_keys/i,                        // SSH authorized keys
  /known_hosts/i,                            // SSH known hosts

  // Package manager credentials
  /\.npmrc$/i,                               // npm credentials
  /\.pypirc$/i,                              // PyPI credentials
  /\.gem\/credentials/i,                     // RubyGems credentials
  /\.docker\/config\.json$/i,               // Docker registry credentials

  // Cloud credentials
  /kubeconfig/i,                             // Kubernetes config
  /\.kube\/config$/i,                        // Kubernetes config
  /gcloud.*credentials/i,                    // GCloud credentials
  /\.aws\/credentials$/i,                    // AWS credentials
  /\.azure\//i,                              // Azure credentials

  // Database credentials
  /\.pgpass$/i,                              // PostgreSQL password file
  /\.my\.cnf$/i,                             // MySQL config with password
  /\.netrc$/i,                               // Network credentials

  // Browser/app credentials
  /\.password/i,                             // Generic password files
  /master\.key$/i,                           // Rails master key
  /encryption\.key$/i,                       // Generic encryption key
] as const;

/**
 * Path patterns that should never be accessed.
 * These are system paths containing sensitive data.
 */
export const BLOCKED_PATH_PATTERNS: readonly RegExp[] = [
  // SSH directory
  /^\.?ssh\//i,
  /^~\/\.ssh\//i,
  /^\/.*\/\.ssh\//i,

  // Cloud config directories
  /^\.?aws\//i,
  /^~\/\.aws\//i,
  /^\.?kube\//i,
  /^~\/\.kube\//i,
  /^\.?gcloud\//i,
  /^~\/\.gcloud\//i,
  /^\.?azure\//i,
  /^~\/\.azure\//i,

  // System files (Unix)
  /^\/etc\/passwd$/i,
  /^\/etc\/shadow$/i,
  /^\/etc\/sudoers/i,
  /^\/etc\/ssh\//i,

  // GPG/PGP keys
  /^\.?gnupg\//i,
  /^~\/\.gnupg\//i,

  // Browser data
  /^\.?mozilla\/firefox.*logins/i,
  /^\.?config\/google-chrome.*Login/i,
] as const;

// =============================================================================
// Obfuscation Detection Pipeline (5 stages)
// =============================================================================

/**
 * Stage 1: URL decode
 * Detects and decodes URL-encoded characters (e.g., %20 -> space)
 */
export function urlDecode(input: string): string {
  try {
    // Handle multiple levels of encoding
    let decoded = input;
    let previous = "";
    let iterations = 0;
    const maxIterations = 3; // Prevent infinite loops

    while (decoded !== previous && iterations < maxIterations) {
      previous = decoded;
      decoded = decodeURIComponent(decoded);
      iterations++;
    }

    return decoded;
  } catch {
    // If decoding fails, return original (may have invalid sequences)
    return input;
  }
}

/**
 * Stage 2: Hex decode
 * Detects and decodes hex-encoded characters (e.g., \x72\x6d -> rm)
 */
export function hexDecode(input: string): string {
  return input.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => {
    const charCode = parseInt(hex, 16);
    return String.fromCharCode(charCode);
  });
}

/**
 * Stage 3: Octal decode
 * Detects and decodes octal-encoded characters (e.g., \162\155 -> rm)
 */
export function octalDecode(input: string): string {
  return input.replace(/\\([0-7]{1,3})/g, (_, octal) => {
    const charCode = parseInt(octal, 8);
    // Only convert valid ASCII range
    if (charCode <= 127) {
      return String.fromCharCode(charCode);
    }
    return _;
  });
}

/**
 * Stage 4: Quote stripping
 * Removes quotes used to break up commands (e.g., r'm' -> rm)
 */
export function stripQuotes(input: string): string {
  let result = input;

  // Remove quotes around words that don't need them first
  // This handles 'rm', "rm", '-rf', etc.
  result = result.replace(/(['"])([a-zA-Z0-9_\-./]+)\1/g, "$2");

  // Remove single quotes around single characters: 'c' -> c
  result = result.replace(/(['"])(.)\1/g, "$2");

  // Remove empty quotes: '' or ""
  result = result.replace(/''/g, "");
  result = result.replace(/""/g, "");

  return result;
}

/**
 * Stage 5: Backslash continuation removal
 * Removes line continuations used to obfuscate (e.g., r\nm -> rm)
 */
export function stripBackslashes(input: string): string {
  // Remove backslash-newline continuations
  let result = input.replace(/\\\n/g, "");

  // Remove backslash before regular characters (obfuscation technique)
  // e.g., r\m -> rm, \-rf -> -rf
  // This handles letters and the dash character used in flags
  result = result.replace(/\\([a-zA-Z\-])/g, "$1");

  return result;
}

/**
 * Additional normalization: Unicode homoglyphs
 * Detects Unicode characters that look like ASCII but aren't
 */
export function normalizeUnicode(input: string): string {
  // Common Unicode homoglyphs used in obfuscation
  const homoglyphs: Record<string, string> = {
    "\u0430": "a", // Cyrillic
    "\u0435": "e",
    "\u043E": "o",
    "\u0440": "p",
    "\u0441": "c",
    "\u0445": "x",
    "\u0443": "y",
    "\u0456": "i",
    "\u0458": "j",
    "\u0455": "s",
    "\u04BB": "h",
    "\u0501": "d",
    "\u051B": "q",
  };

  let result = input;
  for (const [unicode, ascii] of Object.entries(homoglyphs)) {
    result = result.replace(new RegExp(unicode, "g"), ascii);
  }

  return result;
}

/**
 * Full normalization pipeline.
 * Applies all 5 stages of obfuscation detection.
 */
export function normalizeCommand(command: string): string {
  let normalized = command;

  // Stage 1: URL decode
  normalized = urlDecode(normalized);

  // Stage 2: Hex decode
  normalized = hexDecode(normalized);

  // Stage 3: Octal decode
  normalized = octalDecode(normalized);

  // Stage 4: Quote stripping
  normalized = stripQuotes(normalized);

  // Stage 5: Backslash removal
  normalized = stripBackslashes(normalized);

  // Additional: Unicode normalization
  normalized = normalizeUnicode(normalized);

  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized;
}

/**
 * Check if command was obfuscated (differs after normalization).
 */
export function wasObfuscated(original: string, normalized: string): boolean {
  // Remove whitespace differences for comparison
  const cleanOriginal = original.replace(/\s+/g, " ").trim();
  return cleanOriginal !== normalized;
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validate a command against security patterns.
 * Applies the 5-stage obfuscation detection pipeline before checking patterns.
 *
 * @param command - The command to validate
 * @returns CommandValidationResult with action and reason
 */
export function validateCommand(command: string): CommandValidationResult {
  const startTime = performance.now();

  try {
    // Normalize the command through the obfuscation pipeline
    const normalized = normalizeCommand(command);
    const obfuscated = wasObfuscated(command, normalized);

    if (obfuscated) {
      logger.warn("Potential obfuscation detected in command", {
        original: command.substring(0, 100),
        normalized: normalized.substring(0, 100),
      });
    }

    // Check blocked patterns first (highest priority)
    for (const pattern of BLOCKED_COMMAND_PATTERNS) {
      if (pattern.test(normalized)) {
        const result: CommandValidationResult = {
          action: "deny",
          reason: "Command matches blocked security pattern",
          matchedPattern: pattern.source,
          normalizedCommand: normalized,
        };

        logValidation("command", "deny", command, performance.now() - startTime);
        return result;
      }
    }

    // Check warning patterns (require user confirmation)
    for (const pattern of WARNING_COMMAND_PATTERNS) {
      if (pattern.test(normalized)) {
        const result: CommandValidationResult = {
          action: "ask",
          reason: "Command requires user confirmation",
          matchedPattern: pattern.source,
          normalizedCommand: normalized,
        };

        logValidation("command", "ask", command, performance.now() - startTime);
        return result;
      }
    }

    // Command is safe
    const result: CommandValidationResult = {
      action: "allow",
      normalizedCommand: normalized,
    };

    logValidation("command", "allow", command, performance.now() - startTime);
    return result;

  } catch (error) {
    logger.error("Error during command validation", {
      error: error instanceof Error ? error.message : String(error),
      command: command.substring(0, 100),
    });

    // Fail closed - deny on error
    return {
      action: "deny",
      reason: "Validation error - command denied for safety",
    };
  }
}

/**
 * Validate a file path against security patterns.
 * Performs path normalization and traversal detection before pattern matching.
 *
 * ## Path Traversal Protection
 *
 * This function applies a multi-layer defense against path traversal:
 * 1. **URL decoding**: Catches `%2e%2e%2f` encoded traversals
 * 2. **Separator normalization**: Handles backslash and duplicate slashes
 * 3. **Traversal sequence detection**: Blocks `../`, `..\\`, and encoded variants
 * 4. **Path resolution**: Resolves to absolute path for comparison
 * 5. **Pattern matching**: Checks against blocked file and path patterns
 *
 * @param filePath - The file path to validate
 * @returns FileValidationResult with action and reason
 */
export function validateFilePath(filePath: string): FileValidationResult {
  const startTime = performance.now();

  try {
    // Step 1: URL decode to catch encoded traversals (%2e%2e%2f = ../)
    let normalized = urlDecode(filePath);

    // Step 2: Normalize separators
    normalized = normalized
      .replace(/\\/g, "/")           // Normalize backslashes to forward slashes
      .replace(/\/+/g, "/")          // Remove duplicate slashes
      .replace(/['"]/g, "");         // Remove quotes

    // Step 3: Check for path traversal sequences BEFORE resolving
    // This catches attempts to escape the current directory
    const traversalPatterns = [
      /\.\.\//,                       // ../
      /\.\.\\/,                       // ..\
      /\.\.$/,                        // ends with ..
      /^\.\.$/,                       // just ..
      /%2e%2e/i,                      // URL-encoded ..
      /\.\.\%2f/i,                    // Mixed encoding
      /\%2e\%2e/i,                    // Full URL encoding
    ];

    for (const traversal of traversalPatterns) {
      if (traversal.test(normalized) || traversal.test(filePath)) {
        const result: FileValidationResult = {
          action: "deny",
          reason: "Path traversal attempt detected",
          matchedPattern: traversal.source,
        };

        logger.warn("Path traversal blocked", {
          filePath: filePath.substring(0, 100),
          pattern: traversal.source,
        });
        stats.filesBlocked++;
        logValidation("file", "deny", filePath, performance.now() - startTime);
        return result;
      }
    }

    // Step 4: Remove single-dot segments (/./)
    normalized = normalized.replace(/\/\.\//g, "/");

    // Step 5: Check blocked file patterns
    for (const pattern of BLOCKED_FILE_PATTERNS) {
      if (pattern.test(normalized) || pattern.test(filePath)) {
        const result: FileValidationResult = {
          action: "deny",
          reason: "File matches blocked security pattern",
          matchedPattern: pattern.source,
        };

        logValidation("file", "deny", filePath, performance.now() - startTime);
        return result;
      }
    }

    // Step 6: Check blocked path patterns
    for (const pattern of BLOCKED_PATH_PATTERNS) {
      if (pattern.test(normalized) || pattern.test(filePath)) {
        const result: FileValidationResult = {
          action: "deny",
          reason: "Path matches blocked security pattern",
          matchedPattern: pattern.source,
        };

        logValidation("file", "deny", filePath, performance.now() - startTime);
        return result;
      }
    }

    // File path is safe
    const result: FileValidationResult = {
      action: "allow",
    };

    logValidation("file", "allow", filePath, performance.now() - startTime);
    return result;

  } catch (error) {
    logger.error("Error during file path validation", {
      error: error instanceof Error ? error.message : String(error),
      filePath: filePath.substring(0, 100),
    });

    // Fail closed
    return {
      action: "deny",
      reason: "Validation error - file access denied for safety",
    };
  }
}

/**
 * Validate tool input based on tool type.
 * Routes to appropriate validation function.
 *
 * @param tool - The tool name
 * @param input - The tool input
 * @returns CommandValidationResult or FileValidationResult
 */
export function validateToolInput(
  tool: string,
  input: unknown
): CommandValidationResult | FileValidationResult {
  const toolLower = tool.toLowerCase();

  // Command execution tools
  if (toolLower === "bash" || toolLower === "shell" || toolLower === "exec") {
    const command = extractCommand(input);
    if (command) {
      return validateCommand(command);
    }
  }

  // File operation tools
  if (
    toolLower === "read" ||
    toolLower === "write" ||
    toolLower === "edit" ||
    toolLower === "glob" ||
    toolLower === "grep"
  ) {
    const filePath = extractFilePath(input);
    if (filePath) {
      return validateFilePath(filePath);
    }
  }

  // Default: allow
  return { action: "allow" };
}

// =============================================================================
// Log Sanitization
// =============================================================================

/**
 * Sanitize log output to prevent log injection and excessive output.
 *
 * @param output - The output to sanitize
 * @param maxLength - Maximum length (default 500)
 * @returns Sanitized output string
 */
export function sanitizeLogOutput(output: string, maxLength = 500): string {
  // Remove ANSI escape sequences first (before control character removal)
  // eslint-disable-next-line no-control-regex
  let sanitized = output.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");

  // Remove control characters (except newline \x0A, tab \x09)
  // eslint-disable-next-line no-control-regex
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + "... (truncated)";
  }

  return sanitized;
}

/**
 * Sanitize command for logging (mask sensitive data).
 *
 * @param command - Command to sanitize
 * @returns Sanitized command safe for logging
 */
export function sanitizeCommandForLogging(command: string): string {
  let sanitized = command;

  // Mask potential passwords in URLs
  sanitized = sanitized.replace(
    /(:\/\/[^:]+:)[^@]+(@)/g,
    "$1***$2"
  );

  // Mask environment variable assignments that look like secrets
  sanitized = sanitized.replace(
    /((?:PASSWORD|SECRET|KEY|TOKEN|API_KEY|AUTH)[=:])[^\s]+/gi,
    "$1***"
  );

  // Mask base64-encoded strings that might be credentials
  sanitized = sanitized.replace(
    /[A-Za-z0-9+/]{40,}={0,2}/g,
    "[BASE64_REDACTED]"
  );

  return sanitizeLogOutput(sanitized, 200);
}

// =============================================================================
// Performance Optimization - Caching
// =============================================================================

/**
 * LRU Cache for normalized commands.
 * Prevents re-processing the same commands repeatedly.
 */
class LRUCache<K, V> {
  private cache: Map<K, V>;
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// Cache for command validation results (max 100 entries)
const commandValidationCache = new LRUCache<string, CommandValidationResult>(100);

// Cache for file validation results (max 100 entries)
const fileValidationCache = new LRUCache<string, FileValidationResult>(100);

/**
 * Validate command with caching for performance.
 *
 * @param command - Command to validate
 * @returns Cached or fresh CommandValidationResult
 */
export function validateCommandCached(command: string): CommandValidationResult {
  const cached = commandValidationCache.get(command);
  if (cached) {
    return cached;
  }

  const result = validateCommand(command);
  commandValidationCache.set(command, result);
  return result;
}

/**
 * Validate file path with caching for performance.
 *
 * @param filePath - File path to validate
 * @returns Cached or fresh FileValidationResult
 */
export function validateFilePathCached(filePath: string): FileValidationResult {
  const cached = fileValidationCache.get(filePath);
  if (cached) {
    return cached;
  }

  const result = validateFilePath(filePath);
  fileValidationCache.set(filePath, result);
  return result;
}

/**
 * Clear all validation caches.
 * Useful for testing or when patterns change.
 */
export function clearValidationCaches(): void {
  commandValidationCache.clear();
  fileValidationCache.clear();
}

// =============================================================================
// Statistics and Monitoring
// =============================================================================

// Validation statistics
const stats: SecurityValidationStats = {
  commandsValidated: 0,
  commandsBlocked: 0,
  commandsWarned: 0,
  filesBlocked: 0,
  obfuscationDetected: 0,
  avgValidationTimeMs: 0,
};

let totalValidationTimeMs = 0;
let totalValidations = 0;

/**
 * Log validation event and update statistics.
 */
function logValidation(
  type: "command" | "file",
  action: SecurityAction,
  input: string,
  durationMs: number
): void {
  // Update timing stats
  totalValidationTimeMs += durationMs;
  totalValidations++;
  stats.avgValidationTimeMs = totalValidationTimeMs / totalValidations;

  if (type === "command") {
    stats.commandsValidated++;
    if (action === "deny") {
      stats.commandsBlocked++;
    } else if (action === "ask") {
      stats.commandsWarned++;
    }
  } else {
    if (action === "deny") {
      stats.filesBlocked++;
    }
  }

  logger.debug(`Security validation: ${type} ${action}`, {
    input: sanitizeCommandForLogging(input),
    durationMs: durationMs.toFixed(2),
  });
}

/**
 * Get current validation statistics.
 *
 * @returns Copy of current SecurityValidationStats
 */
export function getValidationStats(): SecurityValidationStats {
  return { ...stats };
}

/**
 * Reset validation statistics.
 * Useful for testing.
 */
export function resetValidationStats(): void {
  stats.commandsValidated = 0;
  stats.commandsBlocked = 0;
  stats.commandsWarned = 0;
  stats.filesBlocked = 0;
  stats.obfuscationDetected = 0;
  stats.avgValidationTimeMs = 0;
  totalValidationTimeMs = 0;
  totalValidations = 0;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract command string from tool input.
 */
function extractCommand(input: unknown): string | undefined {
  if (typeof input === "string") {
    return input;
  }

  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    if (typeof obj["command"] === "string") {
      return obj["command"];
    }
    if (typeof obj["cmd"] === "string") {
      return obj["cmd"];
    }
    if (typeof obj["script"] === "string") {
      return obj["script"];
    }
  }

  return undefined;
}

/**
 * Extract file path from tool input.
 *
 * ## Supported Tool Input Fields
 *
 * This function extracts file paths from various tool schemas:
 *
 * | Tool      | Field(s)                              |
 * |-----------|---------------------------------------|
 * | Read      | `file_path`                           |
 * | Write     | `file_path`                           |
 * | Edit      | `file_path`                           |
 * | MultiEdit | `file_path`                           |
 * | Glob      | `pattern`, `path` (directory)         |
 * | Grep      | `path` (file or directory)            |
 * | NotebookEdit | `notebook_path`                    |
 *
 * Also supports camelCase variants for compatibility.
 *
 * @param input - Tool input (string or object)
 * @returns Extracted file path or undefined
 */
function extractFilePath(input: unknown): string | undefined {
  if (typeof input === "string") {
    return input;
  }

  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;

    // Standard file path fields (Read, Write, Edit, MultiEdit)
    if (typeof obj["file_path"] === "string") {
      return obj["file_path"];
    }
    // CamelCase variant
    if (typeof obj["filePath"] === "string") {
      return obj["filePath"];
    }
    // Notebook-specific field (NotebookEdit)
    if (typeof obj["notebook_path"] === "string") {
      return obj["notebook_path"];
    }
    // CamelCase variant
    if (typeof obj["notebookPath"] === "string") {
      return obj["notebookPath"];
    }
    // Generic path field (Grep directory, Glob base path)
    if (typeof obj["path"] === "string") {
      return obj["path"];
    }
    // Glob pattern (may contain directory paths)
    if (typeof obj["pattern"] === "string") {
      return obj["pattern"];
    }
    // Source and destination paths (for copy/move operations)
    if (typeof obj["source"] === "string") {
      return obj["source"];
    }
    if (typeof obj["destination"] === "string") {
      return obj["destination"];
    }
    if (typeof obj["src"] === "string") {
      return obj["src"];
    }
    if (typeof obj["dest"] === "string") {
      return obj["dest"];
    }
    // URL field (for WebFetch - check if it's a file:// URL)
    if (typeof obj["url"] === "string" && obj["url"].startsWith("file://")) {
      return obj["url"].replace("file://", "");
    }
  }

  return undefined;
}

/**
 * Check if a command is blocked (convenience function).
 *
 * @param command - Command to check
 * @returns true if command is blocked
 */
export function isBlocked(command: string): boolean {
  return validateCommand(command).action === "deny";
}

/**
 * Check if a command requires user confirmation.
 *
 * @param command - Command to check
 * @returns true if command requires confirmation
 */
export function requiresConfirmation(command: string): boolean {
  return validateCommand(command).action === "ask";
}

/**
 * Check if a file path is blocked.
 *
 * @param filePath - File path to check
 * @returns true if file is blocked
 */
export function isFileBlocked(filePath: string): boolean {
  return validateFilePath(filePath).action === "deny";
}
