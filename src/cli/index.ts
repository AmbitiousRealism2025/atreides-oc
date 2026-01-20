#!/usr/bin/env node

import { runInitCommand } from "./init.js";
import { runDoctorCommand } from "./doctor.js";
import { runUpdateCommand } from "./update.js";
import { runMaturityCommand } from "./maturity.js";
import { runCheckpointCommand, printCheckpointHelp } from "./checkpoint.js";
import { runRestoreCommand, printRestoreHelp } from "./restore.js";
import { runUninstallCommand, printUninstallHelp } from "./uninstall.js";
import { runMigrateCommand, printMigrateHelp } from "./migrate.js";

const VERSION = "0.1.0";
const NAME = "atreides-opencode";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "--version":
    case "-v":
      console.log(`${NAME} v${VERSION}`);
      break;

    case "--help":
    case "-h":
    case undefined:
      printHelp();
      break;

    case "init":
      await runInitCommand();
      break;

    case "doctor":
      await runDoctorCommand();
      break;

    case "update": {
      const forceFlag = args.includes("--force") || args.includes("-f");
      const skipBackupFlag = args.includes("--no-backup");
      await runUpdateCommand({ force: forceFlag, skipBackup: skipBackupFlag });
      break;
    }

    case "maturity": {
      const jsonFlag = args.includes("--json");
      const verboseFlag = args.includes("--verbose") || args.includes("-v");
      const dirIndex = args.findIndex(a => a === "--dir" || a === "-d");
      const directory = dirIndex !== -1 && args[dirIndex + 1] ? args[dirIndex + 1] : undefined;
      const options: Parameters<typeof runMaturityCommand>[0] = {
        format: jsonFlag ? "json" : "text",
        verbose: verboseFlag,
      };
      if (directory !== undefined) {
        options.directory = directory;
      }
      await runMaturityCommand(options);
      break;
    }

    case "checkpoint": {
      // Handle checkpoint help
      if (args.includes("--help") || args.includes("-h")) {
        printCheckpointHelp();
        break;
      }

      // Parse checkpoint action
      const action = args[1] as "create" | "list" | "show" | "delete" | undefined;
      const validActions = ["create", "list", "show", "delete"];
      const checkpointAction = validActions.includes(action ?? "") ? action : "create";

      // Parse options
      const nameIndex = args.findIndex(a => a === "--name" || a === "-n");
      const name = nameIndex !== -1 && args[nameIndex + 1] ? args[nameIndex + 1] : undefined;

      const descIndex = args.findIndex(a => a === "--desc" || a === "-d");
      const description = descIndex !== -1 && args[descIndex + 1] ? args[descIndex + 1] : undefined;

      const idIndex = args.findIndex(a => a === "--id" || a === "-i");
      const checkpointId = idIndex !== -1 && args[idIndex + 1] ? args[idIndex + 1] : undefined;

      const jsonOutput = args.includes("--json");
      const verbose = args.includes("--verbose") || args.includes("-v");

      // Build options object with only defined properties
      const checkpointOptions: Parameters<typeof runCheckpointCommand>[0] = {
        action: checkpointAction ?? "create",
        format: jsonOutput ? "json" : "text",
        verbose,
      };
      if (name) checkpointOptions.name = name;
      if (description) checkpointOptions.description = description;
      if (checkpointId) checkpointOptions.checkpointId = checkpointId;

      await runCheckpointCommand(checkpointOptions);
      break;
    }

    case "restore": {
      // Handle restore help
      if (args.includes("--help") || args.includes("-h")) {
        printRestoreHelp();
        break;
      }

      // Parse checkpoint ID (first positional arg after "restore")
      const checkpointId = args[1] && !args[1].startsWith("-") ? args[1] : undefined;

      // Parse options
      const targetIndex = args.findIndex(a => a === "--target" || a === "-t");
      const targetDirectory = targetIndex !== -1 && args[targetIndex + 1] ? args[targetIndex + 1] : undefined;

      const latest = args.includes("--latest");
      const skipUnchanged = !args.includes("--no-skip-unchanged");
      const backup = args.includes("--backup") || args.includes("-b");
      const force = args.includes("--force") || args.includes("-f");
      const jsonOutput = args.includes("--json");

      // Parse files to restore
      const filesIndex = args.findIndex(a => a === "--files");
      let files: string[] | undefined;
      if (filesIndex !== -1) {
        files = [];
        for (let i = filesIndex + 1; i < args.length; i++) {
          if (args[i]?.startsWith("-")) break;
          files.push(args[i]!);
        }
      }

      // Build options object with only defined properties
      const restoreOptions: Parameters<typeof runRestoreCommand>[0] = {
        latest,
        skipUnchanged,
        backup,
        force,
        format: jsonOutput ? "json" : "text",
      };
      if (checkpointId) restoreOptions.checkpointId = checkpointId;
      if (targetDirectory) restoreOptions.targetDirectory = targetDirectory;
      if (files && files.length > 0) restoreOptions.files = files;

      await runRestoreCommand(restoreOptions);
      break;
    }

    case "uninstall": {
      if (args.includes("--help") || args.includes("-h")) {
        printUninstallHelp();
        break;
      }

      const force = args.includes("--force") || args.includes("-f");
      const skipBackup = args.includes("--no-backup");
      const jsonOutput = args.includes("--json");

      await runUninstallCommand({
        force,
        skipBackup,
        format: jsonOutput ? "json" : "text",
      });
      break;
    }

    case "migrate": {
      if (args.includes("--help") || args.includes("-h")) {
        printMigrateHelp();
        break;
      }

      const force = args.includes("--force") || args.includes("-f");
      const skipBackup = args.includes("--no-backup");
      const dryRun = args.includes("--dry-run");
      const jsonOutput = args.includes("--json");

      const targetIndex = args.findIndex(a => a === "--target");
      const targetVersion = targetIndex !== -1 && args[targetIndex + 1] ? args[targetIndex + 1] : undefined;

      const migrateOptions: Parameters<typeof runMigrateCommand>[0] = {
        force,
        skipBackup,
        dryRun,
        format: jsonOutput ? "json" : "text",
      };
      if (targetVersion) migrateOptions.targetVersion = targetVersion;

      await runMigrateCommand(migrateOptions);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

function printHelp(): void {
  console.log(`
${NAME} v${VERSION}
AI orchestration plugin for OpenCode

Usage:
  atreides-opencode <command> [options]

Commands:
  init        Initialize Atreides in current project
  doctor      Verify installation and diagnose issues
  update      Update to latest version (preserves customizations)
  migrate     Migration wizard for major version upgrades
  maturity    Assess project maturity score (0-13 points)
  checkpoint  Create, list, and manage project checkpoints
  restore     Restore project from a checkpoint
  uninstall   Remove Atreides from current project

Update Options:
  -f, --force      Force update even if already up to date
  --no-backup      Skip backup creation before update

Maturity Options:
  --json           Output results as JSON
  --verbose, -v    Show detailed analysis
  -d, --dir <dir>  Analyze specific directory

Checkpoint Options:
  create           Create a new checkpoint (default)
  list             List all checkpoints for the project
  show             Show details of a specific checkpoint
  delete           Delete a checkpoint
  -n, --name       Name for the checkpoint (create only)
  -i, --id         Checkpoint ID (show/delete only)
  --json           Output as JSON

Restore Options:
  <checkpoint-id>  Checkpoint ID to restore
  --latest         Restore the most recent checkpoint
  -t, --target     Target directory
  -b, --backup     Create backup before restoring
  -f, --force      Skip confirmation prompt

Uninstall Options:
  -f, --force      Skip confirmation prompt
  --no-backup      Skip backup creation before uninstall
  --json           Output as JSON

Migrate Options:
  -f, --force          Skip confirmation prompts
  --no-backup          Skip backup creation
  --dry-run            Preview changes without applying
  --target <version>   Target version to migrate to
  --json               Output as JSON

Global Options:
  -v, --version    Show version
  -h, --help       Show this help
`);
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
