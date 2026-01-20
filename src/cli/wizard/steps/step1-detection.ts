import { confirm, select } from "@inquirer/prompts";
import { detectProjectType, getSupportedProjectTypes, type ProjectDetection, type ProjectType } from "../../project-detection.js";
import { printStep, COLORS, ICONS } from "../prompts.js";

export interface Step1Result {
  detection: ProjectDetection;
  confirmed: boolean;
}

export async function runStep1Detection(directory: string): Promise<Step1Result> {
  printStep(1, 5, "Project Detection");
  
  console.log(`${ICONS.detect} Detecting project type...\n`);
  
  const detection = await detectProjectType(directory);
  
  if (detection.type === "generic" && detection.evidence.length === 0) {
    console.log(`${COLORS.yellow}${ICONS.warning}${COLORS.reset} Could not detect project type`);
    console.log(`${COLORS.dim}Defaulting to: Generic${COLORS.reset}\n`);
    
    const manualType = await selectProjectTypeManually();
    
    return {
      detection: {
        ...detection,
        type: manualType.type,
        displayName: manualType.displayName,
        language: manualType.language,
        confidence: "medium",
      },
      confirmed: true,
    };
  }
  
  console.log(`Detected: ${COLORS.bold}${detection.displayName} project${COLORS.reset}`);
  console.log(`  Found: ${detection.evidence.join(", ")}`);
  console.log(`  Language: ${detection.language}`);
  if (detection.packageManager) {
    console.log(`  Package Manager: ${detection.packageManager}`);
  }
  console.log();
  
  const isCorrect = await confirm({
    message: "Is this correct?",
    default: true,
  });
  
  if (!isCorrect) {
    const manualType = await selectProjectTypeManually();
    return {
      detection: {
        ...detection,
        type: manualType.type,
        displayName: manualType.displayName,
        language: manualType.language,
        confidence: "medium",
      },
      confirmed: true,
    };
  }
  
  return {
    detection,
    confirmed: true,
  };
}

async function selectProjectTypeManually(): Promise<{ type: ProjectType; displayName: string; language: string }> {
  const types = getSupportedProjectTypes();
  
  console.log(`\n${COLORS.dim}Available types:${COLORS.reset}`);
  
  const selected = await select({
    message: "Select project type",
    choices: types.map((t, index) => ({
      name: `${index + 1}. ${t.displayName}`,
      value: t.type,
      description: t.description,
    })),
  });
  
  const selectedType = types.find(t => t.type === selected)!;
  
  const languageMap: Record<ProjectType, string> = {
    typescript: "TypeScript",
    node: "JavaScript",
    python: "Python",
    go: "Go",
    rust: "Rust",
    generic: "Unknown",
  };
  
  return {
    type: selected,
    displayName: selectedType.displayName,
    language: languageMap[selected],
  };
}
