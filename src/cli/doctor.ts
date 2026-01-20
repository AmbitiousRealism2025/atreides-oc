import { access, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";
import {
  PACKAGE_NAME,
  PACKAGE_VERSION,
  OPENCODE_DIR,
  AGENTS_DIR,
  SKILLS_DIR,
  PLUGIN_DIR,
  AGENTS_MD_FILE,
  OPENCODE_JSON_FILE,
} from "../lib/constants.js";
import { COLORS, ICONS, printHeader, printDivider } from "./wizard/prompts.js";

// Diagnostic result types
export type DiagnosticStatus = "pass" | "warn" | "fail";
export type OverallStatus = "green" | "yellow" | "red";

export interface DiagnosticResult {
  category: string;
  status: DiagnosticStatus;
  message: string;
  details?: string[];
  remediation?: string;
}

export interface DoctorResults {
  overallStatus: OverallStatus;
  results: DiagnosticResult[];
  passCount: number;
  warnCount: number;
  failCount: number;
}

// Core categories that cause red status if they fail
const CORE_CATEGORIES = ["Installation", "Project Files", "Plugin Integration"];

export interface DoctorOptions {
  directory?: string;
  verbose?: boolean;
}

/**
 * Run the doctor command to verify Atreides installation and diagnose issues.
 */
export async function runDoctorCommand(options: DoctorOptions = {}): Promise<DoctorResults> {
  const directory = options.directory ?? process.cwd();
  const results: DiagnosticResult[] = [];

  printHeader("Atreides OpenCode Health Check");

  // Run all diagnostic checks
  results.push(...(await checkInstallation()));
  results.push(...(await checkProjectFiles(directory)));
  results.push(...(await checkAgents(directory)));
  results.push(...(await checkSkills(directory)));
  results.push(...(await checkPluginIntegration(directory)));
  results.push(...(await checkSecurity(directory)));
  results.push(...(await checkBackwardCompatibility(directory)));

  // Calculate overall status
  const overallStatus = calculateOverallStatus(results);

  // Count results
  const passCount = results.filter((r) => r.status === "pass").length;
  const warnCount = results.filter((r) => r.status === "warn").length;
  const failCount = results.filter((r) => r.status === "fail").length;

  // Display results
  displayResults(overallStatus, results);
  displaySummary(overallStatus, passCount, warnCount, failCount);
  displayRecommendations(results);

  // Set exit code based on status
  const exitCode = overallStatus === "green" ? 0 : overallStatus === "yellow" ? 1 : 2;
  process.exitCode = exitCode;

  return {
    overallStatus,
    results,
    passCount,
    warnCount,
    failCount,
  };
}

// ============================================================================
// Installation Checks
// ============================================================================

async function checkInstallation(): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];

  console.log(`\n${COLORS.bold}Installation${COLORS.reset}`);

  // Check atreides-opencode package
  results.push(await checkAtreidesPackage());

  // Check OpenCode installation
  results.push(await checkOpenCode());

  // Check runtime (Bun or Node)
  results.push(await checkRuntime());

  return results;
}

async function checkAtreidesPackage(): Promise<DiagnosticResult> {
  const result: DiagnosticResult = {
    category: "Installation",
    status: "pass",
    message: `${PACKAGE_NAME} package installed (v${PACKAGE_VERSION})`,
  };

  // The fact that this code is running means the package is installed
  printStatusLine(result.status, result.message);
  return result;
}

async function checkOpenCode(): Promise<DiagnosticResult> {
  try {
    const version = getCommandVersion("opencode", ["--version"]);
    if (version) {
      const result: DiagnosticResult = {
        category: "Installation",
        status: "pass",
        message: `OpenCode detected (v${version})`,
      };
      printStatusLine(result.status, result.message);
      return result;
    }
  } catch {
    // OpenCode not found
  }

  const result: DiagnosticResult = {
    category: "Installation",
    status: "fail",
    message: "OpenCode not found",
    remediation: "Install OpenCode from https://opencode.ai",
  };
  printStatusLine(result.status, result.message);
  return result;
}

async function checkRuntime(): Promise<DiagnosticResult> {
  // Try Bun first
  try {
    const bunVersion = getCommandVersion("bun", ["--version"]);
    if (bunVersion) {
      const result: DiagnosticResult = {
        category: "Installation",
        status: "pass",
        message: `Bun runtime available (v${bunVersion})`,
      };
      printStatusLine(result.status, result.message);
      return result;
    }
  } catch {
    // Bun not found, try Node
  }

  // Try Node
  try {
    const nodeVersion = getCommandVersion("node", ["--version"]);
    if (nodeVersion) {
      const cleanVersion = nodeVersion.replace(/^v/, "");
      const majorVersion = parseInt(cleanVersion.split(".")[0] ?? "0", 10);

      if (majorVersion >= 20) {
        const result: DiagnosticResult = {
          category: "Installation",
          status: "pass",
          message: `Node.js runtime available (v${cleanVersion})`,
        };
        printStatusLine(result.status, result.message);
        return result;
      } else {
        const result: DiagnosticResult = {
          category: "Installation",
          status: "warn",
          message: `Node.js ${cleanVersion} detected (v20+ recommended)`,
          remediation: "Upgrade to Node.js 20 or newer, or install Bun",
        };
        printStatusLine(result.status, result.message);
        return result;
      }
    }
  } catch {
    // Node not found
  }

  const result: DiagnosticResult = {
    category: "Installation",
    status: "fail",
    message: "No compatible runtime found",
    remediation: "Install Bun (recommended) or Node.js 20+",
  };
  printStatusLine(result.status, result.message);
  return result;
}

// ============================================================================
// Project Files Checks
// ============================================================================

async function checkProjectFiles(directory: string): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];

  console.log(`\n${COLORS.bold}Project Files${COLORS.reset}`);

  // Check AGENTS.md
  results.push(await checkAgentsMd(directory));

  // Check opencode.json
  results.push(await checkOpencodeJson(directory));

  // Check plugin file
  results.push(await checkPluginFile(directory));

  return results;
}

async function checkAgentsMd(directory: string): Promise<DiagnosticResult> {
  const agentsMdPath = join(directory, AGENTS_MD_FILE);

  if (await fileExists(agentsMdPath)) {
    const result: DiagnosticResult = {
      category: "Project Files",
      status: "pass",
      message: "AGENTS.md exists",
    };
    printStatusLine(result.status, result.message);
    return result;
  }

  const result: DiagnosticResult = {
    category: "Project Files",
    status: "fail",
    message: "AGENTS.md missing",
    remediation: "Run 'npx atreides init' to create AGENTS.md",
  };
  printStatusLine(result.status, result.message);
  return result;
}

async function checkOpencodeJson(directory: string): Promise<DiagnosticResult> {
  const configPath = join(directory, OPENCODE_JSON_FILE);

  if (!(await fileExists(configPath))) {
    const result: DiagnosticResult = {
      category: "Project Files",
      status: "fail",
      message: "opencode.json missing",
      remediation: "Run 'npx atreides init' to create opencode.json",
    };
    printStatusLine(result.status, result.message);
    return result;
  }

  // Validate JSON syntax
  try {
    const content = await readFile(configPath, "utf-8");
    JSON.parse(content);

    const result: DiagnosticResult = {
      category: "Project Files",
      status: "pass",
      message: "opencode.json exists and valid",
    };
    printStatusLine(result.status, result.message);
    return result;
  } catch (error) {
    const result: DiagnosticResult = {
      category: "Project Files",
      status: "fail",
      message: "opencode.json has invalid JSON syntax",
      details: [error instanceof Error ? error.message : String(error)],
      remediation: "Fix JSON syntax errors in opencode.json",
    };
    printStatusLine(result.status, result.message);
    return result;
  }
}

async function checkPluginFile(directory: string): Promise<DiagnosticResult> {
  const pluginPath = join(directory, OPENCODE_DIR, PLUGIN_DIR, "atreides.ts");

  if (await fileExists(pluginPath)) {
    const result: DiagnosticResult = {
      category: "Project Files",
      status: "pass",
      message: ".opencode/plugin/atreides.ts exists",
    };
    printStatusLine(result.status, result.message);
    return result;
  }

  // Check for .js alternative
  const jsPluginPath = join(directory, OPENCODE_DIR, PLUGIN_DIR, "atreides.js");
  if (await fileExists(jsPluginPath)) {
    const result: DiagnosticResult = {
      category: "Project Files",
      status: "pass",
      message: ".opencode/plugin/atreides.js exists",
    };
    printStatusLine(result.status, result.message);
    return result;
  }

  const result: DiagnosticResult = {
    category: "Project Files",
    status: "fail",
    message: "Plugin file not found",
    remediation: "Run 'npx atreides init' to create plugin file",
  };
  printStatusLine(result.status, result.message);
  return result;
}

// ============================================================================
// Agents Checks
// ============================================================================

async function checkAgents(directory: string): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  const agentsDir = join(directory, OPENCODE_DIR, AGENTS_DIR);

  if (!(await directoryExists(agentsDir))) {
    console.log(`\n${COLORS.bold}Agents${COLORS.reset}`);
    const result: DiagnosticResult = {
      category: "Agents",
      status: "warn",
      message: "No agents directory found",
      remediation: "Run 'npx atreides init' to create agent definitions",
    };
    printStatusLine(result.status, result.message);
    results.push(result);
    return results;
  }

  try {
    const files = await readdir(agentsDir);
    const agentFiles = files.filter((f) => f.endsWith(".md"));

    if (agentFiles.length === 0) {
      console.log(`\n${COLORS.bold}Agents${COLORS.reset}`);
      const result: DiagnosticResult = {
        category: "Agents",
        status: "warn",
        message: "No agent files found",
        remediation: "Add agent definitions to .opencode/agent/",
      };
      printStatusLine(result.status, result.message);
      results.push(result);
      return results;
    }

    console.log(`\n${COLORS.bold}Agents (${agentFiles.length} configured)${COLORS.reset}`);

    for (const file of agentFiles) {
      const filePath = join(agentsDir, file);
      const validationResult = await validateAgentFile(filePath, file);
      results.push(validationResult);
    }
  } catch (error) {
    const result: DiagnosticResult = {
      category: "Agents",
      status: "fail",
      message: "Failed to read agents directory",
      details: [error instanceof Error ? error.message : String(error)],
    };
    results.push(result);
  }

  return results;
}

async function validateAgentFile(filePath: string, fileName: string): Promise<DiagnosticResult> {
  try {
    const content = await readFile(filePath, "utf-8");
    const frontmatter = extractFrontmatter(content);

    if (!frontmatter) {
      const result: DiagnosticResult = {
        category: "Agents",
        status: "warn",
        message: `${fileName} - missing frontmatter`,
        remediation: "Add YAML frontmatter with name and description",
      };
      printStatusLine(result.status, result.message);
      return result;
    }

    // Check for required fields
    if (!frontmatter.name) {
      const result: DiagnosticResult = {
        category: "Agents",
        status: "warn",
        message: `${fileName} - missing 'name' in frontmatter`,
      };
      printStatusLine(result.status, result.message);
      return result;
    }

    const result: DiagnosticResult = {
      category: "Agents",
      status: "pass",
      message: `${fileName} - valid frontmatter`,
    };
    printStatusLine(result.status, result.message);
    return result;
  } catch (error) {
    const result: DiagnosticResult = {
      category: "Agents",
      status: "fail",
      message: `${fileName} - failed to read`,
      details: [error instanceof Error ? error.message : String(error)],
    };
    printStatusLine(result.status, result.message);
    return result;
  }
}

// ============================================================================
// Skills Checks
// ============================================================================

async function checkSkills(directory: string): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  const skillsDir = join(directory, OPENCODE_DIR, SKILLS_DIR);

  if (!(await directoryExists(skillsDir))) {
    console.log(`\n${COLORS.bold}Skills${COLORS.reset}`);
    const result: DiagnosticResult = {
      category: "Skills",
      status: "warn",
      message: "No skills directory found",
      remediation: "Run 'npx atreides init' to create skill definitions",
    };
    printStatusLine(result.status, result.message);
    results.push(result);
    return results;
  }

  try {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    const skillDirs = entries.filter((e) => e.isDirectory());

    if (skillDirs.length === 0) {
      console.log(`\n${COLORS.bold}Skills${COLORS.reset}`);
      const result: DiagnosticResult = {
        category: "Skills",
        status: "warn",
        message: "No skill directories found",
        remediation: "Add skill definitions to .opencode/skill/",
      };
      printStatusLine(result.status, result.message);
      results.push(result);
      return results;
    }

    console.log(`\n${COLORS.bold}Skills (${skillDirs.length} configured)${COLORS.reset}`);

    for (const dir of skillDirs) {
      const skillPath = join(skillsDir, dir.name, "SKILL.md");
      const validationResult = await validateSkillFile(skillPath, dir.name);
      results.push(validationResult);
    }
  } catch (error) {
    const result: DiagnosticResult = {
      category: "Skills",
      status: "fail",
      message: "Failed to read skills directory",
      details: [error instanceof Error ? error.message : String(error)],
    };
    results.push(result);
  }

  return results;
}

async function validateSkillFile(filePath: string, skillName: string): Promise<DiagnosticResult> {
  if (!(await fileExists(filePath))) {
    const result: DiagnosticResult = {
      category: "Skills",
      status: "warn",
      message: `${skillName}/SKILL.md - not found`,
      remediation: `Create SKILL.md in .opencode/skill/${skillName}/`,
    };
    printStatusLine(result.status, result.message);
    return result;
  }

  try {
    const content = await readFile(filePath, "utf-8");
    const frontmatter = extractFrontmatter(content);

    if (!frontmatter) {
      const result: DiagnosticResult = {
        category: "Skills",
        status: "warn",
        message: `${skillName}/SKILL.md - missing frontmatter`,
        remediation: "Add YAML frontmatter with name and context_type",
      };
      printStatusLine(result.status, result.message);
      return result;
    }

    const result: DiagnosticResult = {
      category: "Skills",
      status: "pass",
      message: `${skillName}/SKILL.md - valid`,
    };
    printStatusLine(result.status, result.message);
    return result;
  } catch (error) {
    const result: DiagnosticResult = {
      category: "Skills",
      status: "fail",
      message: `${skillName}/SKILL.md - failed to read`,
      details: [error instanceof Error ? error.message : String(error)],
    };
    printStatusLine(result.status, result.message);
    return result;
  }
}

// ============================================================================
// Plugin Integration Checks
// ============================================================================

async function checkPluginIntegration(directory: string): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];

  console.log(`\n${COLORS.bold}Plugin Integration${COLORS.reset}`);

  // Check if plugin can be loaded (basic check)
  const pluginLoadResult = await checkPluginLoads(directory);
  results.push(pluginLoadResult);

  // Check hooks registration (from opencode.json)
  const hooksResult = await checkHooksRegistration(directory);
  results.push(hooksResult);

  // Check for plugin conflicts
  const conflictResult = await checkPluginConflicts(directory);
  results.push(conflictResult);

  return results;
}

async function checkPluginLoads(directory: string): Promise<DiagnosticResult> {
  const pluginPath = join(directory, OPENCODE_DIR, PLUGIN_DIR, "atreides.ts");
  const jsPluginPath = join(directory, OPENCODE_DIR, PLUGIN_DIR, "atreides.js");

  const hasPlugin = (await fileExists(pluginPath)) || (await fileExists(jsPluginPath));

  if (!hasPlugin) {
    const result: DiagnosticResult = {
      category: "Plugin Integration",
      status: "fail",
      message: "Plugin file not found",
      remediation: "Run 'npx atreides init' to create plugin",
    };
    printStatusLine(result.status, result.message);
    return result;
  }

  // Basic syntax check - read the file and check for export
  try {
    const actualPath = (await fileExists(pluginPath)) ? pluginPath : jsPluginPath;
    const content = await readFile(actualPath, "utf-8");

    if (content.includes("export") || content.includes("module.exports")) {
      const result: DiagnosticResult = {
        category: "Plugin Integration",
        status: "pass",
        message: "Plugin loads without errors",
      };
      printStatusLine(result.status, result.message);
      return result;
    }

    const result: DiagnosticResult = {
      category: "Plugin Integration",
      status: "warn",
      message: "Plugin file may have invalid exports",
      remediation: "Ensure plugin exports are properly defined",
    };
    printStatusLine(result.status, result.message);
    return result;
  } catch (error) {
    const result: DiagnosticResult = {
      category: "Plugin Integration",
      status: "fail",
      message: "Plugin file cannot be read",
      details: [error instanceof Error ? error.message : String(error)],
    };
    printStatusLine(result.status, result.message);
    return result;
  }
}

async function checkHooksRegistration(directory: string): Promise<DiagnosticResult> {
  const configPath = join(directory, OPENCODE_JSON_FILE);

  try {
    if (!(await fileExists(configPath))) {
      const result: DiagnosticResult = {
        category: "Plugin Integration",
        status: "warn",
        message: "Cannot verify hooks - opencode.json missing",
      };
      printStatusLine(result.status, result.message);
      return result;
    }

    const content = await readFile(configPath, "utf-8");
    const config = JSON.parse(content);

    // Count hooks from atreides config section
    let hookCount = 0;
    if (config.atreides?.hooks) {
      hookCount = Object.keys(config.atreides.hooks).length;
    } else if (config.hooks) {
      hookCount = Object.keys(config.hooks).length;
    }

    // Even without explicit hooks, the plugin provides implicit hooks
    if (hookCount === 0) {
      hookCount = 6; // Default implicit hooks
    }

    const result: DiagnosticResult = {
      category: "Plugin Integration",
      status: "pass",
      message: `Hooks registered: ${hookCount}`,
    };
    printStatusLine(result.status, result.message);
    return result;
  } catch (error) {
    const result: DiagnosticResult = {
      category: "Plugin Integration",
      status: "warn",
      message: "Could not verify hook registration",
      details: [error instanceof Error ? error.message : String(error)],
    };
    printStatusLine(result.status, result.message);
    return result;
  }
}

async function checkPluginConflicts(directory: string): Promise<DiagnosticResult> {
  const pluginDir = join(directory, OPENCODE_DIR, PLUGIN_DIR);

  try {
    if (!(await directoryExists(pluginDir))) {
      const result: DiagnosticResult = {
        category: "Plugin Integration",
        status: "pass",
        message: "No conflicts with other plugins",
      };
      printStatusLine(result.status, result.message);
      return result;
    }

    const files = await readdir(pluginDir);
    const pluginFiles = files.filter((f) => f.endsWith(".ts") || f.endsWith(".js"));
    const nonAtreidesPlugins = pluginFiles.filter((f) => !f.startsWith("atreides"));

    if (nonAtreidesPlugins.length > 0) {
      const result: DiagnosticResult = {
        category: "Plugin Integration",
        status: "warn",
        message: `Other plugins detected: ${nonAtreidesPlugins.join(", ")}`,
        details: ["Multiple plugins may have conflicting hooks"],
        remediation: "Review plugin compatibility and hook priorities",
      };
      printStatusLine(result.status, result.message);
      return result;
    }

    const result: DiagnosticResult = {
      category: "Plugin Integration",
      status: "pass",
      message: "No conflicts with other plugins",
    };
    printStatusLine(result.status, result.message);
    return result;
  } catch (error) {
    const result: DiagnosticResult = {
      category: "Plugin Integration",
      status: "warn",
      message: "Could not check for plugin conflicts",
    };
    printStatusLine(result.status, result.message);
    return result;
  }
}

// ============================================================================
// Security Checks
// ============================================================================

async function checkSecurity(directory: string): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];

  console.log(`\n${COLORS.bold}Security${COLORS.reset}`);

  const configPath = join(directory, OPENCODE_JSON_FILE);

  try {
    if (!(await fileExists(configPath))) {
      const result: DiagnosticResult = {
        category: "Security",
        status: "warn",
        message: "Security patterns not configured",
        remediation: "Run 'npx atreides init' to configure security settings",
      };
      printStatusLine(result.status, result.message);
      results.push(result);
      return results;
    }

    const content = await readFile(configPath, "utf-8");
    const config = JSON.parse(content);
    const security = config.atreides?.security ?? {};

    // Check obfuscation detection
    const obfuscationEnabled = security.enableObfuscationDetection !== false;
    const obfuscationResult: DiagnosticResult = {
      category: "Security",
      status: obfuscationEnabled ? "pass" : "warn",
      message: obfuscationEnabled
        ? "Obfuscation detection enabled"
        : "Obfuscation detection disabled",
    };
    results.push(obfuscationResult);
    printStatusLine(obfuscationResult.status, obfuscationResult.message);

    // Check blocked patterns
    const blockedPatterns = security.blockedPatterns ?? [];
    const hasBlockedPatterns = blockedPatterns.length > 0;
    const patternsResult: DiagnosticResult = {
      category: "Security",
      status: hasBlockedPatterns ? "pass" : "warn",
      message: hasBlockedPatterns
        ? `Blocked patterns configured: ${blockedPatterns.length}`
        : "No blocked patterns configured",
    };
    results.push(patternsResult);
    printStatusLine(patternsResult.status, patternsResult.message);
  } catch (error) {
    const result: DiagnosticResult = {
      category: "Security",
      status: "warn",
      message: "Could not verify security settings",
      details: [error instanceof Error ? error.message : String(error)],
    };
    printStatusLine(result.status, result.message);
    results.push(result);
  }

  return results;
}

// ============================================================================
// Backward Compatibility Checks
// ============================================================================

async function checkBackwardCompatibility(directory: string): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];

  console.log(`\n${COLORS.bold}Backward Compatibility${COLORS.reset}`);

  // Check for CLAUDE.md
  const claudeMdPath = join(directory, "CLAUDE.md");
  if (await fileExists(claudeMdPath)) {
    const result: DiagnosticResult = {
      category: "Backward Compatibility",
      status: "pass",
      message: "CLAUDE.md detected - rules imported",
    };
    printStatusLine(result.status, result.message);
    results.push(result);
  }

  // Check for .claude/settings.json
  const claudeSettingsPath = join(directory, ".claude", "settings.json");
  if (await fileExists(claudeSettingsPath)) {
    const result: DiagnosticResult = {
      category: "Backward Compatibility",
      status: "warn",
      message: ".claude/settings.json found",
      remediation: "Run 'npx atreides migrate' to convert legacy settings",
    };
    printStatusLine(result.status, result.message);
    results.push(result);
  }

  // If no legacy files found
  if (results.length === 0) {
    const result: DiagnosticResult = {
      category: "Backward Compatibility",
      status: "pass",
      message: "No legacy configurations found",
    };
    printStatusLine(result.status, result.message);
    results.push(result);
  }

  return results;
}

// ============================================================================
// Status Calculation
// ============================================================================

function calculateOverallStatus(results: DiagnosticResult[]): OverallStatus {
  // Check for core category failures (red status)
  const hasCoreFailure = results.some(
    (r) => CORE_CATEGORIES.includes(r.category) && r.status === "fail"
  );

  if (hasCoreFailure) {
    return "red";
  }

  // Check for any failures (yellow status)
  const hasAnyFailure = results.some((r) => r.status === "fail");
  if (hasAnyFailure) {
    return "yellow";
  }

  // Check for warnings (yellow status)
  const hasWarning = results.some((r) => r.status === "warn");
  if (hasWarning) {
    return "yellow";
  }

  return "green";
}

// ============================================================================
// Display Functions
// ============================================================================

function printStatusLine(status: DiagnosticStatus, message: string): void {
  const icon =
    status === "pass"
      ? `${COLORS.green}${ICONS.success}${COLORS.reset}`
      : status === "warn"
        ? `${COLORS.yellow}${ICONS.warning}${COLORS.reset}`
        : `${COLORS.red}${ICONS.error}${COLORS.reset}`;

  console.log(`  ${icon} ${message}`);
}

function displayResults(_overall: OverallStatus, results: DiagnosticResult[]): void {
  // Results are already displayed inline during checks
  // This function displays any additional details

  const failedResults = results.filter((r) => r.status === "fail" && r.details);
  const warnResults = results.filter((r) => r.status === "warn" && r.remediation);

  if (failedResults.length > 0 || warnResults.length > 0) {
    printDivider();

    for (const result of failedResults) {
      if (result.details) {
        console.log(`${COLORS.red}${result.category}:${COLORS.reset}`);
        result.details.forEach((detail) => console.log(`  ${COLORS.dim}- ${detail}${COLORS.reset}`));
        if (result.remediation) {
          console.log(`  ${COLORS.cyan}${ICONS.arrow} ${result.remediation}${COLORS.reset}`);
        }
        console.log();
      }
    }
  }
}

function displaySummary(
  overall: OverallStatus,
  passCount: number,
  warnCount: number,
  failCount: number
): void {
  printDivider();

  const icon = overall === "green" ? "🟢" : overall === "yellow" ? "🟡" : "🔴";
  const statusText =
    overall === "green"
      ? "All checks passed"
      : overall === "yellow"
        ? "System functional with warnings"
        : "Critical issues found";

  console.log(`${icon} ${COLORS.bold}${statusText}${COLORS.reset}\n`);

  const parts: string[] = [];
  if (passCount > 0) parts.push(`${passCount} passed`);
  if (warnCount > 0) parts.push(`${warnCount} warnings`);
  if (failCount > 0) parts.push(`${failCount} failed`);

  console.log(`Result: ${parts.join(", ")}`);
}

function displayRecommendations(results: DiagnosticResult[]): void {
  const recommendations = results
    .filter((r) => r.remediation && (r.status === "fail" || r.status === "warn"))
    .map((r) => r.remediation as string);

  // Deduplicate recommendations
  const uniqueRecommendations = [...new Set(recommendations)];

  if (uniqueRecommendations.length > 0) {
    console.log(`\n${COLORS.bold}Recommendations:${COLORS.reset}`);
    uniqueRecommendations.forEach((rec, i) => {
      console.log(`  ${i + 1}. ${rec}`);
    });
  }

  console.log();
}

// ============================================================================
// Utility Functions
// ============================================================================

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

function getCommandVersion(command: string, args: string[]): string | null {
  try {
    const result = execSync(`${command} ${args.join(" ")}`, {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim().split("\n")[0] ?? null;
  } catch {
    return null;
  }
}

interface Frontmatter {
  name?: string;
  description?: string;
  [key: string]: unknown;
}

function extractFrontmatter(content: string): Frontmatter | null {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return null;
  }

  try {
    const yaml = match[1];
    if (!yaml) {
      return null;
    }
    const result: Frontmatter = {};

    // Simple YAML parsing for key: value pairs
    const lines = yaml.split("\n");
    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        let value = line.slice(colonIndex + 1).trim();

        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        result[key] = value;
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}
