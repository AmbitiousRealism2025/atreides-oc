#!/usr/bin/env node

import { runInitCommand } from "./init.js";
import { runDoctorCommand } from "./doctor.js";
import { runUpdateCommand } from "./update.js";

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
  init      Initialize Atreides in current project
  doctor    Verify installation and diagnose issues
  update    Update to latest version (preserves customizations)

Update Options:
  -f, --force      Force update even if already up to date
  --no-backup      Skip backup creation before update

Global Options:
  -v, --version    Show version
  -h, --help       Show this help
`);
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
