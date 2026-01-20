import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OPENCODE_DIR, AGENTS_MD_FILE, OPENCODE_JSON_FILE } from "./constants.js";

const BACKUP_DIR = ".atreides-backup";

export interface BackupResult {
  success: boolean;
  backupPath: string;
  files: string[];
  error?: string;
}

export interface BackupMetadata {
  timestamp: string;
  version: string;
  files: string[];
}

/**
 * Create a timestamped backup of all Atreides configuration files
 */
export async function createBackup(
  projectPath: string,
  version: string
): Promise<BackupResult> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(projectPath, BACKUP_DIR, `backup-${timestamp}`);
  const backedUpFiles: string[] = [];

  try {
    // Create backup directory
    await mkdir(backupPath, { recursive: true });

    // Files to backup
    const filesToBackup = [
      AGENTS_MD_FILE,
      OPENCODE_JSON_FILE,
    ];

    // Backup individual files
    for (const file of filesToBackup) {
      const sourcePath = join(projectPath, file);
      const destPath = join(backupPath, file);

      try {
        await copyFile(sourcePath, destPath);
        backedUpFiles.push(file);
      } catch {
        // File doesn't exist, skip
      }
    }

    // Backup .opencode directory recursively
    const opencodePath = join(projectPath, OPENCODE_DIR);
    const opencodeBackupPath = join(backupPath, OPENCODE_DIR);

    try {
      await copyDirectoryRecursive(opencodePath, opencodeBackupPath);
      const opencodeFiles = await listFilesRecursive(opencodePath, OPENCODE_DIR);
      backedUpFiles.push(...opencodeFiles);
    } catch {
      // Directory doesn't exist, skip
    }

    // Backup manifest if it exists
    const manifestPath = join(projectPath, ".atreides-manifest.json");
    const manifestBackupPath = join(backupPath, ".atreides-manifest.json");

    try {
      await copyFile(manifestPath, manifestBackupPath);
      backedUpFiles.push(".atreides-manifest.json");
    } catch {
      // Manifest doesn't exist, skip
    }

    // Write backup metadata
    const metadata: BackupMetadata = {
      timestamp: new Date().toISOString(),
      version,
      files: backedUpFiles,
    };

    await writeFile(
      join(backupPath, "backup-metadata.json"),
      JSON.stringify(metadata, null, 2),
      "utf-8"
    );

    return {
      success: true,
      backupPath,
      files: backedUpFiles,
    };
  } catch (error) {
    return {
      success: false,
      backupPath,
      files: backedUpFiles,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Copy a directory recursively
 */
async function copyDirectoryRecursive(source: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });

  const entries = await readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = join(source, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryRecursive(sourcePath, destPath);
    } else {
      await copyFile(sourcePath, destPath);
    }
  }
}

/**
 * List all files in a directory recursively
 */
async function listFilesRecursive(dirPath: string, prefix: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      const relativePath = join(prefix, entry.name);

      if (entry.isDirectory()) {
        const subFiles = await listFilesRecursive(fullPath, relativePath);
        files.push(...subFiles);
      } else {
        files.push(relativePath);
      }
    }
  } catch {
    // Directory access error
  }

  return files;
}

/**
 * Get list of available backups
 */
export async function listBackups(projectPath: string): Promise<BackupMetadata[]> {
  const backupDir = join(projectPath, BACKUP_DIR);
  const backups: BackupMetadata[] = [];

  try {
    const entries = await readdir(backupDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith("backup-")) {
        const metadataPath = join(backupDir, entry.name, "backup-metadata.json");

        try {
          const content = await readFile(metadataPath, "utf-8");
          backups.push(JSON.parse(content) as BackupMetadata);
        } catch {
          // Invalid or missing metadata
        }
      }
    }
  } catch {
    // Backup directory doesn't exist
  }

  // Sort by timestamp, newest first
  backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return backups;
}

/**
 * Get the most recent backup
 */
export async function getLatestBackup(projectPath: string): Promise<BackupMetadata | null> {
  const backups = await listBackups(projectPath);
  return backups[0] ?? null;
}

/**
 * Format backup path for display
 */
export function formatBackupPath(backupPath: string): string {
  return backupPath.replace(process.cwd(), ".");
}
