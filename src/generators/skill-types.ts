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
