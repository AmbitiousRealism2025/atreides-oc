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
  generatePostMVPAgents,
  generateAllAgents,
} from "./agent-generator.js";

export {
  type AgentConfig,
  type AgentGenerationResult,
  type AgentGenerationOptions,
  type AgentFrontmatter,
  type MVPAgentName,
  type PostMVPAgentName,
  type AgentName,
  MVP_AGENT_NAMES,
  POST_MVP_AGENT_NAMES,
  ALL_AGENT_NAMES,
  isMVPAgent,
  isPostMVPAgent,
  isValidAgent,
  DEFAULT_AGENT_MODELS,
  DEFAULT_POST_MVP_AGENT_MODELS,
  ALL_DEFAULT_AGENT_MODELS,
  AGENT_DISPLAY_NAMES,
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
  type AdvancedSkillName,
  type ExtendedSkillName,
  type AllSkillName,
  MVP_SKILL_NAMES,
  MVP_SKILL_CONFIGS,
  ADVANCED_SKILL_NAMES,
  ADVANCED_SKILL_CONFIGS,
  EXTENDED_SKILL_NAMES,
  EXTENDED_SKILL_CONFIGS,
  ALL_SKILL_NAMES,
  isMVPSkill,
  isAdvancedSkill,
  isExtendedSkill,
  getDefaultSkillConfig,
  getDefaultAdvancedSkillConfig,
  getDefaultExtendedSkillConfig,
  getAllMVPSkillConfigs,
  getAllAdvancedSkillConfigs,
  getAllExtendedSkillConfigs,
  getAllSkillConfigs,
} from "./skill-types.js";
