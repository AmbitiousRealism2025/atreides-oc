import { checkbox } from "@inquirer/prompts";
import { printStep, COLORS, ICONS } from "../prompts.js";
import type { ProjectType } from "../../project-detection.js";
import { createDefaultPermissions, type PermissionItem, type WizardConfiguration } from "../types.js";

export interface Step4Result {
  permissions: WizardConfiguration["permissions"];
}

export async function runStep4PermissionConfiguration(projectType: ProjectType): Promise<Step4Result> {
  printStep(4, 5, "Permission Configuration");
  
  console.log(`${ICONS.lock} Configure permissions\n`);
  console.log(`${COLORS.dim}Select which operations Atreides can perform.`);
  console.log(`Recommendations based on ${projectType} project.${COLORS.reset}\n`);
  
  const defaults = createDefaultPermissions(projectType);
  
  const fileOps = await selectPermissions(
    "File Operations",
    defaults.fileOperations
  );
  
  const shellOps = await selectPermissions(
    "Shell Commands",
    defaults.shellCommands
  );
  
  const networkOps = await selectPermissions(
    "Network Access",
    defaults.networkAccess
  );
  
  const gitOps = await selectPermissions(
    "Git Operations",
    defaults.gitOperations
  );
  
  console.log(`\n${COLORS.green}${ICONS.success}${COLORS.reset} Permission configuration complete`);
  
  const enabledCount = [...fileOps, ...shellOps, ...networkOps, ...gitOps].filter(p => p.checked).length;
  const totalCount = fileOps.length + shellOps.length + networkOps.length + gitOps.length;
  
  console.log(`${COLORS.dim}   ${enabledCount} enabled, ${totalCount - enabledCount} restricted${COLORS.reset}`);
  
  return {
    permissions: {
      fileOperations: fileOps,
      shellCommands: shellOps,
      networkAccess: networkOps,
      gitOperations: gitOps,
    },
  };
}

async function selectPermissions(
  category: string,
  items: PermissionItem[]
): Promise<PermissionItem[]> {
  console.log(`\n${COLORS.bold}${category}:${COLORS.reset}`);
  
  const choices = items.map(item => {
    let prefix = "";
    if (item.dangerLevel === "dangerous") {
      prefix = `${COLORS.red}[!]${COLORS.reset} `;
    } else if (item.dangerLevel === "caution") {
      prefix = `${COLORS.yellow}[~]${COLORS.reset} `;
    }
    
    return {
      name: `${prefix}${item.label}`,
      value: item.id,
      checked: item.checked,
    };
  });
  
  const selected = await checkbox({
    message: `Select ${category.toLowerCase()}`,
    choices,
    pageSize: 10,
  });
  
  return items.map(item => ({
    ...item,
    checked: selected.includes(item.id),
  }));
}
