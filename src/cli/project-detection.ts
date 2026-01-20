import { access } from "node:fs/promises";
import { join } from "node:path";

/**
 * Supported project types for Atreides OpenCode
 */
export type ProjectType = "typescript" | "node" | "python" | "go" | "rust" | "generic";

/**
 * Confidence level of project detection
 */
export type ConfidenceLevel = "high" | "medium" | "low";

/**
 * Detected package manager for Node.js/TypeScript projects
 */
export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

/**
 * Result of project type detection
 */
export interface ProjectDetection {
  /** Detected project type */
  type: ProjectType;
  /** Confidence level of the detection */
  confidence: ConfidenceLevel;
  /** Files found as evidence for the detection */
  evidence: string[];
  /** Detected package manager (for Node.js/TypeScript projects) */
  packageManager?: PackageManager;
  /** Human-readable display name */
  displayName: string;
  /** Detected language */
  language: string;
}

/**
 * Project type indicator files and their associated types
 */
interface ProjectIndicator {
  file: string;
  type: ProjectType;
  confidence: ConfidenceLevel;
  displayName: string;
  language: string;
}

/**
 * List of indicator files to check for project type detection
 * Order matters: more specific indicators should come first
 */
const PROJECT_INDICATORS: ProjectIndicator[] = [
  // TypeScript (high confidence - most specific)
  { file: "tsconfig.json", type: "typescript", confidence: "high", displayName: "TypeScript", language: "TypeScript" },
  // Rust
  { file: "Cargo.toml", type: "rust", confidence: "high", displayName: "Rust", language: "Rust" },
  // Go
  { file: "go.mod", type: "go", confidence: "high", displayName: "Go", language: "Go" },
  // Python
  { file: "pyproject.toml", type: "python", confidence: "high", displayName: "Python", language: "Python" },
  { file: "setup.py", type: "python", confidence: "high", displayName: "Python", language: "Python" },
  { file: "requirements.txt", type: "python", confidence: "medium", displayName: "Python", language: "Python" },
  // Node.js (medium confidence - less specific than TypeScript)
  { file: "package.json", type: "node", confidence: "medium", displayName: "Node.js", language: "JavaScript" },
];

/**
 * Package manager lock files to detect which package manager is in use
 */
const PACKAGE_MANAGER_INDICATORS: Record<string, PackageManager> = {
  "bun.lockb": "bun",
  "bun.lock": "bun",
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "package-lock.json": "npm",
};

/**
 * Check if a file exists at the given path
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect the package manager used in a Node.js/TypeScript project
 */
async function detectPackageManager(directory: string): Promise<PackageManager | undefined> {
  for (const [lockFile, manager] of Object.entries(PACKAGE_MANAGER_INDICATORS)) {
    if (await fileExists(join(directory, lockFile))) {
      return manager;
    }
  }
  return undefined;
}

/**
 * Detect all project types present in a directory
 * Returns all matching indicators for potential multiple project types
 */
async function detectAllProjectTypes(directory: string): Promise<ProjectIndicator[]> {
  const found: ProjectIndicator[] = [];
  
  for (const indicator of PROJECT_INDICATORS) {
    if (await fileExists(join(directory, indicator.file))) {
      found.push(indicator);
    }
  }
  
  return found;
}

/**
 * Detect the project type for a given directory
 * 
 * Detection Rules:
 * - tsconfig.json → TypeScript (high confidence)
 * - package.json only → Node.js (medium confidence)
 * - pyproject.toml or setup.py → Python (high confidence)
 * - go.mod → Go (high confidence)
 * - Cargo.toml → Rust (high confidence)
 * - Multiple found → Returns most specific (TypeScript > Node.js)
 * - None found → Default to Generic
 * 
 * @param directory - The directory to scan for project files
 * @returns ProjectDetection result with type, confidence, and evidence
 */
export async function detectProjectType(directory: string): Promise<ProjectDetection> {
  const indicators = await detectAllProjectTypes(directory);
  
  if (indicators.length === 0) {
    return {
      type: "generic",
      confidence: "low",
      evidence: [],
      displayName: "Generic",
      language: "Unknown",
    };
  }
  
  const primary = indicators[0]!;
  const evidence = indicators.map(i => i.file);
  
  const packageManager = (primary.type === "typescript" || primary.type === "node")
    ? await detectPackageManager(directory)
    : undefined;
  
  if (primary.type === "node" && indicators.some(i => i.type === "typescript")) {
    const tsIndicator = indicators.find(i => i.type === "typescript")!;
    const result: ProjectDetection = {
      type: "typescript",
      confidence: "high",
      evidence,
      displayName: tsIndicator.displayName,
      language: tsIndicator.language,
    };
    if (packageManager !== undefined) {
      result.packageManager = packageManager;
    }
    return result;
  }
  
  const result: ProjectDetection = {
    type: primary.type,
    confidence: primary.confidence,
    evidence,
    displayName: primary.displayName,
    language: primary.language,
  };
  if (packageManager !== undefined) {
    result.packageManager = packageManager;
  }
  return result;
}

/**
 * Get all supported project types for manual selection
 */
export function getSupportedProjectTypes(): Array<{ type: ProjectType; displayName: string; description: string }> {
  return [
    { type: "typescript", displayName: "TypeScript", description: "TypeScript with Node.js" },
    { type: "node", displayName: "Node.js", description: "JavaScript with Node.js" },
    { type: "python", displayName: "Python", description: "Python project" },
    { type: "go", displayName: "Go", description: "Go (Golang) project" },
    { type: "rust", displayName: "Rust", description: "Rust with Cargo" },
    { type: "generic", displayName: "Generic", description: "No language-specific configuration" },
  ];
}

/**
 * Language-specific default permissions for each project type
 * These are used as presets during the wizard permission configuration
 */
export function getLanguageDefaults(projectType: ProjectType): {
  shellCommands: string[];
  description: string;
} {
  switch (projectType) {
    case "typescript":
      return {
        shellCommands: ["npm *", "npx *", "node *", "tsc *", "bun *", "yarn *", "pnpm *"],
        description: "TypeScript-optimized preset (npm, npx, node, tsc, bun, yarn, pnpm)",
      };
    case "node":
      return {
        shellCommands: ["npm *", "npx *", "node *", "bun *", "yarn *", "pnpm *"],
        description: "Node.js-optimized preset (npm, npx, node, bun, yarn, pnpm)",
      };
    case "python":
      return {
        shellCommands: ["pip *", "python *", "python3 *", "pytest *", "poetry *", "uv *"],
        description: "Python-optimized preset (pip, python, pytest, poetry, uv)",
      };
    case "go":
      return {
        shellCommands: ["go *"],
        description: "Go-optimized preset (go commands)",
      };
    case "rust":
      return {
        shellCommands: ["cargo *", "rustc *", "rustup *"],
        description: "Rust-optimized preset (cargo, rustc, rustup)",
      };
    case "generic":
    default:
      return {
        shellCommands: [],
        description: "Minimal preset (configure manually)",
      };
  }
}
