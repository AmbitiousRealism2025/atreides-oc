import { confirm } from "@inquirer/prompts";
import { printStep, COLORS, ICONS } from "../prompts.js";
import type { WizardConfiguration, InstallationMode } from "../types.js";
import { getFilesToCreate } from "../types.js";

export interface Step5Result {
  confirmed: boolean;
  filesToCreate: string[];
}

export async function runStep5Confirmation(config: WizardConfiguration): Promise<Step5Result> {
  printStep(5, 5, "Confirmation & Summary");
  
  console.log(`${ICONS.clipboard} Configuration Summary\n`);
  
  const filesToCreate = getFilesToCreate(config.installationMode);
  
  const enabledPermissions = countEnabledPermissions(config);
  const totalPermissions = countTotalPermissions(config);
  
  console.log(`${COLORS.bold}Project Type:${COLORS.reset} ${config.projectType}`);
  console.log(`${COLORS.bold}Installation Mode:${COLORS.reset} ${config.installationMode}`);
  console.log(`${COLORS.bold}Models Configured:${COLORS.reset} ${config.agents.length} agents`);
  console.log(`${COLORS.bold}Permissions:${COLORS.reset} ${enabledPermissions} enabled, ${totalPermissions - enabledPermissions} restricted`);
  
  console.log(`\n${COLORS.bold}Files to be created:${COLORS.reset}`);
  for (const file of filesToCreate) {
    console.log(`  ${COLORS.green}${ICONS.check}${COLORS.reset} ${file}`);
  }
  
  console.log();
  
  const proceed = await confirm({
    message: "Proceed with initialization?",
    default: true,
  });
  
  return {
    confirmed: proceed,
    filesToCreate,
  };
}

function countEnabledPermissions(config: WizardConfiguration): number {
  const { permissions } = config;
  return [
    ...permissions.fileOperations,
    ...permissions.shellCommands,
    ...permissions.networkAccess,
    ...permissions.gitOperations,
  ].filter(p => p.checked).length;
}

function countTotalPermissions(config: WizardConfiguration): number {
  const { permissions } = config;
  return (
    permissions.fileOperations.length +
    permissions.shellCommands.length +
    permissions.networkAccess.length +
    permissions.gitOperations.length
  );
}

export function getModeDescription(mode: InstallationMode): string {
  switch (mode) {
    case "minimal":
      return "AGENTS.md only";
    case "standard":
      return "Full config, no delegation";
    case "full":
      return "Everything including delegation";
    default:
      return mode;
  }
}
