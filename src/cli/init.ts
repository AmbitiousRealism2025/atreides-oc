import { access, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { confirm } from "@inquirer/prompts";
import { runInitWizard, printSuccessSummary } from "./wizard/index.js";
import { printMergeMode, printCancelled, printError, COLORS } from "./wizard/prompts.js";
import { OPENCODE_DIR, AGENTS_MD_FILE } from "../lib/constants.js";
import { generateMVPAgents, isMVPAgent, type AgentConfig as GeneratorAgentConfig } from "../generators/index.js";
import type { AgentConfig as WizardAgentConfig } from "./wizard/types.js";

export interface InitOptions {
  directory?: string;
}

export async function runInitCommand(options: InitOptions = {}): Promise<void> {
  const directory = options.directory ?? process.cwd();
  
  try {
    const existingConfig = await detectExistingConfiguration(directory);
    
    if (existingConfig.exists) {
      const shouldProceed = await handleReinitialization(existingConfig.files);
      if (!shouldProceed) {
        printCancelled();
        return;
      }
    }
    
    const result = await runInitWizard(directory);
    
    if (result.cancelled) {
      return;
    }
    
    // Generate agent files based on configuration
    const mvpAgents = result.configuration.agents.filter(agent => isMVPAgent(agent.name));

    if (mvpAgents.length > 0) {
      console.log(`\n${COLORS.cyan}Generating agent files...${COLORS.reset}`);

      const generatorConfigs = convertToGeneratorConfigs(mvpAgents);
      const generationResults = await generateMVPAgents(generatorConfigs, directory);

      // Report generation results
      const created = generationResults.filter(r => r.created);
      const updated = generationResults.filter(r => r.updated);
      const errors = generationResults.filter(r => r.error);

      if (created.length > 0) {
        console.log(`${COLORS.green}  Created ${created.length} agent file(s)${COLORS.reset}`);
      }
      if (updated.length > 0) {
        console.log(`${COLORS.yellow}  Updated ${updated.length} agent file(s)${COLORS.reset}`);
      }
      if (errors.length > 0) {
        console.log(`${COLORS.red}  Failed to generate ${errors.length} agent file(s):${COLORS.reset}`);
        for (const error of errors) {
          console.log(`${COLORS.red}    - ${error.path}: ${error.error}${COLORS.reset}`);
        }
      }
    }

    printSuccessSummary(result);
    
  } catch (error) {
    if (isExitPromptError(error)) {
      printCancelled();
      return;
    }
    
    printError(`Initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

interface ExistingConfigResult {
  exists: boolean;
  files: string[];
}

async function detectExistingConfiguration(directory: string): Promise<ExistingConfigResult> {
  const files: string[] = [];
  
  const agentsMdPath = join(directory, AGENTS_MD_FILE);
  if (await fileExists(agentsMdPath)) {
    const stats = await stat(agentsMdPath);
    files.push(`AGENTS.md (modified ${formatRelativeDate(stats.mtime)})`);
  }
  
  const opencodePath = join(directory, "opencode.json");
  if (await fileExists(opencodePath)) {
    const stats = await stat(opencodePath);
    files.push(`opencode.json (modified ${formatRelativeDate(stats.mtime)})`);
  }
  
  const opencodeDir = join(directory, OPENCODE_DIR);
  if (await directoryExists(opencodeDir)) {
    const agentDir = join(opencodeDir, "agent");
    if (await directoryExists(agentDir)) {
      try {
        const agentFiles = await readdir(agentDir);
        const mdFiles = agentFiles.filter(f => f.endsWith(".md"));
        if (mdFiles.length > 0) {
          files.push(`.opencode/agent/ (${mdFiles.length} files)`);
        }
      } catch {
        // Directory read failed, ignore
      }
    }
    
    const pluginDir = join(opencodeDir, "plugin");
    if (await directoryExists(pluginDir)) {
      files.push(`.opencode/plugin/`);
    }
  }
  
  return {
    exists: files.length > 0,
    files,
  };
}

async function handleReinitialization(existingFiles: string[]): Promise<boolean> {
  printMergeMode(existingFiles);
  
  const proceed = await confirm({
    message: "Proceed with merge?",
    default: true,
  });
  
  return proceed;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}

function isExitPromptError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "name" in error &&
    (error as { name: string }).name === "ExitPromptError"
  );
}

/**
 * Convert wizard agent configs to generator agent configs
 */
function convertToGeneratorConfigs(wizardConfigs: WizardAgentConfig[]): GeneratorAgentConfig[] {
  return wizardConfigs.map(config => ({
    name: config.name,
    displayName: config.displayName,
    model: config.selectedModel,
    enabled: true,
  }));
}
