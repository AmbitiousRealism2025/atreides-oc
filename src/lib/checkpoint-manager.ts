/**
 * CheckpointManager - Project checkpoint and restore functionality
 *
 * Provides the ability to:
 * - Create project snapshots (checkpoints) for safe recovery
 * - Store checkpoints in ~/.atreides/checkpoints/
 * - Rotate backups (keep last 10 by default)
 * - Restore project state from checkpoints
 */

import { readFile, writeFile, mkdir, readdir, rm, stat, copyFile } from "node:fs/promises";
import { join, basename, relative, dirname } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { createLogger } from "./logger.js";

const logger = createLogger("atreides:checkpoint-manager");

// =============================================================================
// Types
// =============================================================================

/**
 * Metadata for a single file in a checkpoint.
 */
export interface CheckpointFile {
  /** Relative path from project root */
  relativePath: string;
  /** SHA-256 hash of file content */
  hash: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp */
  modifiedAt: number;
}

/**
 * Checkpoint metadata stored in manifest.
 */
export interface Checkpoint {
  /** Unique checkpoint identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Timestamp when checkpoint was created */
  createdAt: number;
  /** Absolute path to the project that was checkpointed */
  projectPath: string;
  /** Project name (derived from directory) */
  projectName: string;
  /** List of files included in the checkpoint */
  files: CheckpointFile[];
  /** Total size of all files in bytes */
  totalSize: number;
  /** Optional description */
  description?: string;
}

/**
 * Result of checkpoint creation.
 */
export interface CheckpointResult {
  /** Whether the checkpoint was created successfully */
  success: boolean;
  /** The created checkpoint metadata */
  checkpoint?: Checkpoint;
  /** Error message if failed */
  error?: string;
  /** Number of files checkpointed */
  fileCount: number;
  /** Total size of checkpointed files */
  totalSize: number;
}

/**
 * Result of checkpoint restoration.
 */
export interface RestoreResult {
  /** Whether restoration was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Number of files restored */
  filesRestored: number;
  /** Number of files skipped (unchanged) */
  filesSkipped: number;
  /** Files that were restored */
  restoredFiles: string[];
}

/**
 * Options for checkpoint creation.
 */
export interface CheckpointOptions {
  /** Name for the checkpoint (auto-generated if not provided) */
  name?: string;
  /** Optional description */
  description?: string;
  /** File patterns to include (glob patterns) */
  include?: string[];
  /** File patterns to exclude (glob patterns) */
  exclude?: string[];
  /** Maximum number of checkpoints to keep (default: 10) */
  maxCheckpoints?: number;
}

/**
 * Options for checkpoint restoration.
 */
export interface RestoreOptions {
  /** Restore only specific files */
  files?: string[];
  /** Skip files that haven't changed */
  skipUnchanged?: boolean;
  /** Create a backup before restoring */
  backup?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Default directory for checkpoint storage */
export const CHECKPOINTS_DIR = join(homedir(), ".atreides", "checkpoints");

/** Default maximum number of checkpoints to retain */
export const DEFAULT_MAX_CHECKPOINTS = 10;

/** Default patterns to exclude from checkpoints */
export const DEFAULT_EXCLUDE_PATTERNS = [
  "node_modules",
  ".git",
  ".DS_Store",
  "*.log",
  "dist",
  "build",
  ".opencode",
  "coverage",
  ".nyc_output",
  ".cache",
  ".parcel-cache",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "*.pyc",
  "__pycache__",
  ".venv",
  "venv",
  ".env.local",
  ".env.*.local",
];

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a unique checkpoint ID based on timestamp.
 */
export function generateCheckpointId(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 6);
  return `chk_${timestamp}_${random}`;
}

/**
 * Calculate SHA-256 hash of a string.
 */
export function hashContent(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Check if a path matches any of the exclude patterns.
 */
export function shouldExclude(
  filePath: string,
  excludePatterns: string[]
): boolean {
  const normalizedPath = filePath.replace(/\\/g, "/");

  for (const pattern of excludePatterns) {
    // Simple glob matching
    if (pattern.startsWith("*")) {
      // *.ext pattern
      const ext = pattern.slice(1);
      if (normalizedPath.endsWith(ext)) {
        return true;
      }
    } else if (
      normalizedPath.includes(`/${pattern}/`) ||
      normalizedPath.startsWith(`${pattern}/`) ||
      normalizedPath === pattern ||
      normalizedPath.endsWith(`/${pattern}`)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Get all files in a directory recursively.
 */
async function getAllFiles(
  dirPath: string,
  excludePatterns: string[],
  basePath: string = dirPath
): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      const relativePath = relative(basePath, fullPath);

      if (shouldExclude(relativePath, excludePatterns)) {
        continue;
      }

      if (entry.isDirectory()) {
        const subFiles = await getAllFiles(fullPath, excludePatterns, basePath);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    logger.warn("Error reading directory", { dirPath, error });
  }

  return files;
}

/**
 * Ensure the checkpoints directory exists.
 */
async function ensureCheckpointsDir(): Promise<void> {
  await mkdir(CHECKPOINTS_DIR, { recursive: true });
}

/**
 * Get the path to a checkpoint's directory.
 */
function getCheckpointPath(checkpointId: string): string {
  return join(CHECKPOINTS_DIR, checkpointId);
}

/**
 * Get the path to a checkpoint's manifest file.
 */
function getManifestPath(checkpointId: string): string {
  return join(getCheckpointPath(checkpointId), "manifest.json");
}

/**
 * Get the path to a checkpoint's files directory.
 */
function getFilesPath(checkpointId: string): string {
  return join(getCheckpointPath(checkpointId), "files");
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Create a new checkpoint of the project.
 *
 * @param projectPath - Absolute path to the project directory
 * @param options - Checkpoint creation options
 * @returns Result of checkpoint creation
 */
export async function createCheckpoint(
  projectPath: string,
  options: CheckpointOptions = {}
): Promise<CheckpointResult> {
  const startTime = Date.now();

  try {
    await ensureCheckpointsDir();

    const checkpointId = generateCheckpointId();
    const checkpointDir = getCheckpointPath(checkpointId);
    const filesDir = getFilesPath(checkpointId);

    // Create checkpoint directories
    await mkdir(checkpointDir, { recursive: true });
    await mkdir(filesDir, { recursive: true });

    // Determine exclude patterns
    const excludePatterns = [
      ...DEFAULT_EXCLUDE_PATTERNS,
      ...(options.exclude ?? []),
    ];

    // Get all files to checkpoint
    const allFiles = await getAllFiles(projectPath, excludePatterns);

    const checkpointFiles: CheckpointFile[] = [];
    let totalSize = 0;

    // Process each file
    for (const filePath of allFiles) {
      try {
        const content = await readFile(filePath);
        const stats = await stat(filePath);
        const relativePath = relative(projectPath, filePath);
        const hash = hashContent(content);

        // Save file to checkpoint
        const destPath = join(filesDir, relativePath);
        await mkdir(dirname(destPath), { recursive: true });
        await writeFile(destPath, content);

        checkpointFiles.push({
          relativePath,
          hash,
          size: stats.size,
          modifiedAt: stats.mtimeMs,
        });

        totalSize += stats.size;
      } catch (error) {
        logger.warn("Error processing file", { filePath, error });
      }
    }

    // Create checkpoint metadata
    const checkpoint: Checkpoint = {
      id: checkpointId,
      name: options.name ?? `Checkpoint ${new Date().toLocaleString()}`,
      createdAt: Date.now(),
      projectPath,
      projectName: basename(projectPath),
      files: checkpointFiles,
      totalSize,
    };

    // Only add description if provided
    if (options.description) {
      checkpoint.description = options.description;
    }

    // Save manifest
    await writeFile(getManifestPath(checkpointId), JSON.stringify(checkpoint, null, 2));

    // Apply rotation policy
    const maxCheckpoints = options.maxCheckpoints ?? DEFAULT_MAX_CHECKPOINTS;
    await rotateCheckpoints(projectPath, maxCheckpoints);

    const duration = Date.now() - startTime;
    logger.info("Checkpoint created", {
      checkpointId,
      fileCount: checkpointFiles.length,
      totalSize,
      durationMs: duration,
    });

    return {
      success: true,
      checkpoint,
      fileCount: checkpointFiles.length,
      totalSize,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to create checkpoint", { error: errorMessage });

    return {
      success: false,
      error: errorMessage,
      fileCount: 0,
      totalSize: 0,
    };
  }
}

/**
 * List all checkpoints for a project.
 *
 * @param projectPath - Optional project path to filter checkpoints
 * @returns Array of checkpoint metadata
 */
export async function listCheckpoints(projectPath?: string): Promise<Checkpoint[]> {
  try {
    await ensureCheckpointsDir();

    const entries = await readdir(CHECKPOINTS_DIR, { withFileTypes: true });
    const checkpoints: Checkpoint[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("chk_")) {
        continue;
      }

      try {
        const manifestPath = getManifestPath(entry.name);
        const manifestContent = await readFile(manifestPath, "utf-8");
        const checkpoint: Checkpoint = JSON.parse(manifestContent);

        // Filter by project path if specified
        if (!projectPath || checkpoint.projectPath === projectPath) {
          checkpoints.push(checkpoint);
        }
      } catch {
        // Skip invalid checkpoints
        logger.warn("Invalid checkpoint manifest", { checkpointId: entry.name });
      }
    }

    // Sort by creation time (newest first)
    return checkpoints.sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    logger.error("Failed to list checkpoints", { error });
    return [];
  }
}

/**
 * Get a specific checkpoint by ID.
 *
 * @param checkpointId - Checkpoint identifier
 * @returns Checkpoint metadata or undefined if not found
 */
export async function getCheckpoint(checkpointId: string): Promise<Checkpoint | undefined> {
  try {
    const manifestPath = getManifestPath(checkpointId);
    const manifestContent = await readFile(manifestPath, "utf-8");
    return JSON.parse(manifestContent);
  } catch {
    return undefined;
  }
}

/**
 * Restore a project from a checkpoint.
 *
 * @param checkpointId - Checkpoint identifier
 * @param targetPath - Optional target path (defaults to original project path)
 * @param options - Restoration options
 * @returns Result of restoration
 */
export async function restoreCheckpoint(
  checkpointId: string,
  targetPath?: string,
  options: RestoreOptions = {}
): Promise<RestoreResult> {
  try {
    const checkpoint = await getCheckpoint(checkpointId);

    if (!checkpoint) {
      return {
        success: false,
        error: `Checkpoint not found: ${checkpointId}`,
        filesRestored: 0,
        filesSkipped: 0,
        restoredFiles: [],
      };
    }

    const restorePath = targetPath ?? checkpoint.projectPath;
    const filesDir = getFilesPath(checkpointId);

    // Create backup if requested
    if (options.backup) {
      await createCheckpoint(restorePath, {
        name: `Pre-restore backup (${checkpointId})`,
        description: `Automatic backup before restoring checkpoint ${checkpointId}`,
      });
    }

    let filesRestored = 0;
    let filesSkipped = 0;
    const restoredFiles: string[] = [];

    // Filter files if specific files requested
    const filesToRestore = options.files
      ? checkpoint.files.filter((f) => options.files!.includes(f.relativePath))
      : checkpoint.files;

    for (const file of filesToRestore) {
      try {
        const sourcePath = join(filesDir, file.relativePath);
        const destPath = join(restorePath, file.relativePath);

        // Check if we should skip unchanged files
        if (options.skipUnchanged) {
          try {
            const currentContent = await readFile(destPath);
            const currentHash = hashContent(currentContent);

            if (currentHash === file.hash) {
              filesSkipped++;
              continue;
            }
          } catch {
            // File doesn't exist, will restore
          }
        }

        // Ensure directory exists
        await mkdir(dirname(destPath), { recursive: true });

        // Copy file from checkpoint
        await copyFile(sourcePath, destPath);

        filesRestored++;
        restoredFiles.push(file.relativePath);
      } catch (error) {
        logger.warn("Error restoring file", { file: file.relativePath, error });
      }
    }

    logger.info("Checkpoint restored", {
      checkpointId,
      filesRestored,
      filesSkipped,
      targetPath: restorePath,
    });

    return {
      success: true,
      filesRestored,
      filesSkipped,
      restoredFiles,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to restore checkpoint", { checkpointId, error: errorMessage });

    return {
      success: false,
      error: errorMessage,
      filesRestored: 0,
      filesSkipped: 0,
      restoredFiles: [],
    };
  }
}

/**
 * Delete a checkpoint.
 *
 * @param checkpointId - Checkpoint identifier
 * @returns Whether deletion was successful
 */
export async function deleteCheckpoint(checkpointId: string): Promise<boolean> {
  try {
    const checkpointDir = getCheckpointPath(checkpointId);
    await rm(checkpointDir, { recursive: true, force: true });

    logger.info("Checkpoint deleted", { checkpointId });
    return true;
  } catch (error) {
    logger.error("Failed to delete checkpoint", { checkpointId, error });
    return false;
  }
}

/**
 * Apply rotation policy - keep only the most recent N checkpoints per project.
 *
 * @param projectPath - Project path to apply rotation for
 * @param maxCheckpoints - Maximum number of checkpoints to keep
 */
export async function rotateCheckpoints(
  projectPath: string,
  maxCheckpoints: number = DEFAULT_MAX_CHECKPOINTS
): Promise<void> {
  try {
    const checkpoints = await listCheckpoints(projectPath);

    if (checkpoints.length <= maxCheckpoints) {
      return;
    }

    // Delete oldest checkpoints beyond the limit
    const toDelete = checkpoints.slice(maxCheckpoints);

    for (const checkpoint of toDelete) {
      await deleteCheckpoint(checkpoint.id);
      logger.info("Rotated checkpoint", { checkpointId: checkpoint.id });
    }
  } catch (error) {
    logger.warn("Error during checkpoint rotation", { error });
  }
}

/**
 * Get the latest checkpoint for a project.
 *
 * @param projectPath - Project path
 * @returns Latest checkpoint or undefined
 */
export async function getLatestCheckpoint(projectPath: string): Promise<Checkpoint | undefined> {
  const checkpoints = await listCheckpoints(projectPath);
  return checkpoints[0];
}

/**
 * Format checkpoint size for display.
 */
export function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Format timestamp for display.
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}
