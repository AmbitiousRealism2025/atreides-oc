/**
 * Migration Wizard CLI Command
 *
 * Provides guided migration path for upgrading between major versions with breaking changes.
 * Supports automatic transformations where possible and manual guidance for complex changes.
 *
 * Usage:
 *   atreides-opencode migrate [options]
 */

import { readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { confirm } from "@inquirer/prompts";
import {
  OPENCODE_DIR,
  AGENTS_MD_FILE,
  OPENCODE_JSON_FILE,
  PACKAGE_VERSION,
} from "../lib/constants.js";
import { createBackup, formatBackupPath } from "../lib/backup.js";
import { loadManifest } from "../lib/manifest.js";
import { compareVersions } from "../lib/version.js";
import { COLORS, ICONS, printHeader, printSuccess, printError, printWarning, printDivider } from "./wizard/prompts.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Severity level for breaking changes
 */
export type BreakingChangeSeverity = "critical" | "major" | "minor";

/**
 * Describes a breaking change between versions
 */
export interface BreakingChange {
  /** Unique identifier for this change */
  id: string;
  /** Version where this breaking change was introduced */
  introducedIn: string;
  /** Human-readable title */
  title: string;
  /** Detailed description of what changed */
  description: string;
  /** Severity level */
  severity: BreakingChangeSeverity;
  /** Whether this change can be automatically migrated */
  automatable: boolean;
  /** Files affected by this change */
  affectedFiles: string[];
  /** Migration guidance for manual changes */
  manualGuidance?: string;
}

/**
 * Transformation function signature
 */
export type TransformationFn = (
  content: string,
  projectPath: string
) => Promise<{ success: boolean; result: string; details?: string }>;

/**
 * Defines an automatic transformation
 */
export interface Transformation {
  /** Breaking change ID this transformation addresses */
  breakingChangeId: string;
  /** File pattern this transformation applies to */
  filePattern: string;
  /** Transformation function */
  transform: TransformationFn;
}

/**
 * Result of applying a single transformation
 */
export interface TransformationResult {
  file: string;
  breakingChangeId: string;
  success: boolean;
  details?: string;
  error?: string;
}

/**
 * Options for the migration wizard command
 */
export interface MigrateCommandOptions {
  /** Target directory (defaults to current working directory) */
  directory?: string;
  /** Skip confirmation prompts */
  force?: boolean;
  /** Skip backup creation */
  skipBackup?: boolean;
  /** Target version to migrate to (defaults to current package version) */
  targetVersion?: string;
  /** Output format */
  format?: "text" | "json";
  /** Dry run - show what would be changed without applying */
  dryRun?: boolean;
}

/**
 * Result of the migration command
 */
export interface MigrateCommandResult {
  /** Whether the migration succeeded */
  success: boolean;
  /** Version migrated from */
  fromVersion: string;
  /** Version migrated to */
  toVersion: string;
  /** Breaking changes detected */
  breakingChanges: BreakingChange[];
  /** Transformations applied */
  transformations: TransformationResult[];
  /** Backup path if created */
  backupPath?: string;
  /** Error message if failed */
  error?: string;
  /** Manual steps required */
  manualStepsRequired: string[];
}

// =============================================================================
// Breaking Change Registry
// =============================================================================

/**
 * Registry of all known breaking changes across versions.
 * Add new entries here when introducing breaking changes.
 */
const BREAKING_CHANGES: BreakingChange[] = [
  // Version 1.0.0 breaking changes (example for future use)
  {
    id: "config-restructure-1.0",
    introducedIn: "1.0.0",
    title: "Configuration structure reorganization",
    description:
      "The configuration in opencode.json has been reorganized. The 'atreides' key now uses nested objects for identity, workflow, security, logging, thinkMode, and notifications.",
    severity: "major",
    automatable: true,
    affectedFiles: [OPENCODE_JSON_FILE],
    manualGuidance:
      "Review your opencode.json and ensure all custom settings are under the correct nested keys.",
  },
  {
    id: "agents-md-format-1.0",
    introducedIn: "1.0.0",
    title: "AGENTS.md format standardization",
    description:
      "AGENTS.md now uses standardized section headers. Custom sections are preserved but may need review.",
    severity: "minor",
    automatable: false,
    affectedFiles: [AGENTS_MD_FILE],
    manualGuidance:
      "Review AGENTS.md and ensure your custom sections use proper markdown headers (## Section Name).",
  },
  {
    id: "agent-files-location-1.0",
    introducedIn: "1.0.0",
    title: "Agent files moved to .opencode/agent/",
    description:
      "Individual agent definition files are now stored in .opencode/agent/ directory instead of being embedded in AGENTS.md.",
    severity: "major",
    automatable: true,
    affectedFiles: [".opencode/agent/*.md"],
  },
  // Version 2.0.0 breaking changes (placeholder for future)
  {
    id: "skill-context-types-2.0",
    introducedIn: "2.0.0",
    title: "Skill context types renamed",
    description:
      "Skill context types have been renamed from 'main'/'fork' to 'primary'/'isolated' for clarity.",
    severity: "minor",
    automatable: true,
    affectedFiles: [".opencode/skill/**/SKILL.md"],
  },
];

// =============================================================================
// Transformation Registry
// =============================================================================

/**
 * Transformation for config restructuring (1.0.0)
 */
const transformConfigRestructure: TransformationFn = async (content, _projectPath) => {
  try {
    const config = JSON.parse(content) as Record<string, unknown>;

    // Check if already in new format
    if (config.atreides && typeof config.atreides === "object") {
      const atreides = config.atreides as Record<string, unknown>;
      if (atreides.identity && atreides.workflow && atreides.security) {
        return {
          success: true,
          result: content,
          details: "Configuration already in new format",
        };
      }
    }

    // Transform old flat structure to new nested structure
    const oldConfig = config as Record<string, unknown>;
    const newConfig: Record<string, unknown> = { ...config };

    // If there's no atreides key, create default structure
    if (!newConfig.atreides) {
      newConfig.atreides = {
        identity: {
          personaName: (oldConfig.personaName as string) ?? "Muad'Dib",
          responsePrefix: (oldConfig.responsePrefix as boolean) ?? true,
          delegationAnnouncements: (oldConfig.delegationAnnouncements as boolean) ?? true,
        },
        workflow: {
          enablePhaseTracking: (oldConfig.enablePhaseTracking as boolean) ?? true,
          strictTodoEnforcement: (oldConfig.strictTodoEnforcement as boolean) ?? true,
          autoEscalateOnError: (oldConfig.autoEscalateOnError as boolean) ?? true,
        },
        security: {
          enableObfuscationDetection: (oldConfig.enableObfuscationDetection as boolean) ?? true,
          blockedPatterns: (oldConfig.blockedPatterns as string[]) ?? [],
          warningPatterns: (oldConfig.warningPatterns as string[]) ?? [],
          blockedFiles: (oldConfig.blockedFiles as string[]) ?? [],
        },
      };

      delete newConfig.personaName;
      delete newConfig.responsePrefix;
      delete newConfig.delegationAnnouncements;
      delete newConfig.enablePhaseTracking;
      delete newConfig.strictTodoEnforcement;
      delete newConfig.autoEscalateOnError;
      delete newConfig.enableObfuscationDetection;
      delete newConfig.blockedPatterns;
      delete newConfig.warningPatterns;
      delete newConfig.blockedFiles;
    }

    return {
      success: true,
      result: JSON.stringify(newConfig, null, 2),
      details: "Configuration restructured to new nested format",
    };
  } catch (error) {
    return {
      success: false,
      result: content,
      details: `Failed to parse configuration: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

/**
 * Transformation for skill context type renaming (2.0.0)
 */
const transformSkillContextTypes: TransformationFn = async (content, _projectPath) => {
  let result = content;
  let changed = false;

  if (result.includes("context: main")) {
    result = result.replace(/context:\s*main/g, "context: primary");
    changed = true;
  }
  if (result.includes("context: fork")) {
    result = result.replace(/context:\s*fork/g, "context: isolated");
    changed = true;
  }

  return {
    success: true,
    result,
    details: changed
      ? "Context types renamed from main/fork to primary/isolated"
      : "No context type changes needed",
  };
};

/**
 * Registry of automatic transformations
 */
const TRANSFORMATIONS: Transformation[] = [
  {
    breakingChangeId: "config-restructure-1.0",
    filePattern: OPENCODE_JSON_FILE,
    transform: transformConfigRestructure,
  },
  {
    breakingChangeId: "skill-context-types-2.0",
    filePattern: ".opencode/skill/**/SKILL.md",
    transform: transformSkillContextTypes,
  },
];

// =============================================================================
// Version Detection
// =============================================================================

/**
 * Detect the currently installed Atreides version
 */
async function detectInstalledVersion(projectPath: string): Promise<string | null> {
  // Try to read version from manifest
  const manifest = await loadManifest(projectPath);
  if (manifest?.packageVersion) {
    return manifest.packageVersion;
  }

  // Try to detect from opencode.json
  try {
    const configPath = join(projectPath, OPENCODE_JSON_FILE);
    const content = await readFile(configPath, "utf-8");
    const config = JSON.parse(content) as Record<string, unknown>;

    // Check for version marker in config
    if (config._atreidesVersion && typeof config._atreidesVersion === "string") {
      return config._atreidesVersion;
    }

    // Infer version from config structure
    if (config.atreides && typeof config.atreides === "object") {
      const atreides = config.atreides as Record<string, unknown>;
      if (atreides.identity && atreides.workflow) {
        // New structure introduced in 1.0.0
        return "1.0.0";
      }
    }

    // Very old config format
    return "0.1.0";
  } catch {
    // No config file - assume not installed or very old
    return null;
  }
}

/**
 * Check if a file exists
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Atreides is installed in the project
 */
async function isAtreidesInstalled(projectPath: string): Promise<boolean> {
  const agentsMdPath = join(projectPath, AGENTS_MD_FILE);
  const configPath = join(projectPath, OPENCODE_JSON_FILE);
  const opencodeDirPath = join(projectPath, OPENCODE_DIR);

  return (
    (await fileExists(agentsMdPath)) ||
    (await fileExists(configPath)) ||
    (await fileExists(opencodeDirPath))
  );
}

// =============================================================================
// Breaking Change Detection
// =============================================================================

/**
 * Get breaking changes between two versions
 */
function getBreakingChangesBetween(fromVersion: string, toVersion: string): BreakingChange[] {
  return BREAKING_CHANGES.filter((change) => {
    // Change applies if introducedIn is > fromVersion and <= toVersion
    const introducedAfterFrom = compareVersions(change.introducedIn, fromVersion) > 0;
    const introducedBeforeOrAtTo = compareVersions(change.introducedIn, toVersion) <= 0;
    return introducedAfterFrom && introducedBeforeOrAtTo;
  });
}

/**
 * Check which breaking changes affect the current project
 */
async function detectApplicableBreakingChanges(
  projectPath: string,
  breakingChanges: BreakingChange[]
): Promise<BreakingChange[]> {
  const applicable: BreakingChange[] = [];

  for (const change of breakingChanges) {
    // Check if any affected files exist
    for (const pattern of change.affectedFiles) {
      if (pattern.includes("*")) {
        // Glob pattern - just assume it applies for now
        applicable.push(change);
        break;
      } else {
        const filePath = join(projectPath, pattern);
        if (await fileExists(filePath)) {
          applicable.push(change);
          break;
        }
      }
    }
  }

  return applicable;
}

// =============================================================================
// Transformation Engine
// =============================================================================

/**
 * Apply transformations for a specific breaking change
 */
async function applyTransformations(
  projectPath: string,
  breakingChange: BreakingChange,
  dryRun: boolean
): Promise<TransformationResult[]> {
  const results: TransformationResult[] = [];
  const applicableTransformations = TRANSFORMATIONS.filter(
    (t) => t.breakingChangeId === breakingChange.id
  );

  for (const transformation of applicableTransformations) {
    const filePath = join(projectPath, transformation.filePattern);

    try {
      // For glob patterns, we'd need to expand them - for now just handle direct files
      if (transformation.filePattern.includes("*")) {
        results.push({
          file: transformation.filePattern,
          breakingChangeId: breakingChange.id,
          success: true,
          details: "Glob patterns require manual review",
        });
        continue;
      }

      if (!(await fileExists(filePath))) {
        results.push({
          file: transformation.filePattern,
          breakingChangeId: breakingChange.id,
          success: true,
          details: "File does not exist, skipping",
        });
        continue;
      }

      const content = await readFile(filePath, "utf-8");
      const transformed = await transformation.transform(content, projectPath);

      if (transformed.success && transformed.result !== content) {
        if (!dryRun) {
          await writeFile(filePath, transformed.result, "utf-8");
        }
        const resultEntry: TransformationResult = {
          file: transformation.filePattern,
          breakingChangeId: breakingChange.id,
          success: true,
        };
        const detailText = dryRun
          ? `[DRY RUN] Would apply: ${transformed.details ?? "changes"}`
          : transformed.details;
        if (detailText) resultEntry.details = detailText;
        results.push(resultEntry);
      } else {
        results.push({
          file: transformation.filePattern,
          breakingChangeId: breakingChange.id,
          success: true,
          details: transformed.details ?? "No changes needed",
        });
      }
    } catch (error) {
      results.push({
        file: transformation.filePattern,
        breakingChangeId: breakingChange.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

// =============================================================================
// Display Functions
// =============================================================================

function displayMigrationPreview(
  fromVersion: string,
  toVersion: string,
  breakingChanges: BreakingChange[]
): void {
  console.log(`\n${COLORS.bold}${COLORS.cyan}${ICONS.package} Migration Preview${COLORS.reset}`);
  console.log(`${COLORS.dim}${"─".repeat(60)}${COLORS.reset}`);
  console.log(`From: ${COLORS.yellow}v${fromVersion}${COLORS.reset}`);
  console.log(`To:   ${COLORS.green}v${toVersion}${COLORS.reset}`);
  console.log(`${COLORS.dim}${"─".repeat(60)}${COLORS.reset}`);

  if (breakingChanges.length === 0) {
    console.log(`\n${COLORS.green}${ICONS.success} No breaking changes detected!${COLORS.reset}`);
    console.log(`${COLORS.dim}This is a smooth upgrade with no required migrations.${COLORS.reset}`);
    return;
  }

  console.log(`\n${COLORS.bold}Breaking Changes (${breakingChanges.length}):${COLORS.reset}\n`);

  for (const change of breakingChanges) {
    const severityColor =
      change.severity === "critical"
        ? COLORS.red
        : change.severity === "major"
          ? COLORS.yellow
          : COLORS.cyan;
    const severityIcon =
      change.severity === "critical"
        ? ICONS.error
        : change.severity === "major"
          ? ICONS.warning
          : ICONS.info;
    const autoIcon = change.automatable ? COLORS.green + ICONS.check : COLORS.yellow + ICONS.warning;

    console.log(`  ${severityColor}${severityIcon}${COLORS.reset} ${COLORS.bold}${change.title}${COLORS.reset}`);
    console.log(`    ${COLORS.dim}Severity: ${change.severity} | Auto-fix: ${autoIcon}${COLORS.reset}`);
    console.log(`    ${COLORS.dim}${change.description}${COLORS.reset}`);
    console.log(`    ${COLORS.dim}Files: ${change.affectedFiles.join(", ")}${COLORS.reset}\n`);
  }
}

function displayTransformationResults(results: TransformationResult[]): void {
  console.log(`\n${COLORS.bold}Transformation Results:${COLORS.reset}\n`);

  for (const result of results) {
    const icon = result.success ? COLORS.green + ICONS.success : COLORS.red + ICONS.error;
    console.log(`  ${icon}${COLORS.reset} ${result.file}`);
    if (result.details) {
      console.log(`    ${COLORS.dim}${result.details}${COLORS.reset}`);
    }
    if (result.error) {
      console.log(`    ${COLORS.red}Error: ${result.error}${COLORS.reset}`);
    }
  }
}

function displayManualSteps(breakingChanges: BreakingChange[]): void {
  const manualChanges = breakingChanges.filter((c) => !c.automatable && c.manualGuidance);

  if (manualChanges.length === 0) {
    return;
  }

  console.log(`\n${COLORS.yellow}${ICONS.warning} ${COLORS.bold}Manual Steps Required:${COLORS.reset}\n`);

  for (let i = 0; i < manualChanges.length; i++) {
    const change = manualChanges[i]!;
    console.log(`  ${COLORS.bold}${i + 1}. ${change.title}${COLORS.reset}`);
    console.log(`     ${COLORS.dim}${change.manualGuidance}${COLORS.reset}\n`);
  }
}

function displayMigrationSuccess(
  fromVersion: string,
  toVersion: string,
  backupPath?: string
): void {
  console.log(`\n${COLORS.green}${COLORS.bold}${ICONS.success} Migration completed successfully!${COLORS.reset}`);
  console.log(`${COLORS.dim}Upgraded from v${fromVersion} to v${toVersion}${COLORS.reset}`);

  if (backupPath) {
    console.log(`\n${COLORS.cyan}${ICONS.info}${COLORS.reset} Backup saved to: ${COLORS.dim}${formatBackupPath(backupPath)}${COLORS.reset}`);
    console.log(`${COLORS.dim}Run 'npx atreides restore --latest' to restore if needed.${COLORS.reset}`);
  }

  console.log(`\n${COLORS.bold}Next Steps:${COLORS.reset}`);
  console.log(`  1. Review the changes made to your configuration files`);
  console.log(`  2. Run 'npx atreides-opencode doctor' to verify the installation`);
  console.log(`  3. Test your workflows to ensure everything works correctly`);
}

function displayCancelled(): void {
  console.log(`\n${COLORS.dim}Migration cancelled. No files were modified.${COLORS.reset}`);
}

// =============================================================================
// Command Implementation
// =============================================================================

/**
 * Run the migration wizard command
 */
export async function runMigrateCommand(
  options: MigrateCommandOptions = {}
): Promise<MigrateCommandResult> {
  const format = options.format ?? "text";
  const directory = options.directory ?? process.cwd();
  const targetVersion = options.targetVersion ?? PACKAGE_VERSION;
  const dryRun = options.dryRun ?? false;

  const transformationResults: TransformationResult[] = [];
  const manualStepsRequired: string[] = [];
  let backupPath: string | undefined;

  try {
    // Check if Atreides is installed
    if (!(await isAtreidesInstalled(directory))) {
      const error = "No Atreides installation found in this directory";
      if (format === "text") {
        printError(error);
        console.log(`${COLORS.dim}Run 'npx atreides-opencode init' to initialize Atreides.${COLORS.reset}`);
      }
      return {
        success: false,
        fromVersion: "unknown",
        toVersion: targetVersion,
        breakingChanges: [],
        transformations: [],
        manualStepsRequired: [],
        error,
      };
    }

    // Detect installed version
    const installedVersion = await detectInstalledVersion(directory);
    const fromVersion = installedVersion ?? "0.1.0";

    if (format === "text") {
      printHeader("Atreides OpenCode Migration Wizard");
      console.log(`${COLORS.dim}Analyzing your installation...${COLORS.reset}\n`);
    }

    // Check if migration is needed
    const versionComparison = compareVersions(fromVersion, targetVersion);

    if (versionComparison === 0) {
      if (format === "text") {
        printSuccess(`Already at version ${targetVersion}`);
        console.log(`${COLORS.dim}No migration needed.${COLORS.reset}`);
      }
      return {
        success: true,
        fromVersion,
        toVersion: targetVersion,
        breakingChanges: [],
        transformations: [],
        manualStepsRequired: [],
      };
    }

    if (versionComparison > 0) {
      const error = `Cannot downgrade from ${fromVersion} to ${targetVersion}`;
      if (format === "text") {
        printError(error);
        console.log(`${COLORS.dim}Downgrade migrations are not supported.${COLORS.reset}`);
      }
      return {
        success: false,
        fromVersion,
        toVersion: targetVersion,
        breakingChanges: [],
        transformations: [],
        manualStepsRequired: [],
        error,
      };
    }

    // Get breaking changes between versions
    const allBreakingChanges = getBreakingChangesBetween(fromVersion, targetVersion);
    const applicableChanges = await detectApplicableBreakingChanges(directory, allBreakingChanges);

    if (format === "text") {
      displayMigrationPreview(fromVersion, targetVersion, applicableChanges);
    }

    // If no breaking changes, confirm simple update
    if (applicableChanges.length === 0) {
      if (!options.force && format === "text") {
        const proceed = await confirm({
          message: "Proceed with update?",
          default: true,
        });

        if (!proceed) {
          displayCancelled();
          return {
            success: false,
            fromVersion,
            toVersion: targetVersion,
            breakingChanges: [],
            transformations: [],
            manualStepsRequired: [],
            error: "User cancelled",
          };
        }
      }

      // No breaking changes - just update manifest version
      const manifest = await loadManifest(directory);
      if (manifest) {
        manifest.packageVersion = targetVersion;
        const manifestPath = join(directory, ".atreides-manifest.json");
        await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
      }

      if (format === "text") {
        displayMigrationSuccess(fromVersion, targetVersion);
      }

      return {
        success: true,
        fromVersion,
        toVersion: targetVersion,
        breakingChanges: [],
        transformations: [],
        manualStepsRequired: [],
      };
    }

    // Show what will be migrated and confirm
    if (!options.force && format === "text") {
      printDivider();

      const automatableChanges = applicableChanges.filter((c) => c.automatable);
      const manualChanges = applicableChanges.filter((c) => !c.automatable);

      if (automatableChanges.length > 0) {
        console.log(`${COLORS.green}${ICONS.check}${COLORS.reset} ${automatableChanges.length} change(s) can be automatically applied`);
      }
      if (manualChanges.length > 0) {
        console.log(`${COLORS.yellow}${ICONS.warning}${COLORS.reset} ${manualChanges.length} change(s) require manual review`);
      }

      console.log();

      if (dryRun) {
        console.log(`${COLORS.cyan}${ICONS.info}${COLORS.reset} Running in dry-run mode - no changes will be made\n`);
      }

      const proceed = await confirm({
        message: dryRun ? "Run migration analysis?" : "Proceed with migration?",
        default: true,
      });

      if (!proceed) {
        displayCancelled();
        return {
          success: false,
          fromVersion,
          toVersion: targetVersion,
          breakingChanges: applicableChanges,
          transformations: [],
          manualStepsRequired: [],
          error: "User cancelled",
        };
      }
    }

    // Create backup before migration (unless skipped or dry run)
    if (!options.skipBackup && !dryRun) {
      if (format === "text") {
        console.log(`\n${COLORS.cyan}Creating backup...${COLORS.reset}`);
      }

      const backupResult = await createBackup(directory, `migrate-${fromVersion}`);

      if (backupResult.success) {
        backupPath = backupResult.backupPath;
        if (format === "text") {
          printSuccess(`Backup created: ${formatBackupPath(backupPath)}`);
        }
      } else {
        if (format === "text" && !options.force) {
          printWarning(`Backup failed: ${backupResult.error}`);

          const continueWithoutBackup = await confirm({
            message: "Continue without backup?",
            default: false,
          });

          if (!continueWithoutBackup) {
            displayCancelled();
            return {
              success: false,
              fromVersion,
              toVersion: targetVersion,
              breakingChanges: applicableChanges,
              transformations: [],
              manualStepsRequired: [],
              error: "Backup failed and user cancelled",
            };
          }
        }
      }
    }

    // Apply automatic transformations
    if (format === "text") {
      console.log(`\n${COLORS.cyan}Applying migrations...${COLORS.reset}`);
    }

    const automatableChanges = applicableChanges.filter((c) => c.automatable);

    for (const change of automatableChanges) {
      const results = await applyTransformations(directory, change, dryRun);
      transformationResults.push(...results);
    }

    if (format === "text" && transformationResults.length > 0) {
      displayTransformationResults(transformationResults);
    }

    // Collect manual steps
    for (const change of applicableChanges) {
      if (!change.automatable && change.manualGuidance) {
        manualStepsRequired.push(`${change.title}: ${change.manualGuidance}`);
      }
    }

    if (format === "text") {
      displayManualSteps(applicableChanges);
    }

    if (!dryRun) {
      const manifest = await loadManifest(directory);
      if (manifest) {
        manifest.packageVersion = targetVersion;
        const manifestPath = join(directory, ".atreides-manifest.json");
        await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
      }
    }

    // Check for any failed transformations
    const failedTransformations = transformationResults.filter((t) => !t.success);

    if (failedTransformations.length > 0) {
      if (format === "text") {
        printWarning(
          `Migration completed with ${failedTransformations.length} error(s). Review the results above.`
        );
      }

      const result: MigrateCommandResult = {
        success: false,
        fromVersion,
        toVersion: targetVersion,
        breakingChanges: applicableChanges,
        transformations: transformationResults,
        manualStepsRequired,
        error: `${failedTransformations.length} transformation(s) failed`,
      };
      if (backupPath) result.backupPath = backupPath;
      return result;
    }

    // Success
    if (format === "text") {
      if (dryRun) {
        console.log(`\n${COLORS.cyan}${ICONS.info}${COLORS.reset} Dry run complete. No changes were made.`);
        console.log(`${COLORS.dim}Run without --dry-run to apply changes.${COLORS.reset}`);
      } else {
        displayMigrationSuccess(fromVersion, targetVersion, backupPath);
      }
    } else {
      console.log(
        JSON.stringify(
          {
            success: true,
            fromVersion,
            toVersion: targetVersion,
            breakingChanges: applicableChanges,
            transformations: transformationResults,
            backupPath,
            manualStepsRequired,
            dryRun,
          },
          null,
          2
        )
      );
    }

    const successResult: MigrateCommandResult = {
      success: true,
      fromVersion,
      toVersion: targetVersion,
      breakingChanges: applicableChanges,
      transformations: transformationResults,
      manualStepsRequired,
    };
    if (backupPath) successResult.backupPath = backupPath;
    return successResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Handle user cancellation (Ctrl+C during prompts)
    if (isExitPromptError(error)) {
      if (format === "text") {
        displayCancelled();
      }
      return {
        success: false,
        fromVersion: "unknown",
        toVersion: targetVersion,
        breakingChanges: [],
        transformations: transformationResults,
        manualStepsRequired,
        error: "User cancelled",
      };
    }

    if (format === "text") {
      printError(`Migration failed: ${errorMessage}`);
    }

    const errorResult: MigrateCommandResult = {
      success: false,
      fromVersion: "unknown",
      toVersion: targetVersion,
      breakingChanges: [],
      transformations: transformationResults,
      manualStepsRequired,
      error: errorMessage,
    };
    if (backupPath) errorResult.backupPath = backupPath;
    return errorResult;
  }
}

/**
 * Check if an error is an ExitPromptError (user pressed Ctrl+C)
 */
function isExitPromptError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "name" in error &&
    (error as { name: string }).name === "ExitPromptError"
  );
}

/**
 * Print help for the migrate command
 */
export function printMigrateHelp(): void {
  console.log(`
${COLORS.bold}atreides-opencode migrate${COLORS.reset}
Migrate Atreides configuration between major versions.

${COLORS.bold}Usage:${COLORS.reset}
  atreides-opencode migrate [options]

${COLORS.bold}Options:${COLORS.reset}
  -f, --force        Skip confirmation prompts
  --no-backup        Skip backup creation before migration
  --target <version> Target version to migrate to (default: current package version)
  --dry-run          Show what would be changed without applying
  --json             Output as JSON

${COLORS.bold}What this command does:${COLORS.reset}
  1. Detects the currently installed Atreides version
  2. Identifies breaking changes between versions
  3. Creates a backup of your configuration
  4. Applies automatic transformations where possible
  5. Provides guidance for manual changes

${COLORS.bold}Examples:${COLORS.reset}
  atreides-opencode migrate              Interactive migration wizard
  atreides-opencode migrate --dry-run    Preview changes without applying
  atreides-opencode migrate --force      Skip confirmation prompts
  atreides-opencode migrate --json       JSON output for scripting
`);
}
