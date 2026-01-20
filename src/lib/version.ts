import { exec } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { PACKAGE_NAME, PACKAGE_VERSION } from "./constants.js";

const execAsync = promisify(exec);

export interface VersionInfo {
  current: string;
  latest: string;
  updateAvailable: boolean;
}

export interface NpmViewResult {
  "dist-tags": {
    latest: string;
    [tag: string]: string;
  };
  versions: string[];
}

/**
 * Get the currently installed package version
 */
export function getCurrentVersion(): string {
  return PACKAGE_VERSION;
}

/**
 * Fetch the latest version from npm registry
 */
export async function getLatestVersion(): Promise<string> {
  try {
    const { stdout } = await execAsync(`npm view ${PACKAGE_NAME} version`, {
      timeout: 10000,
    });
    return stdout.trim();
  } catch (error) {
    // Fallback: try to fetch from registry directly
    try {
      const response = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`);
      if (response.ok) {
        const data = (await response.json()) as { version: string };
        return data.version;
      }
    } catch {
      // Both methods failed
    }

    throw new Error(`Failed to fetch latest version: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Check if an update is available
 */
export async function checkForUpdate(): Promise<VersionInfo> {
  const current = getCurrentVersion();

  try {
    const latest = await getLatestVersion();
    const updateAvailable = compareVersions(current, latest) < 0;

    return {
      current,
      latest,
      updateAvailable,
    };
  } catch {
    // If we can't check, assume no update
    return {
      current,
      latest: current,
      updateAvailable: false,
    };
  }
}

/**
 * Compare two semver version strings
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const partA = partsA[i] ?? 0;
    const partB = partsB[i] ?? 0;

    if (partA < partB) return -1;
    if (partA > partB) return 1;
  }

  return 0;
}

/**
 * Update the package using npm or bun
 */
export async function updatePackage(): Promise<{ success: boolean; error?: string }> {
  // Detect package manager
  const packageManager = await detectPackageManager();

  try {
    const command = packageManager === "bun"
      ? `bun update ${PACKAGE_NAME}`
      : `npm update ${PACKAGE_NAME}`;

    await execAsync(command, { timeout: 60000 });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Detect which package manager is being used
 */
async function detectPackageManager(): Promise<"npm" | "bun" | "yarn" | "pnpm"> {
  // Check for lock files
  const checks: Array<{ file: string; manager: "bun" | "yarn" | "pnpm" | "npm" }> = [
    { file: "bun.lockb", manager: "bun" },
    { file: "bun.lock", manager: "bun" },
    { file: "yarn.lock", manager: "yarn" },
    { file: "pnpm-lock.yaml", manager: "pnpm" },
    { file: "package-lock.json", manager: "npm" },
  ];

  for (const { file, manager } of checks) {
    try {
      await readFile(join(process.cwd(), file));
      return manager;
    } catch {
      // File doesn't exist, continue checking
    }
  }

  // Default to npm
  return "npm";
}

/**
 * Get version info for display
 */
export function formatVersionUpdate(current: string, latest: string): string {
  return `${current} → ${latest}`;
}
