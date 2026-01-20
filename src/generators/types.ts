/**
 * Types for agent generation
 */

export interface AgentConfig {
  /** Agent identifier (lowercase, kebab-case) */
  name: string;
  /** Human-readable display name */
  displayName: string;
  /** Model to use for this agent */
  model: string;
  /** Whether the agent is enabled */
  enabled: boolean;
}

export interface AgentGenerationResult {
  /** Path to the generated file (relative to project root) */
  path: string;
  /** Whether the file was created (false if already existed and wasn't overwritten) */
  created: boolean;
  /** Whether the file was updated (existing file was modified) */
  updated: boolean;
  /** Error message if generation failed */
  error?: string;
}

export interface AgentGenerationOptions {
  /** Base directory for output (project root) */
  outputDir: string;
  /** Whether to overwrite existing files */
  overwrite?: boolean;
  /** Directory containing templates (defaults to package templates) */
  templateDir?: string;
}

/**
 * Frontmatter schema for agent markdown files
 */
export interface AgentFrontmatter {
  name: string;
  displayName: string;
  model: string;
  enabled: boolean;
}

/**
 * MVP agent names (5 total)
 */
export const MVP_AGENT_NAMES = [
  "stilgar",
  "explore",
  "librarian",
  "build",
  "plan",
] as const;

export type MVPAgentName = (typeof MVP_AGENT_NAMES)[number];

/**
 * Post-MVP agent names (3 total) - Phase 1
 */
export const POST_MVP_AGENT_NAMES = [
  "frontend-ui-ux",
  "document-writer",
  "general",
] as const;

export type PostMVPAgentName = (typeof POST_MVP_AGENT_NAMES)[number];

/**
 * All agent names (MVP + Post-MVP)
 */
export const ALL_AGENT_NAMES = [
  ...MVP_AGENT_NAMES,
  ...POST_MVP_AGENT_NAMES,
] as const;

export type AgentName = (typeof ALL_AGENT_NAMES)[number];

/**
 * Check if an agent name is an MVP agent
 */
export function isMVPAgent(name: string): name is MVPAgentName {
  return MVP_AGENT_NAMES.includes(name as MVPAgentName);
}

/**
 * Check if an agent name is a Post-MVP agent
 */
export function isPostMVPAgent(name: string): name is PostMVPAgentName {
  return POST_MVP_AGENT_NAMES.includes(name as PostMVPAgentName);
}

/**
 * Check if an agent name is a valid agent (MVP or Post-MVP)
 */
export function isValidAgent(name: string): name is AgentName {
  return ALL_AGENT_NAMES.includes(name as AgentName);
}

/**
 * Default model configurations for MVP agents
 */
export const DEFAULT_AGENT_MODELS: Record<MVPAgentName, string> = {
  stilgar: "claude-sonnet-4",
  explore: "claude-haiku-4-5",
  librarian: "claude-sonnet-4",
  build: "claude-sonnet-4",
  plan: "claude-sonnet-4",
};

/**
 * Default model configurations for Post-MVP agents
 */
export const DEFAULT_POST_MVP_AGENT_MODELS: Record<PostMVPAgentName, string> = {
  "frontend-ui-ux": "claude-sonnet-4",
  "document-writer": "claude-sonnet-4",
  general: "claude-haiku-4-5",
};

/**
 * All default agent models (MVP + Post-MVP)
 */
export const ALL_DEFAULT_AGENT_MODELS: Record<AgentName, string> = {
  ...DEFAULT_AGENT_MODELS,
  ...DEFAULT_POST_MVP_AGENT_MODELS,
};

/**
 * Agent display names mapping
 */
export const AGENT_DISPLAY_NAMES: Record<AgentName, string> = {
  stilgar: "Stilgar",
  explore: "Explore",
  librarian: "Librarian",
  build: "Build",
  plan: "Plan",
  "frontend-ui-ux": "Frontend Architect",
  "document-writer": "Documentation Writer",
  general: "Research Agent",
};
