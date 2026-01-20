/**
 * Restore CLI Command
 *
 * Restores a project from a checkpoint.
 * Usage:
 *   atreides-opencode restore <checkpoint-id> [options]
 */

import { confirm } from "@inquirer/prompts";
import {
  restoreCheckpoint,
  getCheckpoint,
  getLatestCheckpoint,
  formatSize,
  formatTimestamp,
  type RestoreOptions,
} from "../lib/checkpoint-manager.js";

// =============================================================================
// Constants for display
// =============================================================================

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

const ICONS = {
  restore: "\u21BA",
  file: "\u25AA",
  info: "\u2139",
  warning: "\u26A0",
  error: "\u2717",
  check: "\u2713",
};

// =============================================================================
// Types
// =============================================================================

export interface RestoreCommandOptions {
  /** Checkpoint ID to restore */
  checkpointId?: string;
  /** Target directory (defaults to original project path) */
  targetDirectory?: string;
  /** Current working directory (for finding latest checkpoint) */
  directory?: string;
  /** Restore only specific files */
  files?: string[];
  /** Skip unchanged files */
  skipUnchanged?: boolean;
  /** Create backup before restoring */
  backup?: boolean;
  /** Skip confirmation prompt */
  force?: boolean;
  /** Output format */
  format?: "text" | "json";
  /** Restore latest checkpoint */
  latest?: boolean;
}

export interface RestoreCommandResult {
  /** Whether the restore succeeded */
  success: boolean;
  /** Checkpoint ID that was restored */
  checkpointId?: string;
  /** Number of files restored */
  filesRestored: number;
  /** Number of files skipped */
  filesSkipped: number;
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// Display Functions
// =============================================================================

function displayRestorePreview(
  checkpointId: string,
  name: string,
  fileCount: number,
  totalSize: number,
  createdAt: number,
  targetPath: string
): void {
  console.log(`\n${COLORS.bold}${COLORS.blue}${ICONS.restore} Restore Preview${COLORS.reset}`);
  console.log(`${COLORS.dim}─────────────────────────────────────${COLORS.reset}`);
  console.log(`Checkpoint: ${COLORS.cyan}${name}${COLORS.reset} (${checkpointId})`);
  console.log(`Created:    ${formatTimestamp(createdAt)}`);
  console.log(`Files:      ${fileCount} (${formatSize(totalSize)})`);
  console.log(`Target:     ${targetPath}`);
  console.log(`${COLORS.dim}─────────────────────────────────────${COLORS.reset}`);
}

function displayRestoreSuccess(filesRestored: number, filesSkipped: number, restoredFiles: string[]): void {
  console.log(`\n${COLORS.green}${ICONS.check} Restore completed successfully!${COLORS.reset}`);
  console.log(`${COLORS.dim}Files restored: ${filesRestored}${COLORS.reset}`);

  if (filesSkipped > 0) {
    console.log(`${COLORS.dim}Files skipped (unchanged): ${filesSkipped}${COLORS.reset}`);
  }

  if (restoredFiles.length > 0 && restoredFiles.length <= 10) {
    console.log(`\n${COLORS.cyan}Restored files:${COLORS.reset}`);
    for (const file of restoredFiles) {
      console.log(`  ${ICONS.file} ${file}`);
    }
  } else if (restoredFiles.length > 10) {
    console.log(`\n${COLORS.cyan}Restored files:${COLORS.reset}`);
    for (const file of restoredFiles.slice(0, 10)) {
      console.log(`  ${ICONS.file} ${file}`);
    }
    console.log(`  ${COLORS.dim}... and ${restoredFiles.length - 10} more${COLORS.reset}`);
  }
}

function displayError(message: string): void {
  console.error(`\n${COLORS.red}${ICONS.error} Error: ${message}${COLORS.reset}`);
}

function displayWarning(message: string): void {
  console.log(`\n${COLORS.yellow}${ICONS.warning} Warning: ${message}${COLORS.reset}`);
}

function displayAvailableCheckpoints(): void {
  console.log(`\n${COLORS.dim}Run 'atreides-opencode checkpoint list' to see available checkpoints.${COLORS.reset}`);
}

// =============================================================================
// Command Implementation
// =============================================================================

/**
 * Run the restore command.
 */
export async function runRestoreCommand(
  options: RestoreCommandOptions = {}
): Promise<RestoreCommandResult> {
  const format = options.format ?? "text";
  const directory = options.directory ?? process.cwd();

  try {
    let checkpointId = options.checkpointId;

    // If --latest flag, get the latest checkpoint
    if (options.latest && !checkpointId) {
      const latest = await getLatestCheckpoint(directory);

      if (!latest) {
        const error = "No checkpoints found for this project";
        if (format === "text") {
          displayError(error);
          displayAvailableCheckpoints();
        }
        return {
          success: false,
          filesRestored: 0,
          filesSkipped: 0,
          error,
        };
      }

      checkpointId = latest.id;
    }

    // Validate checkpoint ID is provided
    if (!checkpointId) {
      const error = "Checkpoint ID is required. Use --latest to restore the most recent checkpoint.";
      if (format === "text") {
        displayError(error);
        displayAvailableCheckpoints();
      }
      return {
        success: false,
        filesRestored: 0,
        filesSkipped: 0,
        error,
      };
    }

    // Get checkpoint details
    const checkpoint = await getCheckpoint(checkpointId);

    if (!checkpoint) {
      const error = `Checkpoint not found: ${checkpointId}`;
      if (format === "text") {
        displayError(error);
        displayAvailableCheckpoints();
      }
      return {
        success: false,
        filesRestored: 0,
        filesSkipped: 0,
        error,
      };
    }

    const targetPath = options.targetDirectory ?? checkpoint.projectPath;

    // Show preview and confirm
    if (format === "text" && !options.force) {
      displayRestorePreview(
        checkpoint.id,
        checkpoint.name,
        checkpoint.files.length,
        checkpoint.totalSize,
        checkpoint.createdAt,
        targetPath
      );

      if (options.backup) {
        console.log(`\n${COLORS.cyan}${ICONS.info} A backup will be created before restoring.${COLORS.reset}`);
      }

      displayWarning("This will overwrite files in the target directory.");

      const confirmed = await confirm({
        message: "Proceed with restore?",
        default: false,
      });

      if (!confirmed) {
        console.log(`\n${COLORS.dim}Restore cancelled.${COLORS.reset}`);
        return {
          success: false,
          checkpointId,
          filesRestored: 0,
          filesSkipped: 0,
          error: "User cancelled",
        };
      }
    }

    // Perform restore
    const restoreOptions: RestoreOptions = {
      skipUnchanged: options.skipUnchanged ?? true,
      backup: options.backup ?? false,
    };
    if (options.files) {
      restoreOptions.files = options.files;
    }

    const result = await restoreCheckpoint(checkpointId, targetPath, restoreOptions);

    if (!result.success) {
      const errorMsg = result.error ?? "Failed to restore checkpoint";
      if (format === "text") {
        displayError(errorMsg);
      }
      return {
        success: false,
        checkpointId,
        filesRestored: 0,
        filesSkipped: 0,
        error: errorMsg,
      };
    }

    if (format === "text") {
      displayRestoreSuccess(result.filesRestored, result.filesSkipped, result.restoredFiles);
    } else {
      console.log(JSON.stringify({
        success: true,
        checkpointId,
        filesRestored: result.filesRestored,
        filesSkipped: result.filesSkipped,
        restoredFiles: result.restoredFiles,
      }, null, 2));
    }

    return {
      success: true,
      checkpointId,
      filesRestored: result.filesRestored,
      filesSkipped: result.filesSkipped,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (format === "text") {
      displayError(errorMessage);
    }

    return {
      success: false,
      filesRestored: 0,
      filesSkipped: 0,
      error: errorMessage,
    };
  }
}

/**
 * Print help for the restore command.
 */
export function printRestoreHelp(): void {
  console.log(`
${COLORS.bold}atreides-opencode restore${COLORS.reset}
Restore a project from a checkpoint.

${COLORS.bold}Usage:${COLORS.reset}
  atreides-opencode restore <checkpoint-id> [options]
  atreides-opencode restore --latest [options]

${COLORS.bold}Options:${COLORS.reset}
  --latest              Restore the most recent checkpoint
  -t, --target <dir>    Target directory (defaults to original project path)
  --files <files...>    Restore only specific files
  --skip-unchanged      Skip files that haven't changed (default: true)
  -b, --backup          Create backup before restoring
  -f, --force           Skip confirmation prompt
  --json                Output as JSON

${COLORS.bold}Examples:${COLORS.reset}
  atreides-opencode restore chk_20240115_143022_abc1
  atreides-opencode restore --latest
  atreides-opencode restore chk_xxx --backup
  atreides-opencode restore chk_xxx -t /path/to/target
  atreides-opencode restore chk_xxx --files src/index.ts package.json
`);
}
