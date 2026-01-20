/**
 * Identity Manager for Atreides OpenCode
 *
 * Manages persona identity formatting including response prefixes,
 * delegation announcements, and agent display names.
 *
 * ## Identity Integration Point
 *
 * Identity formatting is applied at the **system prompt level** during the
 * `experimental.chat.system.transform` hook, NOT at runtime response time.
 *
 * ### Why System Prompt?
 *
 * 1. **Reliability**: Rules in the system prompt are always visible to the AI,
 *    regardless of conversation history length or compaction.
 *
 * 2. **Consistency**: The AI applies the prefix rule itself, ensuring natural
 *    integration with its response generation.
 *
 * 3. **No Post-Processing**: Runtime response modification would require parsing
 *    and modifying AI output, which can break formatting and code blocks.
 *
 * ### Integration Flow
 *
 * ```
 * 1. User sends message
 * 2. OpenCode triggers `experimental.chat.system.transform` hook
 * 3. SystemPromptInjector calls IdentityManager.formatHeader()
 * 4. Header includes: "START EVERY RESPONSE WITH: [PersonaName]:"
 * 5. AI sees instruction in system prompt and prefixes its responses
 * ```
 *
 * ### Configuration Path
 *
 * Identity settings are at `config.identity` in opencode.json:
 *
 * ```json
 * {
 *   "atreides": {
 *     "identity": {
 *       "personaName": "Muad'Dib",
 *       "responsePrefix": true,
 *       "delegationAnnouncements": true
 *     }
 *   }
 * }
 * ```
 */

import type { Config } from "../../lib/config.js";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger("atreides:identity-manager");

/**
 * Agent display name mappings for delegation announcements.
 * Maps internal agent identifiers to human-readable names.
 */
const AGENT_DISPLAY_NAMES: Record<string, string> = {
  explore: "Explore",
  plan: "Plan",
  "general-purpose": "General Purpose",
  bash: "Bash",
  "technical-writer": "Technical Writer",
  "backend-architect": "Backend Architect",
  "frontend-architect": "Frontend Architect",
  "security-engineer": "Security Engineer",
  "quality-engineer": "Quality Engineer",
  "performance-engineer": "Performance Engineer",
  "devops-architect": "DevOps Architect",
  "system-architect": "System Architect",
  "refactoring-expert": "Refactoring Expert",
  "python-expert": "Python Expert",
  "root-cause-analyst": "Root Cause Analyst",
  "learning-guide": "Learning Guide",
  "socratic-mentor": "Socratic Mentor",
  "requirements-analyst": "Requirements Analyst",
  validator: "Validator",
  "design-reviewer": "Design Reviewer",
};

/**
 * IdentityManager handles persona identity formatting for the orchestration system.
 *
 * Responsibilities:
 * - Format identity headers for system prompt injection
 * - Format response prefixes for the AI persona
 * - Generate delegation announcements for agent handoffs
 * - Provide agent display names
 *
 * @example
 * ```typescript
 * const manager = new IdentityManager(config);
 * const header = manager.formatHeader();
 * // Returns: "[Muad'Dib]: I am your AI orchestration assistant."
 * ```
 */
export class IdentityManager {
  private config: Config;

  /**
   * Creates a new IdentityManager instance.
   *
   * @param config - Plugin configuration containing identity settings
   */
  constructor(config: Config) {
    this.config = config;
    logger.debug("IdentityManager initialized", {
      personaName: config.identity.personaName,
      responsePrefix: config.identity.responsePrefix,
      delegationAnnouncements: config.identity.delegationAnnouncements,
    });
  }

  /**
   * Format the identity header for system prompt injection.
   * Returns an empty string if response prefix is disabled.
   *
   * @returns Formatted identity header string
   */
  formatHeader(): string {
    if (!this.config.identity.responsePrefix) {
      return "";
    }

    const personaName = this.config.identity.personaName;
    return `# Atreides Orchestration Profile

You are **${personaName}**, the orchestration agent.

## RULE #1 - ALWAYS PREFIX YOUR RESPONSES

START EVERY RESPONSE WITH: [${personaName}]:

This is mandatory. No exceptions. Your very first characters of output must be \`[${personaName}]: \` followed by your message.

CORRECT:
[${personaName}]: I'll analyze this codebase first.
[${personaName}]: Creating a task list...
[${personaName}]: Delegating to Explore agent...

WRONG (never do this):
I'll analyze this codebase first.
Let me check that file.
Creating a task list...

If you forget the prefix, stop and restart your response with [${personaName}]: at the beginning.`;
  }

  /**
   * Format a response with the persona prefix.
   * Returns the response unchanged if prefix is disabled.
   *
   * @param response - The response text to prefix
   * @returns Response with persona prefix if enabled
   */
  formatResponse(response: string): string {
    if (!this.config.identity.responsePrefix) {
      return response;
    }

    const personaName = this.config.identity.personaName;
    return `[${personaName}]: ${response}`;
  }

  /**
   * Format a delegation announcement message.
   * Used when handing off tasks to specialized agents.
   *
   * @param agentName - Internal agent identifier
   * @param before - Whether this is before (true) or after (false) delegation
   * @returns Formatted delegation announcement, or empty string if disabled
   */
  formatDelegationAnnouncement(agentName: string, before: boolean): string {
    if (!this.config.identity.delegationAnnouncements) {
      return "";
    }

    const personaName = this.config.identity.personaName;
    const displayName = this.getAgentDisplayName(agentName);

    if (before) {
      return `[${personaName}]: Delegating to ${displayName} agent...`;
    } else {
      return `[${personaName}]: ${displayName} agent has completed the task.`;
    }
  }

  /**
   * Get the human-readable display name for an agent.
   * Checks config overrides first, then built-in defaults, then generates from ID.
   *
   * @param agentId - Internal agent identifier
   * @returns Human-readable agent display name
   */
  getAgentDisplayName(agentId: string): string {
    // Check for config-defined custom name first
    const configDisplayNames = this.config.identity.agentDisplayNames;
    if (configDisplayNames && configDisplayNames[agentId]) {
      return configDisplayNames[agentId];
    }

    // Check built-in mapping
    if (AGENT_DISPLAY_NAMES[agentId]) {
      return AGENT_DISPLAY_NAMES[agentId];
    }

    // Convert kebab-case to Title Case as fallback
    return agentId
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  /**
   * Get the current persona name.
   *
   * @returns Current persona name from config
   */
  getPersonaName(): string {
    return this.config.identity.personaName;
  }

  /**
   * Check if response prefixes are enabled.
   *
   * @returns True if response prefix is enabled
   */
  isResponsePrefixEnabled(): boolean {
    return this.config.identity.responsePrefix;
  }

  /**
   * Check if delegation announcements are enabled.
   *
   * @returns True if delegation announcements are enabled
   */
  isDelegationAnnouncementsEnabled(): boolean {
    return this.config.identity.delegationAnnouncements;
  }

  /**
   * Update the configuration for this manager.
   * Useful when config changes during a session.
   *
   * @param config - New configuration to use
   */
  updateConfig(config: Config): void {
    this.config = config;
    logger.debug("IdentityManager config updated", {
      personaName: config.identity.personaName,
    });
  }
}

/**
 * Create a new IdentityManager instance.
 * Factory function for consistent instantiation.
 *
 * @param config - Plugin configuration
 * @returns New IdentityManager instance
 */
export function createIdentityManager(config: Config): IdentityManager {
  return new IdentityManager(config);
}
