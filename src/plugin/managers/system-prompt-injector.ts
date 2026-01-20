/**
 * System Prompt Injector for Atreides OpenCode
 *
 * Reads AGENTS.md from the file system and injects orchestration rules
 * into the system prompt via the `experimental.chat.system.transform` hook.
 * This is the core mechanism for providing AI with orchestration guidance.
 *
 * ## Hierarchical AGENTS.md Resolution
 *
 * The injector searches for AGENTS.md in the following order:
 * 1. Current working directory (project root)
 * 2. Parent directories (up to filesystem root)
 * 3. Default rules (if no file found)
 *
 * This allows scoped orchestration rules for monorepo subdirectories while
 * falling back to project-level rules for nested contexts.
 *
 * ## Identity Integration
 *
 * Identity formatting is applied during system prompt injection (not at runtime):
 * 1. IdentityManager.formatHeader() generates the identity prefix rules
 * 2. The header is prepended to AGENTS.md content
 * 3. Final prompt structure: [original] + [identity header] + [AGENTS.md]
 *
 * The AI sees the identity rules in its system prompt and applies them to
 * all responses. This is more reliable than runtime response modification.
 */

import { readFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createLogger } from "../../lib/logger.js";
import { AGENTS_MD_FILE } from "../../lib/constants.js";
import { IdentityManager } from "./identity-manager.js";

const logger = createLogger("atreides:system-prompt-injector");

/**
 * Injection marker to prevent duplicate injections.
 * This marker is added to the prompt and checked on subsequent injections.
 */
const INJECTION_MARKER = "<!-- ATREIDES_ORCHESTRATION_INJECTED -->";

/**
 * Required sections that must be present in AGENTS.md for it to be valid.
 *
 * ## Why These Sections Are Required
 *
 * The validation ensures AGENTS.md contains essential orchestration guidance:
 *
 * - **# Orchestration**: Main heading that identifies this as an Atreides config.
 *   Without this, the file might be a different AGENTS.md (e.g., for other systems).
 *
 * - **## Workflow**: Defines the 5-phase development workflow (intent → assessment →
 *   exploration → implementation → verification). The AI uses this to understand
 *   expected work patterns and phase transitions.
 *
 * - **## Agents**: Lists available specialized agents and their capabilities.
 *   The AI uses this to decide when to delegate to Explore, Plan, Stilgar, etc.
 *
 * Files missing these sections are likely incomplete or misconfigured, so we
 * fall back to default rules rather than inject potentially broken guidance.
 */
const REQUIRED_SECTIONS = ["# Orchestration", "## Workflow", "## Agents"] as const;

/**
 * Cache TTL in milliseconds (60 seconds).
 */
const CACHE_TTL_MS = 60_000;

/**
 * Default orchestration rules used when AGENTS.md is not found or invalid.
 */
const DEFAULT_ORCHESTRATION_RULES = `
# Atreides Orchestration (Default Rules)

> **Warning**: AGENTS.md not found or invalid. Using default orchestration rules.

## Workflow

Follow structured problem-solving phases:
1. **Intent** - Understand what the user wants
2. **Assessment** - Analyze the problem scope
3. **Exploration** - Gather context from the codebase
4. **Implementation** - Make changes systematically
5. **Verification** - Validate changes work correctly

## Agents

Delegate specialized work to appropriate agents when needed:
- **Explore**: For codebase exploration and context gathering
- **Plan**: For designing implementation approaches
- **Bash**: For command execution and git operations

## Rules

- Always use TodoWrite to track complex tasks
- Read files before modifying them
- Verify changes after implementation
`.trim();

/**
 * Result of AGENTS.md validation.
 */
export interface AgentsMdValidationResult {
  /** Whether the content is valid */
  valid: boolean;
  /** Missing sections if invalid */
  missingSections?: string[];
  /** Validation error message if invalid */
  error?: string;
}

/**
 * Statistics about injection operations.
 */
export interface InjectionStats {
  /** Total injection calls */
  totalInjections: number;
  /** Successful injections (valid AGENTS.md) */
  successfulInjections: number;
  /** Fallback injections (used defaults) */
  fallbackInjections: number;
  /** Cache hits */
  cacheHits: number;
  /** Cache misses */
  cacheMisses: number;
  /** Average injection time in ms */
  avgInjectionTimeMs: number;
}

/**
 * SystemPromptInjector reads AGENTS.md and injects orchestration rules
 * into the system prompt.
 *
 * Features:
 * - Reads AGENTS.md from project root
 * - Validates required sections exist
 * - Caches content with 60-second TTL
 * - Graceful fallback to defaults if file missing/invalid
 * - Identity header injection via IdentityManager
 *
 * @example
 * ```typescript
 * const injector = new SystemPromptInjector(identityManager, projectPath);
 * const enhanced = await injector.inject(originalPrompt, sessionId);
 * ```
 */
export class SystemPromptInjector {
  private cachedAgentsMd: string | null = null;
  private cacheTimestamp: number = 0;
  private projectPath: string;
  private identityManager: IdentityManager;

  // Statistics tracking
  private stats: InjectionStats = {
    totalInjections: 0,
    successfulInjections: 0,
    fallbackInjections: 0,
    cacheHits: 0,
    cacheMisses: 0,
    avgInjectionTimeMs: 0,
  };
  private totalInjectionTimeMs: number = 0;

  /**
   * Creates a new SystemPromptInjector instance.
   *
   * @param identityManager - IdentityManager for persona formatting
   * @param projectPath - Path to the project root (defaults to cwd)
   */
  constructor(identityManager: IdentityManager, projectPath?: string) {
    this.identityManager = identityManager;
    this.projectPath = projectPath || process.cwd();

    logger.debug("SystemPromptInjector initialized", {
      projectPath: this.projectPath,
      cacheTtl: CACHE_TTL_MS,
    });
  }

  /**
   * Inject orchestration rules into the system prompt.
   *
   * This method:
   * 1. Checks for duplicate injection (prevents re-injection)
   * 2. Reads AGENTS.md from the file system (with caching and hierarchical search)
   * 3. Validates the markdown structure
   * 4. Injects identity header and orchestration rules
   * 5. Falls back to defaults if file is missing or invalid
   *
   * ## Duplicate Prevention
   *
   * The injection marker `<!-- ATREIDES_ORCHESTRATION_INJECTED -->` is added
   * to mark prompts that have already been enhanced. On subsequent calls,
   * if the marker is present, the original prompt is returned unchanged.
   *
   * This prevents:
   * - Duplicate rules when the hook fires multiple times
   * - Growing prompt size from repeated injections
   * - Conflicting instructions from multiple copies
   *
   * @param originalPrompt - The original system prompt
   * @param sessionId - Current session identifier (for logging)
   * @returns Enhanced system prompt with orchestration rules
   */
  async inject(originalPrompt: string, sessionId: string): Promise<string> {
    const startTime = performance.now();
    this.stats.totalInjections++;

    try {
      // Check for duplicate injection
      if (originalPrompt.includes(INJECTION_MARKER)) {
        logger.debug("Injection skipped - already injected", { sessionId });
        this.stats.cacheHits++; // Count as cache hit since no new work done
        return originalPrompt;
      }

      // Read AGENTS.md (with caching and hierarchical search)
      const agentsMd = await this.readAgentsMd();

      // Validate markdown structure
      const validation = this.validateMarkdown(agentsMd);
      if (!validation.valid) {
        logger.warn("Invalid AGENTS.md syntax, using defaults", {
          sessionId,
          missingSections: validation.missingSections,
          error: validation.error,
        });
        return this.injectDefaults(originalPrompt);
      }

      // Build enhanced prompt with identity header and AGENTS.md content
      const identityHeader = this.identityManager.formatHeader();
      let enhanced = originalPrompt;

      // Add injection marker to prevent duplicates
      enhanced += `\n\n${INJECTION_MARKER}`;

      if (identityHeader) {
        enhanced += `\n\n${identityHeader}`;
      }

      enhanced += `\n\n${agentsMd}`;

      this.stats.successfulInjections++;
      logger.debug("System prompt injection successful", {
        sessionId,
        originalLength: originalPrompt.length,
        enhancedLength: enhanced.length,
      });

      return enhanced;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("System prompt injection error", {
        sessionId,
        error: errorMessage,
      });
      return this.injectDefaults(originalPrompt);
    } finally {
      const endTime = performance.now();
      const duration = endTime - startTime;
      this.totalInjectionTimeMs += duration;
      this.stats.avgInjectionTimeMs =
        this.totalInjectionTimeMs / this.stats.totalInjections;

      logger.debug("Injection timing", {
        sessionId,
        durationMs: duration.toFixed(2),
      });
    }
  }

  /**
   * Read AGENTS.md from the file system with caching and hierarchical resolution.
   * Cache is valid for 60 seconds.
   *
   * ## Hierarchical Resolution
   *
   * Searches for AGENTS.md in the following order:
   * 1. `projectPath/AGENTS.md` (current project)
   * 2. `parentDir/AGENTS.md` (parent directories)
   * 3. Continue up to filesystem root
   *
   * This enables:
   * - Project-specific orchestration rules
   * - Monorepo-level shared rules in parent directory
   * - User-level defaults in home directory
   *
   * @returns Contents of AGENTS.md
   * @throws Error if file cannot be found in any location
   */
  private async readAgentsMd(): Promise<string> {
    // Check cache validity
    const now = Date.now();
    if (this.cachedAgentsMd !== null && now - this.cacheTimestamp < CACHE_TTL_MS) {
      this.stats.cacheHits++;
      logger.debug("Cache hit for AGENTS.md", {
        age: now - this.cacheTimestamp,
        ttl: CACHE_TTL_MS,
      });
      return this.cachedAgentsMd;
    }

    this.stats.cacheMisses++;

    // Hierarchical resolution: search from projectPath up to root
    const foundPath = await this.findAgentsMdHierarchically(this.projectPath);

    if (!foundPath) {
      throw new Error(`AGENTS.md not found in ${this.projectPath} or parent directories`);
    }

    // Read from file system
    const content = await readFile(foundPath, "utf-8");

    // Update cache
    this.cachedAgentsMd = content;
    this.cacheTimestamp = now;

    logger.debug("AGENTS.md read from file system", {
      path: foundPath,
      projectPath: this.projectPath,
      contentLength: content.length,
    });

    return content;
  }

  /**
   * Search for AGENTS.md hierarchically from startPath up to filesystem root.
   *
   * @param startPath - Directory to start searching from
   * @returns Path to AGENTS.md if found, undefined otherwise
   */
  private async findAgentsMdHierarchically(startPath: string): Promise<string | undefined> {
    let currentPath = startPath;
    const visited = new Set<string>();

    while (currentPath && !visited.has(currentPath)) {
      visited.add(currentPath);

      const candidatePath = join(currentPath, AGENTS_MD_FILE);

      try {
        await access(candidatePath);
        // File exists
        return candidatePath;
      } catch {
        // File doesn't exist, try parent directory
      }

      const parentPath = dirname(currentPath);

      // Stop if we've reached the root (dirname returns same path)
      if (parentPath === currentPath) {
        break;
      }

      currentPath = parentPath;
    }

    return undefined;
  }

  /**
   * Validate that AGENTS.md contains required sections.
   *
   * Required sections:
   * - # Orchestration
   * - ## Workflow
   * - ## Agents
   *
   * @param content - AGENTS.md content to validate
   * @returns Validation result with details
   */
  validateMarkdown(content: string): AgentsMdValidationResult {
    if (!content || typeof content !== "string") {
      return {
        valid: false,
        error: "Content is empty or not a string",
      };
    }

    const missingSections: string[] = [];

    for (const section of REQUIRED_SECTIONS) {
      if (!content.includes(section)) {
        missingSections.push(section);
      }
    }

    if (missingSections.length > 0) {
      return {
        valid: false,
        missingSections,
        error: `Missing required sections: ${missingSections.join(", ")}`,
      };
    }

    return { valid: true };
  }

  /**
   * Inject default orchestration rules when AGENTS.md is missing or invalid.
   *
   * @param originalPrompt - The original system prompt
   * @returns Enhanced prompt with default rules
   */
  private injectDefaults(originalPrompt: string): string {
    // Check for duplicate injection even on fallback
    if (originalPrompt.includes(INJECTION_MARKER)) {
      return originalPrompt;
    }

    this.stats.fallbackInjections++;

    const identityHeader = this.identityManager.formatHeader();
    let enhanced = originalPrompt;

    // Add injection marker to prevent duplicates
    enhanced += `\n\n${INJECTION_MARKER}`;

    if (identityHeader) {
      enhanced += `\n\n${identityHeader}`;
    }

    enhanced += `\n\n${DEFAULT_ORCHESTRATION_RULES}`;

    logger.info("Using default orchestration rules", {
      totalFallbacks: this.stats.fallbackInjections,
    });

    return enhanced;
  }

  /**
   * Clear the AGENTS.md cache.
   * Useful for testing or when the file has been updated.
   */
  clearCache(): void {
    this.cachedAgentsMd = null;
    this.cacheTimestamp = 0;
    logger.debug("AGENTS.md cache cleared");
  }

  /**
   * Check if AGENTS.md is currently cached.
   *
   * @returns True if cache is valid
   */
  isCached(): boolean {
    return this.cachedAgentsMd !== null && Date.now() - this.cacheTimestamp < CACHE_TTL_MS;
  }

  /**
   * Get the current injection statistics.
   *
   * @returns Copy of current statistics
   */
  getStats(): InjectionStats {
    return { ...this.stats };
  }

  /**
   * Reset all statistics.
   * Useful for testing.
   */
  resetStats(): void {
    this.stats = {
      totalInjections: 0,
      successfulInjections: 0,
      fallbackInjections: 0,
      cacheHits: 0,
      cacheMisses: 0,
      avgInjectionTimeMs: 0,
    };
    this.totalInjectionTimeMs = 0;
    logger.debug("Injection statistics reset");
  }

  /**
   * Update the project path.
   * Clears the cache since the file location has changed.
   *
   * @param projectPath - New project path
   */
  setProjectPath(projectPath: string): void {
    this.projectPath = projectPath;
    this.clearCache();
    logger.debug("Project path updated", { projectPath });
  }

  /**
   * Get the path where AGENTS.md is expected.
   *
   * @returns Full path to AGENTS.md
   */
  getAgentsMdPath(): string {
    return join(this.projectPath, AGENTS_MD_FILE);
  }

  /**
   * Get the default orchestration rules.
   * Useful for displaying to users or testing.
   *
   * @returns Default orchestration rules string
   */
  static getDefaultRules(): string {
    return DEFAULT_ORCHESTRATION_RULES;
  }

  /**
   * Get the required sections for AGENTS.md validation.
   *
   * @returns Array of required section headers
   */
  static getRequiredSections(): readonly string[] {
    return REQUIRED_SECTIONS;
  }

  /**
   * Get the cache TTL in milliseconds.
   *
   * @returns Cache TTL value
   */
  static getCacheTtl(): number {
    return CACHE_TTL_MS;
  }
}

/**
 * Create a new SystemPromptInjector instance.
 * Factory function for consistent instantiation.
 *
 * @param identityManager - IdentityManager for persona formatting
 * @param projectPath - Path to the project root
 * @returns New SystemPromptInjector instance
 */
export function createSystemPromptInjector(
  identityManager: IdentityManager,
  projectPath?: string
): SystemPromptInjector {
  return new SystemPromptInjector(identityManager, projectPath);
}
