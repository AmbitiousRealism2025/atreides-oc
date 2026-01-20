/**
 * Uninstall CLI Command
 *
 * Cleanly removes Atreides from a project, including all generated files and configurations.
 * Usage:
 *   atreides-opencode uninstall [options]
 */

import { rm } from "node:fs/promises";
import { access, stat } from "node:fs/promises";
import { join } from "node:path";
import { confirm } from "@inquirer/prompts";
import {
  OPENCODE_DIR,
  AGENTS_MD_FILE,
  OPENCODE_JSON_FILE,
} from "../lib/constants.js";
import { createBackup, formatBackupPath } from "../lib/backup.js";
import { COLORS, ICONS, printHeader } from "./wizard/prompts.js";

// =============================================================================
// Constants
// =============================================================================

const MANIFEST_FILE = ".atreides-manifest.json";

// =============================================================================
// Types
// =============================================================================

export interface UninstallCommandOptions {
  /** Target directory (defaults to current working directory) */
  directory?: string;
  /** Skip confirmation prompt */
  force?: boolean;
  /** Skip backup creation */
  skipBackup?: boolean;
  /** Output format */
  format?: "text" | "json";
}

export interface UninstallCommandResult {
  /** Whether the uninstall succeeded */
  success: boolean;
  /** Number of files removed */
  filesRemoved: number;
  /** List of removed files/directories */
  removedItems: string[];
  /** Backup path if created */
  backupPath?: string;
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// Display Functions
// =============================================================================

function displayUninstallPreview(
  directory: string,
  filesToRemove: string[]
): void {
  console.log(`\n${COLORS.bold}${COLORS.red}${ICONS.warning} Uninstall Preview${COLORS.reset}`);
  console.log(`${COLORS.dim}${"─".repeat(50)}${COLORS.reset}`);
  console.log(`Directory: ${COLORS.cyan}${directory}${COLORS.reset}`);
  console.log(`\n${COLORS.bold}Files/directories to be removed:${COLORS.reset}`);
  for (const file of filesToRemove) {
    console.log(`  ${COLORS.red}${ICONS.cross}${COLORS.reset} ${file}`);
  }
  console.log(`${COLORS.dim}${"─".repeat(50)}${COLORS.reset}`);
}

function displayBackupCreated(backupPath: string): void {
  console.log(`\n${COLORS.green}${ICONS.success}${COLORS.reset} Backup created: ${COLORS.cyan}${formatBackupPath(backupPath)}${COLORS.reset}`);
}

function displayUninstallSuccess(
  filesRemoved: number,
  removedItems: string[],
  backupPath?: string
): void {
  console.log(`\n${COLORS.green}${ICONS.success} Uninstall completed successfully!${COLORS.reset}`);
  console.log(`${COLORS.dim}Items removed: ${filesRemoved}${COLORS.reset}`);

  if (removedItems.length > 0 && removedItems.length <= 10) {
    console.log(`\n${COLORS.cyan}Removed:${COLORS.reset}`);
    for (const item of removedItems) {
      console.log(`  ${ICONS.check} ${item}`);
    }
  } else if (removedItems.length > 10) {
    console.log(`\n${COLORS.cyan}Removed:${COLORS.reset}`);
    for (const item of removedItems.slice(0, 10)) {
      console.log(`  ${ICONS.check} ${item}`);
    }
    console.log(`  ${COLORS.dim}... and ${removedItems.length - 10} more${COLORS.reset}`);
  }

  if (backupPath) {
    console.log(`\n${COLORS.yellow}${ICONS.info}${COLORS.reset} Backup saved to: ${COLORS.cyan}${formatBackupPath(backupPath)}${COLORS.reset}`);
    console.log(`${COLORS.dim}Run 'npx atreides restore --latest' to restore if needed.${COLORS.reset}`);
  }

  console.log(`\n${COLORS.dim}Atreides has been removed from this project.${COLORS.reset}`);
  console.log(`${COLORS.dim}Run 'npx atreides init' to reinstall.${COLORS.reset}`);
}

function displayError(message: string): void {
  console.error(`\n${COLORS.red}${ICONS.error} Error: ${message}${COLORS.reset}`);
}

function displayWarning(message: string): void {
  console.log(`\n${COLORS.yellow}${ICONS.warning} Warning: ${message}${COLORS.reset}`);
}

function displayCancelled(): void {
  console.log(`\n${COLORS.dim}Uninstall cancelled. No files were removed.${COLORS.reset}`);
}

// =============================================================================
// Utility Functions
// =============================================================================

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

/**
 * Detect what Atreides files/directories exist in the project
 */
async function detectAtreidesFiles(directory: string): Promise<string[]> {
  const filesToCheck = [
    AGENTS_MD_FILE,
    OPENCODE_JSON_FILE,
    MANIFEST_FILE,
    OPENCODE_DIR,
  ];

  const existingFiles: string[] = [];

  for (const file of filesToCheck) {
    const fullPath = join(directory, file);
    if (file === OPENCODE_DIR) {
      if (await directoryExists(fullPath)) {
        existingFiles.push(file);
      }
    } else {
      if (await fileExists(fullPath)) {
        existingFiles.push(file);
      }
    }
  }

  return existingFiles;
}

/**
 * Remove a file or directory
 */
async function removeItem(
  directory: string,
  item: string
): Promise<{ success: boolean; error?: string }> {
  const fullPath = join(directory, item);

  try {
    await rm(fullPath, { recursive: true, force: true });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// Command Implementation
// =============================================================================

/**
 * Run the uninstall command.
 */
export async function runUninstallCommand(
  options: UninstallCommandOptions = {}
): Promise<UninstallCommandResult> {
  const format = options.format ?? "text";
  const directory = options.directory ?? process.cwd();

  try {
    // Detect existing Atreides files
    const existingFiles = await detectAtreidesFiles(directory);

    if (existingFiles.length === 0) {
      const error = "No Atreides installation found in this directory";
      if (format === "text") {
        displayError(error);
        console.log(`${COLORS.dim}Run 'npx atreides init' to initialize Atreides.${COLORS.reset}`);
      }
      return {
        success: false,
        filesRemoved: 0,
        removedItems: [],
        error,
      };
    }

    // Show preview and confirm (unless --force)
    if (format === "text" && !options.force) {
      printHeader("Atreides OpenCode Uninstall");
      displayUninstallPreview(directory, existingFiles);

      if (!options.skipBackup) {
        console.log(`\n${COLORS.cyan}${ICONS.info}${COLORS.reset} A backup will be created before uninstalling.`);
      } else {
        displayWarning("Backup will be skipped (--no-backup flag).");
      }

      displayWarning("This will permanently remove Atreides configuration files.");

      const confirmed = await confirm({
        message: "Proceed with uninstall?",
        default: false,
      });

      if (!confirmed) {
        displayCancelled();
        return {
          success: false,
          filesRemoved: 0,
          removedItems: [],
          error: "User cancelled",
        };
      }
    }

    // Create backup before removal (unless --no-backup)
    let backupPath: string | undefined;

    if (!options.skipBackup) {
      if (format === "text") {
        console.log(`\n${COLORS.cyan}Creating backup...${COLORS.reset}`);
      }

      const backupResult = await createBackup(directory, "uninstall");

      if (backupResult.success) {
        backupPath = backupResult.backupPath;
        if (format === "text") {
          displayBackupCreated(backupPath);
        }
      } else {
        // Backup failed - ask user if they want to continue
        if (format === "text" && !options.force) {
          displayWarning(`Backup failed: ${backupResult.error}`);

          const continueWithoutBackup = await confirm({
            message: "Continue without backup?",
            default: false,
          });

          if (!continueWithoutBackup) {
            displayCancelled();
            return {
              success: false,
              filesRemoved: 0,
              removedItems: [],
              error: "Backup failed and user cancelled",
            };
          }
        }
      }
    }

    // Remove files
    if (format === "text") {
      console.log(`\n${COLORS.cyan}Removing files...${COLORS.reset}`);
    }

    const removedItems: string[] = [];
    const errors: string[] = [];

    for (const item of existingFiles) {
      const result = await removeItem(directory, item);
      if (result.success) {
        removedItems.push(item);
      } else {
        errors.push(`Failed to remove ${item}: ${result.error}`);
      }
    }

    // Handle partial failure
    if (errors.length > 0 && removedItems.length === 0) {
      const errorMsg = `Failed to remove files: ${errors.join(", ")}`;
      if (format === "text") {
        displayError(errorMsg);
      }
      const result: UninstallCommandResult = {
        success: false,
        filesRemoved: 0,
        removedItems: [],
        error: errorMsg,
      };
      if (backupPath) {
        result.backupPath = backupPath;
      }
      return result;
    }

    if (errors.length > 0) {
      if (format === "text") {
        displayWarning(`Some files could not be removed: ${errors.join(", ")}`);
      }
    }

    // Display success
    if (format === "text") {
      displayUninstallSuccess(removedItems.length, removedItems, backupPath);
    } else {
      console.log(JSON.stringify({
        success: true,
        filesRemoved: removedItems.length,
        removedItems,
        backupPath,
        errors: errors.length > 0 ? errors : undefined,
      }, null, 2));
    }

    const successResult: UninstallCommandResult = {
      success: true,
      filesRemoved: removedItems.length,
      removedItems,
    };
    if (backupPath) {
      successResult.backupPath = backupPath;
    }
    return successResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Handle user cancellation (Ctrl+C during prompts)
    if (isExitPromptError(error)) {
      if (format === "text") {
        displayCancelled();
      }
      return {
        success: false,
        filesRemoved: 0,
        removedItems: [],
        error: "User cancelled",
      };
    }

    if (format === "text") {
      displayError(errorMessage);
    }

    return {
      success: false,
      filesRemoved: 0,
      removedItems: [],
      error: errorMessage,
    };
  }
}

/**
 * Check if an error is an ExitPromptError (user pressed Ctrl+C)
 */
function isExitPromptError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "name" in error &&
    (error as { name: string }).name === "ExitPromptError"
  );
}

/**
 * Print help for the uninstall command.
 */
export function printUninstallHelp(): void {
  console.log(`
${COLORS.bold}atreides-opencode uninstall${COLORS.reset}
Cleanly remove Atreides from a project.

${COLORS.bold}Usage:${COLORS.reset}
  atreides-opencode uninstall [options]

${COLORS.bold}Options:${COLORS.reset}
  -f, --force        Skip confirmation prompt
  --no-backup        Skip backup creation before uninstall
  --json             Output as JSON

${COLORS.bold}What gets removed:${COLORS.reset}
  - AGENTS.md              Agent orchestration rules
  - opencode.json          Configuration file
  - .atreides-manifest.json  File tracking manifest
  - .opencode/             Directory containing agents, skills, plugins

${COLORS.bold}What is preserved:${COLORS.reset}
  - .atreides-backup/      Previous backups (use --no-backup to skip new backup)
  - Any non-Atreides files

${COLORS.bold}Examples:${COLORS.reset}
  atreides-opencode uninstall          Interactive uninstall with backup
  atreides-opencode uninstall --force  Skip confirmation
  atreides-opencode uninstall --no-backup  Uninstall without backup
  atreides-opencode uninstall --json   JSON output for scripting
`);
}
