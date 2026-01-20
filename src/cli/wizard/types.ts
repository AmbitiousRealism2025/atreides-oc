import type { ProjectType, PackageManager } from "../project-detection.js";

export type InstallationMode = "minimal" | "standard" | "full";

export interface AgentConfig {
  name: string;
  displayName: string;
  purpose: string;
  recommendedModel: string;
  selectedModel: string;
}

export interface PermissionCategory {
  name: string;
  description: string;
  permissions: PermissionItem[];
}

export interface PermissionItem {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  dangerLevel: "safe" | "caution" | "dangerous";
}

export interface WizardConfiguration {
  projectType: ProjectType;
  packageManager?: PackageManager;
  installationMode: InstallationMode;
  agents: AgentConfig[];
  permissions: {
    fileOperations: PermissionItem[];
    shellCommands: PermissionItem[];
    networkAccess: PermissionItem[];
    gitOperations: PermissionItem[];
  };
}

export interface WizardResult {
  configuration: WizardConfiguration;
  filesToCreate: string[];
  cancelled: boolean;
}

export const DEFAULT_AGENTS: AgentConfig[] = [
  {
    name: "stilgar",
    displayName: "Stilgar (Oracle)",
    purpose: "Architecture decisions, complex debugging",
    recommendedModel: "claude-sonnet-4",
    selectedModel: "claude-sonnet-4",
  },
  {
    name: "explore",
    displayName: "Explore",
    purpose: "Fast codebase exploration",
    recommendedModel: "claude-haiku-4-5",
    selectedModel: "claude-haiku-4-5",
  },
  {
    name: "librarian",
    displayName: "Librarian",
    purpose: "Documentation and OSS research",
    recommendedModel: "claude-haiku-4-5",
    selectedModel: "claude-haiku-4-5",
  },
  {
    name: "build",
    displayName: "Build",
    purpose: "Default full-access agent",
    recommendedModel: "claude-sonnet-4",
    selectedModel: "claude-sonnet-4",
  },
  {
    name: "plan",
    displayName: "Plan",
    purpose: "Read-only planning and analysis",
    recommendedModel: "claude-sonnet-4",
    selectedModel: "claude-sonnet-4",
  },
  {
    name: "frontend-ui-ux",
    displayName: "Frontend-UI-UX",
    purpose: "Visual and styling work",
    recommendedModel: "claude-sonnet-4",
    selectedModel: "claude-sonnet-4",
  },
  {
    name: "document-writer",
    displayName: "Document-Writer",
    purpose: "Documentation generation",
    recommendedModel: "claude-sonnet-4",
    selectedModel: "claude-sonnet-4",
  },
  {
    name: "general",
    displayName: "General",
    purpose: "Multi-purpose agent",
    recommendedModel: "claude-sonnet-4",
    selectedModel: "claude-sonnet-4",
  },
];

export const AVAILABLE_MODELS = [
  { value: "claude-sonnet-4", label: "Claude Sonnet 4", description: "Balanced performance/cost" },
  { value: "claude-opus-4", label: "Claude Opus 4", description: "Powerful - Higher cost" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5", description: "Fast - Lower cost" },
  { value: "gpt-4o", label: "GPT-4o", description: "OpenAI GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini", description: "OpenAI GPT-4o Mini" },
];

export function createDefaultPermissions(projectType: ProjectType): WizardConfiguration["permissions"] {
  const isTypescript = projectType === "typescript";
  const isNode = projectType === "node" || isTypescript;
  const isPython = projectType === "python";
  const isGo = projectType === "go";
  const isRust = projectType === "rust";

  return {
    fileOperations: [
      { id: "file-read", label: "Read files", description: "Read any file in the project", checked: true, dangerLevel: "safe" },
      { id: "file-write", label: "Write files", description: "Create or overwrite files (with confirmation)", checked: true, dangerLevel: "caution" },
      { id: "file-edit", label: "Edit files", description: "Modify existing files (with confirmation)", checked: true, dangerLevel: "caution" },
      { id: "file-delete", label: "Delete files", description: "Remove files from project", checked: false, dangerLevel: "dangerous" },
    ],
    shellCommands: [
      { id: "shell-npm", label: "npm commands", description: "npm install, npm test, etc.", checked: isNode, dangerLevel: "safe" },
      { id: "shell-npx", label: "npx commands", description: "Run npx commands", checked: isNode, dangerLevel: "safe" },
      { id: "shell-node", label: "Node.js execution", description: "Run node scripts", checked: isNode, dangerLevel: "caution" },
      { id: "shell-bun", label: "Bun commands", description: "Run bun commands", checked: isNode, dangerLevel: "safe" },
      { id: "shell-python", label: "Python commands", description: "pip, python, pytest", checked: isPython, dangerLevel: "safe" },
      { id: "shell-go", label: "Go commands", description: "go build, go test, etc.", checked: isGo, dangerLevel: "safe" },
      { id: "shell-cargo", label: "Cargo commands", description: "cargo build, cargo test, etc.", checked: isRust, dangerLevel: "safe" },
      { id: "shell-system", label: "System commands", description: "Other shell commands", checked: false, dangerLevel: "dangerous" },
    ],
    networkAccess: [
      { id: "net-http", label: "HTTP/HTTPS requests", description: "For documentation, APIs", checked: true, dangerLevel: "caution" },
      { id: "net-unrestricted", label: "Unrestricted network", description: "All network access", checked: false, dangerLevel: "dangerous" },
    ],
    gitOperations: [
      { id: "git-read", label: "Git read-only", description: "git status, diff, log", checked: true, dangerLevel: "safe" },
      { id: "git-commit", label: "Git add/commit", description: "Stage and commit changes", checked: true, dangerLevel: "caution" },
      { id: "git-push", label: "Git push", description: "Push to remote", checked: false, dangerLevel: "dangerous" },
      { id: "git-force", label: "Git force operations", description: "Force push, hard reset", checked: false, dangerLevel: "dangerous" },
    ],
  };
}

export function getFilesToCreate(mode: InstallationMode): string[] {
  const minimal = ["AGENTS.md"];
  
  const standard = [
    ...minimal,
    "opencode.json",
    ".opencode/plugin/atreides.ts",
    ".opencode/agent/stilgar.md",
    ".opencode/agent/explore.md",
    ".opencode/agent/librarian.md",
    ".opencode/agent/build.md",
    ".opencode/agent/plan.md",
    ".opencode/agent/frontend-ui-ux.md",
    ".opencode/agent/document-writer.md",
    ".opencode/agent/general.md",
    ".opencode/package.json",
  ];
  
  const full = [
    ...standard,
    ".opencode/skill/init/SKILL.md",
    ".opencode/skill/review/SKILL.md",
    ".opencode/skill/prime/SKILL.md",
    ".opencode/skill/question/SKILL.md",
  ];

  switch (mode) {
    case "minimal":
      return minimal;
    case "standard":
      return standard;
    case "full":
      return full;
    default:
      return standard;
  }
}
