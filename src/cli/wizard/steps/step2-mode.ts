import { select } from "@inquirer/prompts";
import { printStep, COLORS, ICONS } from "../prompts.js";
import { getFilesToCreate, type InstallationMode } from "../types.js";

export interface Step2Result {
  mode: InstallationMode;
}

export async function runStep2ModeSelection(): Promise<Step2Result> {
  printStep(2, 5, "Installation Mode");
  
  console.log(`${ICONS.package} Choose installation mode:\n`);
  
  const mode = await select<InstallationMode>({
    message: "Select mode",
    choices: [
      {
        name: `${COLORS.bold}Minimal${COLORS.reset}`,
        value: "minimal" as InstallationMode,
        description: `AGENTS.md only - for existing projects with custom setup\n       Files: ${getFilesToCreate("minimal").join(", ")}`,
      },
      {
        name: `${COLORS.bold}Standard${COLORS.reset} (recommended)`,
        value: "standard" as InstallationMode,
        description: `Full configuration without agent delegation\n       Files: AGENTS.md, opencode.json, .opencode/plugin/, .opencode/agent/`,
      },
      {
        name: `${COLORS.bold}Full${COLORS.reset}`,
        value: "full" as InstallationMode,
        description: `Everything including agent delegation and all skills\n       Files: All of the above + .opencode/skill/`,
      },
    ],
    default: "standard",
  });
  
  console.log(`\n${COLORS.green}${ICONS.success}${COLORS.reset} Selected: ${mode} mode`);
  
  return { mode };
}
