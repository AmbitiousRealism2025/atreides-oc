import { printWelcome, printCancelled, printPostWizardSummary, printDivider } from "./prompts.js";
import { runStep1Detection } from "./steps/step1-detection.js";
import { runStep2ModeSelection } from "./steps/step2-mode.js";
import { runStep3ModelConfiguration } from "./steps/step3-models.js";
import { runStep4PermissionConfiguration } from "./steps/step4-permissions.js";
import { runStep5Confirmation, getModeDescription } from "./steps/step5-confirmation.js";
import type { WizardConfiguration, WizardResult } from "./types.js";

export type { WizardConfiguration, WizardResult } from "./types.js";

export async function runInitWizard(directory: string): Promise<WizardResult> {
  printWelcome();
  
  const step1 = await runStep1Detection(directory);
  
  printDivider();
  const step2 = await runStep2ModeSelection();
  
  printDivider();
  const step3 = await runStep3ModelConfiguration();
  
  printDivider();
  const step4 = await runStep4PermissionConfiguration(step1.detection.type);
  
  const configuration: WizardConfiguration = {
    projectType: step1.detection.type,
    installationMode: step2.mode,
    agents: step3.agents,
    permissions: step4.permissions,
  };
  if (step1.detection.packageManager !== undefined) {
    configuration.packageManager = step1.detection.packageManager;
  }
  
  printDivider();
  const step5 = await runStep5Confirmation(configuration);
  
  if (!step5.confirmed) {
    printCancelled();
    return {
      configuration,
      filesToCreate: [],
      cancelled: true,
    };
  }
  
  return {
    configuration,
    filesToCreate: step5.filesToCreate,
    cancelled: false,
  };
}

export function printSuccessSummary(result: WizardResult): void {
  const enabledPermissions = countEnabledPermissions(result.configuration);
  const totalPermissions = countTotalPermissions(result.configuration);
  
  printPostWizardSummary({
    projectType: result.configuration.projectType,
    installationMode: getModeDescription(result.configuration.installationMode),
    agentCount: result.configuration.agents.length,
    enabledPermissions,
    restrictedPermissions: totalPermissions - enabledPermissions,
    files: result.filesToCreate,
  });
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
