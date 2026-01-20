import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkForUpdate,
  updatePackage,
} from "../lib/version.js";
import {
  loadManifest,
  saveManifest,
  createManifest,
  createFileEntry,
  createMarkdownFileEntry,
  extractMarkdownSections,
  type CustomizationManifest,
  type MarkdownFileEntry,
  type FileEntry,
} from "../lib/manifest.js";
import { createBackup, formatBackupPath } from "../lib/backup.js";
import {
  mergeAgentsMd,
  mergeAgentFile,
  mergeConfig,
  type MergeResult,
  type Conflict,
} from "../lib/merge.js";
import {
  resolveAllConflicts,
  displayUpdateSummary,
  confirmUpdate,
  type ResolutionResult,
} from "./conflict-resolution.js";
import { COLORS, ICONS, printError, printInfo, printWarning } from "./wizard/prompts.js";
import {
  OPENCODE_DIR,
  AGENTS_DIR,
  AGENTS_MD_FILE,
  OPENCODE_JSON_FILE,
} from "../lib/constants.js";

export interface UpdateOptions {
  directory?: string;
  force?: boolean;
  skipBackup?: boolean;
}

export interface UpdateResult {
  success: boolean;
  version?: string;
  mergeResults: MergeResult[];
  resolutions: ResolutionResult[];
  backupPath?: string;
  error?: string;
}

/**
 * Main update command
 */
export async function runUpdateCommand(options: UpdateOptions = {}): Promise<UpdateResult> {
  const directory = options.directory ?? process.cwd();
  const mergeResults: MergeResult[] = [];
  const resolutions: ResolutionResult[] = [];
  let backupPath: string | undefined;

  try {
    console.log(`\n${COLORS.cyan}${ICONS.package} Checking for updates...${COLORS.reset}\n`);

    // 1. Check for updates
    const versionInfo = await checkForUpdate();

    if (!versionInfo.updateAvailable && !options.force) {
      console.log(`${COLORS.green}${ICONS.success} Already up to date!${COLORS.reset}`);
      console.log(`${COLORS.dim}Current version: ${versionInfo.current}${COLORS.reset}\n`);
      return {
        success: true,
        version: versionInfo.current,
        mergeResults: [],
        resolutions: [],
      };
    }

    // Display update info and confirm
    if (versionInfo.updateAvailable) {
      const shouldProceed = await confirmUpdate(versionInfo.current, versionInfo.latest);
      if (!shouldProceed) {
        console.log(`\n${COLORS.yellow}${ICONS.warning} Update cancelled${COLORS.reset}\n`);
        return {
          success: false,
          mergeResults: [],
          resolutions: [],
          error: "User cancelled",
        };
      }
    }

    // 2. Create backup (unless skipped)
    if (!options.skipBackup) {
      console.log(`\n${COLORS.cyan}${ICONS.folder} Creating backup...${COLORS.reset}`);
      const backupResult = await createBackup(directory, versionInfo.current);

      if (backupResult.success) {
        backupPath = formatBackupPath(backupResult.backupPath);
        console.log(`${COLORS.green}${ICONS.success}${COLORS.reset} Backup created: ${COLORS.dim}${backupPath}${COLORS.reset}`);
        console.log(`${COLORS.dim}   ${backupResult.files.length} files backed up${COLORS.reset}`);
      } else {
        printWarning(`Backup failed: ${backupResult.error}`);
        printWarning("Continuing without backup...");
      }
    }

    // 3. Update npm package (if update available)
    if (versionInfo.updateAvailable) {
      console.log(`\n${COLORS.cyan}${ICONS.package} Updating package...${COLORS.reset}`);
      const updateResult = await updatePackage();

      if (!updateResult.success) {
        printError(`Package update failed: ${updateResult.error}`);
        const result: UpdateResult = {
          success: false,
          mergeResults: [],
          resolutions: [],
          error: `Package update failed: ${updateResult.error}`,
        };
        if (backupPath) result.backupPath = backupPath;
        return result;
      }

      console.log(`${COLORS.green}${ICONS.success}${COLORS.reset} Package updated to ${versionInfo.latest}`);
    }

    // 4. Load customization manifest
    console.log(`\n${COLORS.cyan}${ICONS.file} Loading customization manifest...${COLORS.reset}`);
    let manifest = await loadManifest(directory);

    if (!manifest) {
      printInfo("No manifest found. Creating new manifest for tracking...");
      manifest = createManifest(versionInfo.current);
    }

    // 5. Load new templates
    const templates = await loadTemplates();

    // 6. Merge files
    console.log(`\n${COLORS.cyan}${ICONS.file} Merging files...${COLORS.reset}`);
    const conflicts: Conflict[] = [];

    // Merge AGENTS.md
    if (templates.agentsMd) {
      const agentsMdEntry = manifest.files[AGENTS_MD_FILE] as MarkdownFileEntry | undefined;
      const result = await mergeAgentsMd(directory, templates.agentsMd, agentsMdEntry);
      mergeResults.push(result);

      if (result.conflict) {
        conflicts.push(result.conflict);
      } else {
        console.log(`  ${result.action === "updated" ? COLORS.green : COLORS.dim}${ICONS.success}${COLORS.reset} ${AGENTS_MD_FILE} - ${result.details ?? result.action}`);
      }
    }

    // Merge opencode.json
    if (templates.opencodeJson) {
      const result = await mergeConfig(directory, templates.opencodeJson);
      mergeResults.push(result);

      if (result.conflict) {
        conflicts.push(result.conflict);
      } else {
        console.log(`  ${result.action === "updated" ? COLORS.green : COLORS.dim}${ICONS.success}${COLORS.reset} ${OPENCODE_JSON_FILE} - ${result.details ?? result.action}`);
      }
    }

    // Merge agent files
    for (const [fileName, content] of Object.entries(templates.agents)) {
      const agentEntry = manifest.files[`${OPENCODE_DIR}/${AGENTS_DIR}/${fileName}`] as FileEntry | undefined;
      const result = await mergeAgentFile(directory, fileName, content, agentEntry);
      mergeResults.push(result);

      if (result.conflict) {
        conflicts.push(result.conflict);
      } else {
        console.log(`  ${result.action === "updated" ? COLORS.green : COLORS.dim}${ICONS.success}${COLORS.reset} ${fileName} - ${result.details ?? result.action}`);
      }
    }

    // 7. Handle conflicts interactively
    if (conflicts.length > 0) {
      const resolveResults = await resolveAllConflicts(conflicts);
      resolutions.push(...resolveResults);
    }

    // 8. Update manifest
    console.log(`\n${COLORS.cyan}${ICONS.file} Updating manifest...${COLORS.reset}`);
    await updateManifestEntries(directory, manifest, templates, versionInfo.latest);
    await saveManifest(directory, manifest);
    console.log(`${COLORS.green}${ICONS.success}${COLORS.reset} Manifest updated`);

    // 9. Display summary
    displayUpdateSummary(mergeResults, resolutions, backupPath);

    const successResult: UpdateResult = {
      success: true,
      version: versionInfo.latest,
      mergeResults,
      resolutions,
    };
    if (backupPath) successResult.backupPath = backupPath;
    return successResult;
  } catch (error) {
    if (isExitPromptError(error)) {
      console.log(`\n${COLORS.yellow}${ICONS.warning} Update cancelled${COLORS.reset}\n`);
      return {
        success: false,
        mergeResults,
        resolutions,
        error: "User cancelled",
      };
    }

    printError(`Update failed: ${error instanceof Error ? error.message : String(error)}`);
    const errorResult: UpdateResult = {
      success: false,
      mergeResults,
      resolutions,
      error: error instanceof Error ? error.message : String(error),
    };
    if (backupPath) errorResult.backupPath = backupPath;
    return errorResult;
  }
}

/**
 * Load templates from the package
 */
interface Templates {
  agentsMd: string | null;
  opencodeJson: Record<string, unknown> | null;
  agents: Record<string, string>;
}

async function loadTemplates(): Promise<Templates> {
  const templates: Templates = {
    agentsMd: null,
    opencodeJson: null,
    agents: {},
  };

  // Try to find template directory
  // In development, templates are at the project root
  // When installed, they're in node_modules/atreides-opencode/templates
  const possiblePaths = [
    join(process.cwd(), "node_modules", "atreides-opencode", "templates"),
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates"),
  ];

  let templateDir: string | null = null;
  for (const path of possiblePaths) {
    try {
      await readFile(join(path, "agents", "AGENTS.md"), "utf-8");
      templateDir = path;
      break;
    } catch {
      // Try next path
    }
  }

  if (!templateDir) {
    // Templates not found, return defaults
    console.log(`${COLORS.dim}Templates not found, using embedded defaults${COLORS.reset}`);
    templates.agentsMd = getDefaultAgentsMd();
    templates.opencodeJson = getDefaultOpencodeJson();
    return templates;
  }

  // Load AGENTS.md template
  try {
    templates.agentsMd = await readFile(join(templateDir, "agents", "AGENTS.md"), "utf-8");
  } catch {
    templates.agentsMd = getDefaultAgentsMd();
  }

  // Load opencode.json template
  try {
    const content = await readFile(join(templateDir, "opencode.json"), "utf-8");
    templates.opencodeJson = JSON.parse(content);
  } catch {
    templates.opencodeJson = getDefaultOpencodeJson();
  }

  // Load agent files
  try {
    const agentDir = join(templateDir, "agents");
    const files = await import("node:fs/promises").then(fs => fs.readdir(agentDir));

    for (const file of files) {
      if (file.endsWith(".md") && file !== "AGENTS.md") {
        try {
          templates.agents[file] = await readFile(join(agentDir, file), "utf-8");
        } catch {
          // Skip files that can't be read
        }
      }
    }
  } catch {
    // Agent directory doesn't exist
  }

  return templates;
}

/**
 * Update manifest entries for tracked files
 */
async function updateManifestEntries(
  directory: string,
  manifest: CustomizationManifest,
  templates: Templates,
  newVersion: string
): Promise<void> {
  manifest.packageVersion = newVersion;

  // Update AGENTS.md entry
  if (templates.agentsMd) {
    try {
      const currentContent = await readFile(join(directory, AGENTS_MD_FILE), "utf-8");
      const templateSections = extractMarkdownSections(templates.agentsMd);
      const currentSections = extractMarkdownSections(currentContent);

      manifest.files[AGENTS_MD_FILE] = createMarkdownFileEntry(
        AGENTS_MD_FILE,
        templates.agentsMd,
        currentContent,
        templateSections.map(s => ({ ...s, userAdded: false })),
        currentSections.map(s => ({ ...s, userAdded: false }))
      );
    } catch {
      // File doesn't exist
    }
  }

  // Update opencode.json entry
  if (templates.opencodeJson) {
    try {
      const currentContent = await readFile(join(directory, OPENCODE_JSON_FILE), "utf-8");
      const templateContent = JSON.stringify(templates.opencodeJson, null, 2);

      manifest.files[OPENCODE_JSON_FILE] = createFileEntry(
        OPENCODE_JSON_FILE,
        templateContent,
        currentContent
      );
    } catch {
      // File doesn't exist
    }
  }

  // Update agent file entries
  for (const [fileName, templateContent] of Object.entries(templates.agents)) {
    const filePath = `${OPENCODE_DIR}/${AGENTS_DIR}/${fileName}`;
    try {
      const currentContent = await readFile(join(directory, filePath), "utf-8");
      manifest.files[filePath] = createFileEntry(filePath, templateContent, currentContent);
    } catch {
      // File doesn't exist
    }
  }
}

/**
 * Default AGENTS.md content
 */
function getDefaultAgentsMd(): string {
  return `# Atreides OpenCode Agent Configuration

## Overview

This file configures the AI orchestration behavior for your project.

## Workflow Rules

- Follow established patterns in the codebase
- Use proper error handling
- Write tests for new functionality

## Agent Delegation

Delegate tasks to specialized agents when appropriate:
- Use Explore agent for codebase discovery
- Use Build agent for compilation tasks
- Use Plan agent for architecture decisions

## Security

- Never commit secrets or credentials
- Review all external dependencies
- Follow security best practices
`;
}

/**
 * Default opencode.json configuration
 */
function getDefaultOpencodeJson(): Record<string, unknown> {
  return {
    atreides: {
      identity: {
        personaName: "Muad'Dib",
        responsePrefix: true,
        delegationAnnouncements: true,
      },
      workflow: {
        enablePhaseTracking: true,
        strictTodoEnforcement: true,
        autoEscalateOnError: true,
      },
      security: {
        enableObfuscationDetection: true,
        blockedPatterns: [],
        warningPatterns: [],
        blockedFiles: [],
      },
    },
  };
}

/**
 * Check if error is an ExitPromptError (user cancelled)
 */
function isExitPromptError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "name" in error &&
    (error as { name: string }).name === "ExitPromptError"
  );
}
