/**
 * Generators module
 *
 * Provides template-based generation for agents, skills, and other
 * Atreides OpenCode components.
 */

// Agent exports
export {
  AgentGenerator,
  createAgentGenerator,
  generateMVPAgents,
} from "./agent-generator.js";

export {
  type AgentConfig,
  type AgentGenerationResult,
  type AgentGenerationOptions,
  type AgentFrontmatter,
  type MVPAgentName,
  MVP_AGENT_NAMES,
  isMVPAgent,
  DEFAULT_AGENT_MODELS,
} from "./types.js";

// Skill exports
export {
  SkillGenerator,
  createSkillGenerator,
  generateMVPSkills,
} from "./skill-generator.js";

export {
  type SkillConfig,
  type SkillGenerationResult,
  type SkillGenerationOptions,
  type SkillFrontmatter,
  type SkillContextType,
  type MVPSkillName,
  MVP_SKILL_NAMES,
  MVP_SKILL_CONFIGS,
  isMVPSkill,
  getDefaultSkillConfig,
  getAllMVPSkillConfigs,
} from "./skill-types.js";
