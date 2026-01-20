/**
 * Types for skill generation
 *
 * Skills are reusable capabilities that agents can invoke.
 * Context types determine execution mode (main vs fork).
 */

/**
 * Context type for skill execution
 * - main: Executes in main conversation context, maintaining full session state
 * - fork: Executes in forked context, suitable for parallel/isolated operations
 */
export type SkillContextType = "main" | "fork";

/**
 * Configuration for a skill
 */
export interface SkillConfig {
  /** Skill identifier (lowercase, kebab-case) */
  name: string;
  /** Context type: 'main' for main conversation, 'fork' for parallel execution */
  contextType: SkillContextType;
  /** Whether the skill is enabled */
  enabled: boolean;
  /** Human-readable description of the skill */
  description: string;
}

/**
 * Result of skill file generation
 */
export interface SkillGenerationResult {
  /** Path to the generated file (relative to project root) */
  path: string;
  /** Whether the file was created (false if already existed and wasn't overwritten) */
  created: boolean;
  /** Whether the file was updated (existing file was modified) */
  updated: boolean;
  /** Error message if generation failed */
  error?: string;
}

/**
 * Options for skill generation
 */
export interface SkillGenerationOptions {
  /** Base directory for output (project root) */
  outputDir: string;
  /** Whether to overwrite existing files */
  overwrite?: boolean;
  /** Directory containing templates (defaults to package templates) */
  templateDir?: string;
}

/**
 * Frontmatter schema for skill markdown files
 */
export interface SkillFrontmatter {
  name: string;
  contextType: SkillContextType;
  enabled: boolean;
  description: string;
}

/**
 * MVP skill names (4 total)
 */
export const MVP_SKILL_NAMES = [
  "base",
  "orchestrate",
  "explore",
  "validate",
] as const;

export type MVPSkillName = (typeof MVP_SKILL_NAMES)[number];

/**
 * Check if a skill name is an MVP skill
 */
export function isMVPSkill(name: string): name is MVPSkillName {
  return MVP_SKILL_NAMES.includes(name as MVPSkillName);
}

/**
 * Advanced skill names - Post-MVP Phase 2, Set 1 (4 total)
 */
export const ADVANCED_SKILL_NAMES = [
  "lsp",
  "refactor",
  "checkpoint",
  "tdd",
] as const;

export type AdvancedSkillName = (typeof ADVANCED_SKILL_NAMES)[number];

/**
 * Extended skill names - Post-MVP Phase 2, Set 2 (4 total)
 */
export const EXTENDED_SKILL_NAMES = [
  "parallel-explore",
  "incremental-refactor",
  "doc-sync",
  "quality-gate",
] as const;

export type ExtendedSkillName = (typeof EXTENDED_SKILL_NAMES)[number];

/**
 * Check if a skill name is an extended skill
 */
export function isExtendedSkill(name: string): name is ExtendedSkillName {
  return EXTENDED_SKILL_NAMES.includes(name as ExtendedSkillName);
}

/**
 * Check if a skill name is an advanced skill
 */
export function isAdvancedSkill(name: string): name is AdvancedSkillName {
  return ADVANCED_SKILL_NAMES.includes(name as AdvancedSkillName);
}

/**
 * All skill names (MVP + Advanced + Extended)
 */
export const ALL_SKILL_NAMES = [...MVP_SKILL_NAMES, ...ADVANCED_SKILL_NAMES, ...EXTENDED_SKILL_NAMES] as const;

export type AllSkillName = (typeof ALL_SKILL_NAMES)[number];

/**
 * Default configurations for MVP skills
 */
export const MVP_SKILL_CONFIGS: Record<MVPSkillName, SkillConfig> = {
  base: {
    name: "base",
    contextType: "main",
    enabled: true,
    description: "Base skill template and documentation",
  },
  orchestrate: {
    name: "orchestrate",
    contextType: "main",
    enabled: true,
    description: "Workflow orchestration and agent delegation",
  },
  explore: {
    name: "explore",
    contextType: "fork",
    enabled: true,
    description: "Codebase exploration and context gathering",
  },
  validate: {
    name: "validate",
    contextType: "fork",
    enabled: true,
    description: "Code validation and quality checks",
  },
};

/**
 * Get the default SkillConfig for a given MVP skill name
 */
export function getDefaultSkillConfig(name: MVPSkillName): SkillConfig {
  return { ...MVP_SKILL_CONFIGS[name] };
}

/**
 * Get all default MVP skill configurations
 */
export function getAllMVPSkillConfigs(): SkillConfig[] {
  return MVP_SKILL_NAMES.map((name) => getDefaultSkillConfig(name));
}

/**
 * Default configurations for advanced skills (Post-MVP Phase 2)
 */
export const ADVANCED_SKILL_CONFIGS: Record<AdvancedSkillName, SkillConfig> = {
  lsp: {
    name: "lsp",
    contextType: "fork",
    enabled: true,
    description: "Language Server Protocol integration for intelligent code analysis",
  },
  refactor: {
    name: "refactor",
    contextType: "fork",
    enabled: true,
    description: "Code refactoring and restructuring for safe transformations",
  },
  checkpoint: {
    name: "checkpoint",
    contextType: "main",
    enabled: true,
    description: "State checkpointing and backup for workflow recovery",
  },
  tdd: {
    name: "tdd",
    contextType: "fork",
    enabled: true,
    description: "Test-driven development workflow for quality-first implementation",
  },
};

/**
 * Get the default SkillConfig for a given advanced skill name
 */
export function getDefaultAdvancedSkillConfig(name: AdvancedSkillName): SkillConfig {
  return { ...ADVANCED_SKILL_CONFIGS[name] };
}

/**
 * Get all default advanced skill configurations
 */
export function getAllAdvancedSkillConfigs(): SkillConfig[] {
  return ADVANCED_SKILL_NAMES.map((name) => getDefaultAdvancedSkillConfig(name));
}

/**
 * Default configurations for extended skills (Post-MVP Phase 2, Set 2)
 */
export const EXTENDED_SKILL_CONFIGS: Record<ExtendedSkillName, SkillConfig> = {
  "parallel-explore": {
    name: "parallel-explore",
    contextType: "fork",
    enabled: true,
    description: "Parallel codebase exploration for faster context gathering",
  },
  "incremental-refactor": {
    name: "incremental-refactor",
    contextType: "fork",
    enabled: true,
    description: "Incremental refactoring with validation between steps",
  },
  "doc-sync": {
    name: "doc-sync",
    contextType: "fork",
    enabled: true,
    description: "Documentation synchronization with code changes",
  },
  "quality-gate": {
    name: "quality-gate",
    contextType: "fork",
    enabled: true,
    description: "Quality gate enforcement for code standards",
  },
};

/**
 * Get the default SkillConfig for a given extended skill name
 */
export function getDefaultExtendedSkillConfig(name: ExtendedSkillName): SkillConfig {
  return { ...EXTENDED_SKILL_CONFIGS[name] };
}

/**
 * Get all default extended skill configurations
 */
export function getAllExtendedSkillConfigs(): SkillConfig[] {
  return EXTENDED_SKILL_NAMES.map((name) => getDefaultExtendedSkillConfig(name));
}

/**
 * Get all skill configurations (MVP + Advanced + Extended)
 */
export function getAllSkillConfigs(): SkillConfig[] {
  return [...getAllMVPSkillConfigs(), ...getAllAdvancedSkillConfigs(), ...getAllExtendedSkillConfigs()];
}
