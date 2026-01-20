export const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
};

export const ICONS = {
  success: "\u2713",
  error: "\u2717",
  warning: "\u26a0",
  info: "\u2139",
  detect: "\ud83d\udd0d",
  package: "\ud83d\udce6",
  robot: "\ud83e\udd16",
  lock: "\ud83d\udd10",
  clipboard: "\ud83d\udccb",
  rocket: "\ud83d\ude80",
  folder: "\ud83d\udcc1",
  file: "\ud83d\udcc4",
  star: "\u2b50",
  check: "\u2714",
  cross: "\u2718",
  arrow: "\u2192",
};

export function printHeader(title: string): void {
  console.log(`\n${COLORS.cyan}${COLORS.bold}${title}${COLORS.reset}\n`);
}

export function printStep(step: number, total: number, title: string): void {
  console.log(`\n${COLORS.dim}Step ${step}/${total}${COLORS.reset} ${COLORS.bold}${title}${COLORS.reset}\n`);
}

export function printSuccess(message: string): void {
  console.log(`${COLORS.green}${ICONS.success}${COLORS.reset} ${message}`);
}

export function printError(message: string): void {
  console.log(`${COLORS.red}${ICONS.error}${COLORS.reset} ${message}`);
}

export function printWarning(message: string): void {
  console.log(`${COLORS.yellow}${ICONS.warning}${COLORS.reset} ${message}`);
}

export function printInfo(message: string): void {
  console.log(`${COLORS.blue}${ICONS.info}${COLORS.reset} ${message}`);
}

export function printDivider(): void {
  console.log(`\n${COLORS.dim}${"─".repeat(60)}${COLORS.reset}\n`);
}

export function printWelcome(): void {
  console.log(`
${COLORS.cyan}${COLORS.bold}
    ╔═══════════════════════════════════════════════════════════╗
    ║                                                           ║
    ║   ${COLORS.white}Atreides OpenCode${COLORS.cyan}                                     ║
    ║   ${COLORS.dim}AI Orchestration Plugin${COLORS.reset}${COLORS.cyan}                              ║
    ║                                                           ║
    ╚═══════════════════════════════════════════════════════════╝
${COLORS.reset}
  ${ICONS.rocket} Welcome! Let's set up Atreides for your project.
  
  ${COLORS.dim}Press Ctrl+C at any time to cancel.${COLORS.reset}
`);
}

export function printPostWizardSummary(config: {
  projectType: string;
  installationMode: string;
  agentCount: number;
  enabledPermissions: number;
  restrictedPermissions: number;
  files: string[];
}): void {
  console.log(`
${COLORS.green}${COLORS.bold}${ICONS.success} Atreides OpenCode initialized successfully!${COLORS.reset}

${ICONS.folder} ${COLORS.bold}Created files:${COLORS.reset}
${config.files.map(f => `   ${COLORS.dim}${f}${COLORS.reset}`).join("\n")}

${COLORS.bold}Configuration:${COLORS.reset}
   Project Type: ${config.projectType}
   Installation Mode: ${config.installationMode}
   Agents: ${config.agentCount} configured
   Permissions: ${config.enabledPermissions} enabled, ${config.restrictedPermissions} restricted

${ICONS.star} ${COLORS.bold}Next steps:${COLORS.reset}
   1. Review AGENTS.md to customize orchestration rules
   2. Run 'npx atreides-opencode doctor' to verify setup
   3. Start using OpenCode - Atreides will orchestrate automatically
   4. Edit opencode.json to adjust permissions as needed

${COLORS.dim}Documentation: https://atreides-opencode.dev/docs
Support: https://github.com/atreides/atreides-opencode/issues${COLORS.reset}

${ICONS.rocket} Happy coding!
`);
}

export function printCancelled(): void {
  console.log(`
${COLORS.yellow}${ICONS.warning} Initialization cancelled.${COLORS.reset}
   No files were created.
   Run 'atreides init' to start over.
`);
}

export function printMergeMode(existingFiles: string[]): void {
  console.log(`
${COLORS.yellow}${ICONS.warning} Existing Atreides configuration detected${COLORS.reset}

Found:
${existingFiles.map(f => `   - ${f}`).join("\n")}

${COLORS.bold}Merge mode:${COLORS.reset} Update templates while preserving your customizations.

   - Template files will be updated to latest version
   - Your customizations in AGENTS.md will be preserved
   - Custom agent configurations will be merged
   - Backup created before proceeding
`);
}
