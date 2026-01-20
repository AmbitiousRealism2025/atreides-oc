/**
 * Checkpoint CLI Command
 *
 * Creates, lists, and manages project checkpoints.
 * Usage:
 *   atreides-opencode checkpoint [action] [options]
 *
 * Actions:
 *   create    Create a new checkpoint (default)
 *   list      List all checkpoints for the project
 *   show      Show details of a specific checkpoint
 *   delete    Delete a checkpoint
 */

import {
  createCheckpoint,
  listCheckpoints,
  getCheckpoint,
  deleteCheckpoint,
  formatSize,
  formatTimestamp,
  type Checkpoint,
  type CheckpointOptions,
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
  checkpoint: "\u2713",
  folder: "\u25A1",
  file: "\u25AA",
  info: "\u2139",
  warning: "\u26A0",
  error: "\u2717",
};

// =============================================================================
// Types
// =============================================================================

export interface CheckpointCommandOptions {
  /** Project directory (defaults to cwd) */
  directory?: string;
  /** Action to perform (defaults to create) */
  action?: "create" | "list" | "show" | "delete";
  /** Checkpoint name (for create) */
  name?: string;
  /** Checkpoint description (for create) */
  description?: string;
  /** Checkpoint ID (for show/delete) */
  checkpointId?: string;
  /** Output format (defaults to text) */
  format?: "text" | "json";
  /** Show verbose output (defaults to false) */
  verbose?: boolean;
}

export interface CheckpointCommandResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Action that was performed */
  action: string;
  /** Result data */
  data?: Checkpoint | Checkpoint[] | { deleted: boolean };
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// Display Functions
// =============================================================================

function displayCheckpoint(checkpoint: Checkpoint, verbose: boolean = false): void {
  console.log(`\n${COLORS.bold}${COLORS.blue}${ICONS.checkpoint} ${checkpoint.name}${COLORS.reset}`);
  console.log(`${COLORS.dim}ID: ${checkpoint.id}${COLORS.reset}`);
  console.log(`${COLORS.dim}Created: ${formatTimestamp(checkpoint.createdAt)}${COLORS.reset}`);
  console.log(`${COLORS.dim}Project: ${checkpoint.projectName}${COLORS.reset}`);
  console.log(`${COLORS.dim}Files: ${checkpoint.files.length} (${formatSize(checkpoint.totalSize)})${COLORS.reset}`);

  if (checkpoint.description) {
    console.log(`${COLORS.dim}Description: ${checkpoint.description}${COLORS.reset}`);
  }

  if (verbose && checkpoint.files.length > 0) {
    console.log(`\n${COLORS.cyan}Files:${COLORS.reset}`);
    const maxFiles = 20;
    const filesToShow = checkpoint.files.slice(0, maxFiles);

    for (const file of filesToShow) {
      console.log(`  ${ICONS.file} ${file.relativePath} (${formatSize(file.size)})`);
    }

    if (checkpoint.files.length > maxFiles) {
      console.log(`  ${COLORS.dim}... and ${checkpoint.files.length - maxFiles} more files${COLORS.reset}`);
    }
  }
}

function displayCheckpointList(checkpoints: Checkpoint[]): void {
  if (checkpoints.length === 0) {
    console.log(`\n${COLORS.yellow}${ICONS.info} No checkpoints found for this project.${COLORS.reset}`);
    console.log(`${COLORS.dim}Create one with: atreides-opencode checkpoint create${COLORS.reset}`);
    return;
  }

  console.log(`\n${COLORS.bold}${COLORS.blue}${ICONS.folder} Checkpoints (${checkpoints.length})${COLORS.reset}\n`);

  // Table header
  console.log(
    `${COLORS.dim}${"ID".padEnd(24)} ${"Name".padEnd(30)} ${"Created".padEnd(20)} ${"Files".padEnd(8)} ${"Size".padEnd(10)}${COLORS.reset}`
  );
  console.log(`${COLORS.dim}${"─".repeat(95)}${COLORS.reset}`);

  for (const checkpoint of checkpoints) {
    const id = checkpoint.id.slice(0, 22).padEnd(24);
    const name = checkpoint.name.slice(0, 28).padEnd(30);
    const created = new Date(checkpoint.createdAt).toLocaleDateString().padEnd(20);
    const files = String(checkpoint.files.length).padEnd(8);
    const size = formatSize(checkpoint.totalSize).padEnd(10);

    console.log(`${id} ${name} ${created} ${files} ${size}`);
  }
}

function displayCreateSuccess(checkpoint: Checkpoint): void {
  console.log(`\n${COLORS.green}${ICONS.checkpoint} Checkpoint created successfully!${COLORS.reset}`);
  displayCheckpoint(checkpoint, false);
  console.log(`\n${COLORS.dim}Restore with: atreides-opencode restore ${checkpoint.id}${COLORS.reset}`);
}

function displayDeleteSuccess(checkpointId: string): void {
  console.log(`\n${COLORS.green}${ICONS.checkpoint} Checkpoint deleted: ${checkpointId}${COLORS.reset}`);
}

function displayError(message: string): void {
  console.error(`\n${COLORS.red}${ICONS.error} Error: ${message}${COLORS.reset}`);
}

// =============================================================================
// Command Implementation
// =============================================================================

/**
 * Run the checkpoint command.
 */
export async function runCheckpointCommand(
  options: CheckpointCommandOptions = {}
): Promise<CheckpointCommandResult> {
  const directory = options.directory ?? process.cwd();
  const action = options.action ?? "create";
  const format = options.format ?? "text";

  try {
    switch (action) {
      case "create": {
        const createOptions: CheckpointOptions = {};
        if (options.name) {
          createOptions.name = options.name;
        }
        if (options.description) {
          createOptions.description = options.description;
        }

        const result = await createCheckpoint(directory, createOptions);

        if (!result.success || !result.checkpoint) {
          const errorMsg = result.error ?? "Failed to create checkpoint";
          if (format === "text") {
            displayError(errorMsg);
          }
          return {
            success: false,
            action: "create",
            error: errorMsg,
          };
        }

        if (format === "text") {
          displayCreateSuccess(result.checkpoint);
        } else {
          console.log(JSON.stringify(result.checkpoint, null, 2));
        }

        return {
          success: true,
          action: "create",
          data: result.checkpoint,
        };
      }

      case "list": {
        const checkpoints = await listCheckpoints(directory);

        if (format === "text") {
          displayCheckpointList(checkpoints);
        } else {
          console.log(JSON.stringify(checkpoints, null, 2));
        }

        return {
          success: true,
          action: "list",
          data: checkpoints,
        };
      }

      case "show": {
        if (!options.checkpointId) {
          const error = "Checkpoint ID is required for 'show' action";
          if (format === "text") {
            displayError(error);
          }
          return {
            success: false,
            action: "show",
            error,
          };
        }

        const checkpoint = await getCheckpoint(options.checkpointId);

        if (!checkpoint) {
          const error = `Checkpoint not found: ${options.checkpointId}`;
          if (format === "text") {
            displayError(error);
          }
          return {
            success: false,
            action: "show",
            error,
          };
        }

        if (format === "text") {
          displayCheckpoint(checkpoint, options.verbose ?? false);
        } else {
          console.log(JSON.stringify(checkpoint, null, 2));
        }

        return {
          success: true,
          action: "show",
          data: checkpoint,
        };
      }

      case "delete": {
        if (!options.checkpointId) {
          const error = "Checkpoint ID is required for 'delete' action";
          if (format === "text") {
            displayError(error);
          }
          return {
            success: false,
            action: "delete",
            error,
          };
        }

        const deleted = await deleteCheckpoint(options.checkpointId);

        if (!deleted) {
          const error = `Failed to delete checkpoint: ${options.checkpointId}`;
          if (format === "text") {
            displayError(error);
          }
          return {
            success: false,
            action: "delete",
            error,
          };
        }

        if (format === "text") {
          displayDeleteSuccess(options.checkpointId);
        } else {
          console.log(JSON.stringify({ deleted: true, checkpointId: options.checkpointId }));
        }

        return {
          success: true,
          action: "delete",
          data: { deleted: true },
        };
      }

      default: {
        const error = `Unknown action: ${action}`;
        if (format === "text") {
          displayError(error);
        }
        return {
          success: false,
          action: action as string,
          error,
        };
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (format === "text") {
      displayError(errorMessage);
    }

    return {
      success: false,
      action,
      error: errorMessage,
    };
  }
}

/**
 * Print help for the checkpoint command.
 */
export function printCheckpointHelp(): void {
  console.log(`
${COLORS.bold}atreides-opencode checkpoint${COLORS.reset}
Create, list, and manage project checkpoints.

${COLORS.bold}Usage:${COLORS.reset}
  atreides-opencode checkpoint [action] [options]

${COLORS.bold}Actions:${COLORS.reset}
  create    Create a new checkpoint (default)
  list      List all checkpoints for the project
  show      Show details of a specific checkpoint
  delete    Delete a checkpoint

${COLORS.bold}Options:${COLORS.reset}
  -n, --name <name>     Name for the checkpoint (create only)
  -d, --desc <desc>     Description for the checkpoint (create only)
  -i, --id <id>         Checkpoint ID (show/delete only)
  --json                Output as JSON
  -v, --verbose         Show verbose output

${COLORS.bold}Examples:${COLORS.reset}
  atreides-opencode checkpoint                    # Create checkpoint
  atreides-opencode checkpoint create -n "v1.0"   # Create named checkpoint
  atreides-opencode checkpoint list               # List all checkpoints
  atreides-opencode checkpoint show -i chk_xxx    # Show checkpoint details
  atreides-opencode checkpoint delete -i chk_xxx  # Delete checkpoint
`);
}
