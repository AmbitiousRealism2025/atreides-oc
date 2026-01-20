import { select, confirm } from "@inquirer/prompts";
import { writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { COLORS, ICONS } from "./wizard/prompts.js";
import type { Conflict, MergeResult } from "../lib/merge.js";

export type ResolutionChoice = "keep" | "use-new" | "merge" | "skip";

export interface ResolutionResult {
  file: string;
  choice: ResolutionChoice;
  resolved: boolean;
}

/**
 * Display conflict details to the user
 */
export function displayConflict(conflict: Conflict): void {
  console.log(`\n${COLORS.yellow}${ICONS.warning} Merge conflict in ${COLORS.bold}${conflict.file}${COLORS.reset}`);
  console.log(`${COLORS.dim}${"─".repeat(60)}${COLORS.reset}`);

  if (conflict.conflictingSections && conflict.conflictingSections.length > 0) {
    console.log(`\n${COLORS.cyan}Conflicting sections:${COLORS.reset}`);
    for (const section of conflict.conflictingSections) {
      console.log(`  ${ICONS.arrow} ${section}`);
    }
  }

  console.log(`\n${COLORS.cyan}Description:${COLORS.reset} ${conflict.description}`);

  // Show a preview of the differences
  console.log(`\n${COLORS.cyan}Your version:${COLORS.reset}`);
  console.log(`${COLORS.dim}${truncateContent(conflict.userContent, 300)}${COLORS.reset}`);

  console.log(`\n${COLORS.cyan}New template:${COLORS.reset}`);
  console.log(`${COLORS.dim}${truncateContent(conflict.newTemplate, 300)}${COLORS.reset}`);

  console.log(`\n${COLORS.dim}${"─".repeat(60)}${COLORS.reset}`);
}

/**
 * Truncate content for preview display
 */
function truncateContent(content: string, maxLength: number): string {
  const lines = content.split("\n").slice(0, 10);
  let result = lines.join("\n");

  if (result.length > maxLength) {
    result = result.slice(0, maxLength) + "...";
  } else if (content.split("\n").length > 10) {
    result += "\n...";
  }

  return result;
}

/**
 * Prompt user for conflict resolution choice
 */
export async function promptResolution(_conflict: Conflict): Promise<ResolutionChoice> {
  const answer = await select<ResolutionChoice>({
    message: "Choose resolution:",
    choices: [
      {
        name: `${COLORS.green}1. Keep your version${COLORS.reset} ${COLORS.dim}(preserve customizations)${COLORS.reset}`,
        value: "keep",
      },
      {
        name: `${COLORS.yellow}2. Use new template${COLORS.reset} ${COLORS.dim}(get latest updates)${COLORS.reset}`,
        value: "use-new",
      },
      {
        name: `${COLORS.cyan}3. Merge manually${COLORS.reset} ${COLORS.dim}(open editor)${COLORS.reset}`,
        value: "merge",
      },
      {
        name: `${COLORS.dim}4. Skip this file${COLORS.reset} ${COLORS.dim}(resolve later)${COLORS.reset}`,
        value: "skip",
      },
    ],
  });

  return answer;
}

/**
 * Open editor for manual merge
 */
async function openEditor(filePath: string): Promise<boolean> {
  const editorCmd = process.env.EDITOR || process.env.VISUAL || "vi";

  return new Promise((resolve) => {
    const child = spawn(editorCmd, [filePath], {
      stdio: "inherit",
    });

    child.on("close", (code) => {
      resolve(code === 0);
    });

    child.on("error", () => {
      console.log(`${COLORS.yellow}${ICONS.warning} Could not open editor. Please edit manually: ${filePath}${COLORS.reset}`);
      resolve(false);
    });
  });
}

/**
 * Resolve a single conflict interactively
 */
export async function resolveConflict(conflict: Conflict): Promise<ResolutionResult> {
  displayConflict(conflict);

  const choice = await promptResolution(conflict);

  switch (choice) {
    case "keep":
      console.log(`${COLORS.green}${ICONS.success}${COLORS.reset} Kept your version of ${conflict.file}`);
      return { file: conflict.file, choice, resolved: true };

    case "use-new":
      await writeFile(conflict.file, conflict.newTemplate, "utf-8");
      console.log(`${COLORS.green}${ICONS.success}${COLORS.reset} Updated ${conflict.file} to new template`);
      return { file: conflict.file, choice, resolved: true };

    case "merge":
      // Create temporary merge file with conflict markers
      const mergeContent = createMergeFile(conflict);
      await writeFile(conflict.file, mergeContent, "utf-8");

      console.log(`\n${COLORS.cyan}${ICONS.info}${COLORS.reset} Opening ${conflict.file} for manual merge...`);
      console.log(`${COLORS.dim}Look for <<<<<<< and >>>>>>> markers${COLORS.reset}\n`);

      const success = await openEditor(conflict.file);

      if (success) {
        console.log(`${COLORS.green}${ICONS.success}${COLORS.reset} Manual merge completed for ${conflict.file}`);
        return { file: conflict.file, choice, resolved: true };
      } else {
        console.log(`${COLORS.yellow}${ICONS.warning}${COLORS.reset} Please complete the merge manually in ${conflict.file}`);
        return { file: conflict.file, choice, resolved: false };
      }

    case "skip":
      console.log(`${COLORS.dim}Skipped ${conflict.file}. You can resolve this manually later.${COLORS.reset}`);
      return { file: conflict.file, choice, resolved: false };

    default:
      return { file: conflict.file, choice: "skip", resolved: false };
  }
}

/**
 * Create a merge file with git-style conflict markers
 */
function createMergeFile(conflict: Conflict): string {
  return `<<<<<<< YOUR VERSION
${conflict.userContent}
=======
${conflict.newTemplate}
>>>>>>> NEW TEMPLATE
`;
}

/**
 * Resolve all conflicts interactively
 */
export async function resolveAllConflicts(conflicts: Conflict[]): Promise<ResolutionResult[]> {
  const results: ResolutionResult[] = [];

  console.log(`\n${COLORS.yellow}${ICONS.warning} Found ${conflicts.length} conflict(s) that need resolution${COLORS.reset}\n`);

  for (let i = 0; i < conflicts.length; i++) {
    const conflict = conflicts[i];
    if (!conflict) continue;
    console.log(`\n${COLORS.dim}Conflict ${i + 1} of ${conflicts.length}${COLORS.reset}`);
    const result = await resolveConflict(conflict);
    results.push(result);
  }

  return results;
}

/**
 * Display update summary
 */
export function displayUpdateSummary(
  results: MergeResult[],
  resolutions: ResolutionResult[],
  backupPath?: string
): void {
  console.log(`\n${COLORS.cyan}${COLORS.bold}Update Summary${COLORS.reset}\n`);
  console.log(`${COLORS.dim}${"─".repeat(60)}${COLORS.reset}`);

  const updated = results.filter(r => r.action === "updated");
  const merged = results.filter(r => r.action === "merged");
  const preserved = results.filter(r => r.action === "preserved");
  // Note: Conflicts in results are handled via the resolutions parameter
  // We filter them here to avoid counting them in other categories

  if (updated.length > 0) {
    console.log(`\n${COLORS.green}${ICONS.success} Updated files:${COLORS.reset}`);
    for (const result of updated) {
      console.log(`  ${result.file}${result.details ? ` ${COLORS.dim}(${result.details})${COLORS.reset}` : ""}`);
    }
  }

  if (merged.length > 0) {
    console.log(`\n${COLORS.cyan}${ICONS.success} Merged files:${COLORS.reset}`);
    for (const result of merged) {
      console.log(`  ${result.file}${result.details ? ` ${COLORS.dim}(${result.details})${COLORS.reset}` : ""}`);
    }
  }

  if (preserved.length > 0) {
    console.log(`\n${COLORS.dim}${ICONS.info} Preserved files:${COLORS.reset}`);
    for (const result of preserved) {
      console.log(`  ${COLORS.dim}${result.file}${result.details ? ` (${result.details})` : ""}${COLORS.reset}`);
    }
  }

  if (resolutions.length > 0) {
    const resolved = resolutions.filter(r => r.resolved);
    const skipped = resolutions.filter(r => !r.resolved);

    if (resolved.length > 0) {
      console.log(`\n${COLORS.yellow}${ICONS.warning} Resolved conflicts:${COLORS.reset}`);
      for (const result of resolved) {
        const choiceLabel = result.choice === "keep" ? "kept your version" :
          result.choice === "use-new" ? "used new template" : "merged manually";
        console.log(`  ${result.file} ${COLORS.dim}(${choiceLabel})${COLORS.reset}`);
      }
    }

    if (skipped.length > 0) {
      console.log(`\n${COLORS.red}${ICONS.warning} Unresolved conflicts:${COLORS.reset}`);
      for (const result of skipped) {
        console.log(`  ${result.file} ${COLORS.dim}(needs manual resolution)${COLORS.reset}`);
      }
    }
  }

  if (backupPath) {
    console.log(`\n${COLORS.dim}${ICONS.folder} Backup created: ${backupPath}${COLORS.reset}`);
  }

  console.log(`\n${COLORS.dim}${"─".repeat(60)}${COLORS.reset}`);

  // Final status
  const unresolvedCount = resolutions.filter(r => !r.resolved).length;
  if (unresolvedCount > 0) {
    console.log(`\n${COLORS.yellow}${ICONS.warning} ${unresolvedCount} file(s) need manual resolution${COLORS.reset}`);
    console.log(`${COLORS.dim}Run 'atreides doctor' to verify your configuration${COLORS.reset}`);
  } else {
    console.log(`\n${COLORS.green}${ICONS.success} Update completed successfully!${COLORS.reset}`);
  }
}

/**
 * Prompt user to confirm update
 */
export async function confirmUpdate(
  currentVersion: string,
  newVersion: string
): Promise<boolean> {
  console.log(`\n${COLORS.cyan}${ICONS.package} Update available${COLORS.reset}`);
  console.log(`  Current version: ${COLORS.yellow}${currentVersion}${COLORS.reset}`);
  console.log(`  Latest version:  ${COLORS.green}${newVersion}${COLORS.reset}\n`);

  return confirm({
    message: "Proceed with update?",
    default: true,
  });
}
