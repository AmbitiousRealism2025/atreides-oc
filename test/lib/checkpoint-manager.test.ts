/**
 * CheckpointManager Unit Tests
 *
 * Tests for the checkpoint creation, restoration, and rotation functionality.
 * Target: >80% coverage
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { writeFile, mkdir, rm, readFile, readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { tmpdir, homedir } from "node:os";

import {
  createCheckpoint,
  listCheckpoints,
  getCheckpoint,
  restoreCheckpoint,
  deleteCheckpoint,
  rotateCheckpoints,
  getLatestCheckpoint,
  generateCheckpointId,
  hashContent,
  shouldExclude,
  formatSize,
  formatTimestamp,
  CHECKPOINTS_DIR,
  DEFAULT_MAX_CHECKPOINTS,
  DEFAULT_EXCLUDE_PATTERNS,
  type Checkpoint,
  type CheckpointOptions,
  type RestoreOptions,
} from "../../src/lib/checkpoint-manager.js";

describe("CheckpointManager", () => {
  let testProjectDir: string;
  let originalCheckpointsDir: string;

  beforeEach(async () => {
    // Create unique test directory
    testProjectDir = join(
      tmpdir(),
      `checkpoint-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await mkdir(testProjectDir, { recursive: true });

    // Create some test files
    await writeFile(join(testProjectDir, "index.ts"), "export const hello = 'world';");
    await writeFile(join(testProjectDir, "package.json"), JSON.stringify({ name: "test-project" }));
    await mkdir(join(testProjectDir, "src"), { recursive: true });
    await writeFile(join(testProjectDir, "src", "main.ts"), "console.log('main');");
    await writeFile(join(testProjectDir, "src", "utils.ts"), "export const util = () => {};");
  });

  afterEach(async () => {
    // Clean up test directories
    try {
      await rm(testProjectDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    // Clean up any checkpoints created during tests
    try {
      const checkpoints = await listCheckpoints(testProjectDir);
      for (const checkpoint of checkpoints) {
        await deleteCheckpoint(checkpoint.id);
      }
    } catch {
      // Ignore errors
    }
  });

  // =============================================================================
  // Utility Function Tests
  // =============================================================================

  describe("generateCheckpointId", () => {
    test("generates unique IDs", () => {
      const id1 = generateCheckpointId();
      const id2 = generateCheckpointId();

      expect(id1).not.toBe(id2);
    });

    test("generates IDs with correct prefix", () => {
      const id = generateCheckpointId();

      expect(id.startsWith("chk_")).toBe(true);
    });

    test("generates IDs with expected format", () => {
      const id = generateCheckpointId();

      // Format: chk_YYYYMMDDHHMMSS_xxxx
      expect(id).toMatch(/^chk_\d{14}_[a-z0-9]{4}$/);
    });
  });

  describe("hashContent", () => {
    test("returns consistent hash for same content", () => {
      const content = "hello world";
      const hash1 = hashContent(content);
      const hash2 = hashContent(content);

      expect(hash1).toBe(hash2);
    });

    test("returns different hash for different content", () => {
      const hash1 = hashContent("hello");
      const hash2 = hashContent("world");

      expect(hash1).not.toBe(hash2);
    });

    test("returns 64-character hex string", () => {
      const hash = hashContent("test");

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    test("handles buffer input", () => {
      const buffer = Buffer.from("test content");
      const hash = hashContent(buffer);

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("shouldExclude", () => {
    test("excludes node_modules directory", () => {
      expect(shouldExclude("node_modules/package/index.js", DEFAULT_EXCLUDE_PATTERNS)).toBe(true);
      expect(shouldExclude("path/to/node_modules/pkg", DEFAULT_EXCLUDE_PATTERNS)).toBe(true);
    });

    test("excludes .git directory", () => {
      expect(shouldExclude(".git/config", DEFAULT_EXCLUDE_PATTERNS)).toBe(true);
      expect(shouldExclude(".git", DEFAULT_EXCLUDE_PATTERNS)).toBe(true);
    });

    test("excludes files by extension pattern", () => {
      expect(shouldExclude("debug.log", DEFAULT_EXCLUDE_PATTERNS)).toBe(true);
      expect(shouldExclude("path/to/app.log", DEFAULT_EXCLUDE_PATTERNS)).toBe(true);
    });

    test("does not exclude regular files", () => {
      expect(shouldExclude("src/index.ts", DEFAULT_EXCLUDE_PATTERNS)).toBe(false);
      expect(shouldExclude("package.json", DEFAULT_EXCLUDE_PATTERNS)).toBe(false);
    });

    test("handles custom exclude patterns", () => {
      const customPatterns = ["*.test.ts", "fixtures"];

      expect(shouldExclude("src/utils.test.ts", customPatterns)).toBe(true);
      expect(shouldExclude("fixtures/data.json", customPatterns)).toBe(true);
      expect(shouldExclude("src/utils.ts", customPatterns)).toBe(false);
    });
  });

  describe("formatSize", () => {
    test("formats bytes correctly", () => {
      expect(formatSize(0)).toBe("0 B");
      expect(formatSize(500)).toBe("500 B");
      expect(formatSize(1023)).toBe("1023 B");
    });

    test("formats kilobytes correctly", () => {
      expect(formatSize(1024)).toBe("1.0 KB");
      expect(formatSize(1536)).toBe("1.5 KB");
      expect(formatSize(10240)).toBe("10.0 KB");
    });

    test("formats megabytes correctly", () => {
      expect(formatSize(1048576)).toBe("1.0 MB");
      expect(formatSize(5242880)).toBe("5.0 MB");
    });

    test("formats gigabytes correctly", () => {
      expect(formatSize(1073741824)).toBe("1.0 GB");
    });
  });

  describe("formatTimestamp", () => {
    test("formats timestamp as locale string", () => {
      const timestamp = Date.now();
      const formatted = formatTimestamp(timestamp);

      // Should be a non-empty string
      expect(typeof formatted).toBe("string");
      expect(formatted.length).toBeGreaterThan(0);
    });
  });

  // =============================================================================
  // Checkpoint Creation Tests
  // =============================================================================

  describe("createCheckpoint", () => {
    test("creates checkpoint successfully", async () => {
      const result = await createCheckpoint(testProjectDir);

      expect(result.success).toBe(true);
      expect(result.checkpoint).toBeDefined();
      expect(result.checkpoint?.id).toMatch(/^chk_/);
      expect(result.fileCount).toBeGreaterThan(0);
      expect(result.totalSize).toBeGreaterThan(0);
    });

    test("creates checkpoint with custom name", async () => {
      const result = await createCheckpoint(testProjectDir, {
        name: "My Custom Checkpoint",
      });

      expect(result.success).toBe(true);
      expect(result.checkpoint?.name).toBe("My Custom Checkpoint");
    });

    test("creates checkpoint with description", async () => {
      const result = await createCheckpoint(testProjectDir, {
        name: "Test",
        description: "This is a test checkpoint",
      });

      expect(result.success).toBe(true);
      expect(result.checkpoint?.description).toBe("This is a test checkpoint");
    });

    test("excludes node_modules by default", async () => {
      // Create a fake node_modules directory
      await mkdir(join(testProjectDir, "node_modules", "pkg"), { recursive: true });
      await writeFile(join(testProjectDir, "node_modules", "pkg", "index.js"), "module.exports = {}");

      const result = await createCheckpoint(testProjectDir);

      expect(result.success).toBe(true);
      const nodeModulesFiles = result.checkpoint?.files.filter((f) =>
        f.relativePath.includes("node_modules")
      );
      expect(nodeModulesFiles?.length).toBe(0);
    });

    test("stores project path and name", async () => {
      const result = await createCheckpoint(testProjectDir);

      expect(result.checkpoint?.projectPath).toBe(testProjectDir);
      expect(result.checkpoint?.projectName).toBe(basename(testProjectDir));
    });

    test("captures file metadata correctly", async () => {
      const result = await createCheckpoint(testProjectDir);

      expect(result.success).toBe(true);

      const indexFile = result.checkpoint?.files.find((f) => f.relativePath === "index.ts");
      expect(indexFile).toBeDefined();
      expect(indexFile?.hash).toBeDefined();
      expect(indexFile?.size).toBeGreaterThan(0);
      expect(indexFile?.modifiedAt).toBeGreaterThan(0);
    });

    test("handles empty directory", async () => {
      const emptyDir = join(tmpdir(), `empty-test-${Date.now()}`);
      await mkdir(emptyDir, { recursive: true });

      try {
        const result = await createCheckpoint(emptyDir);

        expect(result.success).toBe(true);
        expect(result.fileCount).toBe(0);
        expect(result.totalSize).toBe(0);
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    });
  });

  // =============================================================================
  // Checkpoint Listing Tests
  // =============================================================================

  describe("listCheckpoints", () => {
    test("returns empty array when no checkpoints exist", async () => {
      // Create a fresh directory with no checkpoints
      const freshDir = join(tmpdir(), `fresh-test-${Date.now()}`);
      await mkdir(freshDir, { recursive: true });

      try {
        const checkpoints = await listCheckpoints(freshDir);
        expect(checkpoints).toEqual([]);
      } finally {
        await rm(freshDir, { recursive: true, force: true });
      }
    });

    test("lists checkpoints for a project", async () => {
      // Create two checkpoints
      await createCheckpoint(testProjectDir, { name: "First" });
      await createCheckpoint(testProjectDir, { name: "Second" });

      const checkpoints = await listCheckpoints(testProjectDir);

      expect(checkpoints.length).toBe(2);
    });

    test("returns checkpoints sorted by creation time (newest first)", async () => {
      await createCheckpoint(testProjectDir, { name: "First" });
      await new Promise((r) => setTimeout(r, 10)); // Small delay
      await createCheckpoint(testProjectDir, { name: "Second" });

      const checkpoints = await listCheckpoints(testProjectDir);

      expect(checkpoints[0]?.name).toBe("Second");
      expect(checkpoints[1]?.name).toBe("First");
    });

    test("filters by project path", async () => {
      // Create another project
      const otherProjectDir = join(tmpdir(), `other-project-${Date.now()}`);
      await mkdir(otherProjectDir, { recursive: true });
      await writeFile(join(otherProjectDir, "file.txt"), "content");

      try {
        await createCheckpoint(testProjectDir, { name: "Test Project" });
        await createCheckpoint(otherProjectDir, { name: "Other Project" });

        const testCheckpoints = await listCheckpoints(testProjectDir);
        const otherCheckpoints = await listCheckpoints(otherProjectDir);

        expect(testCheckpoints.length).toBe(1);
        expect(testCheckpoints[0]?.name).toBe("Test Project");
        expect(otherCheckpoints.length).toBe(1);
        expect(otherCheckpoints[0]?.name).toBe("Other Project");
      } finally {
        await rm(otherProjectDir, { recursive: true, force: true });
        // Clean up other project checkpoints
        const otherCheckpoints = await listCheckpoints(otherProjectDir);
        for (const cp of otherCheckpoints) {
          await deleteCheckpoint(cp.id);
        }
      }
    });
  });

  // =============================================================================
  // Checkpoint Retrieval Tests
  // =============================================================================

  describe("getCheckpoint", () => {
    test("returns checkpoint by ID", async () => {
      const createResult = await createCheckpoint(testProjectDir, { name: "Test" });
      const checkpointId = createResult.checkpoint!.id;

      const checkpoint = await getCheckpoint(checkpointId);

      expect(checkpoint).toBeDefined();
      expect(checkpoint?.id).toBe(checkpointId);
      expect(checkpoint?.name).toBe("Test");
    });

    test("returns undefined for non-existent ID", async () => {
      const checkpoint = await getCheckpoint("chk_nonexistent_1234");

      expect(checkpoint).toBeUndefined();
    });
  });

  describe("getLatestCheckpoint", () => {
    test("returns latest checkpoint for project", async () => {
      await createCheckpoint(testProjectDir, { name: "First" });
      await new Promise((r) => setTimeout(r, 10));
      await createCheckpoint(testProjectDir, { name: "Second" });

      const latest = await getLatestCheckpoint(testProjectDir);

      expect(latest).toBeDefined();
      expect(latest?.name).toBe("Second");
    });

    test("returns undefined when no checkpoints exist", async () => {
      const freshDir = join(tmpdir(), `no-checkpoints-${Date.now()}`);
      await mkdir(freshDir, { recursive: true });

      try {
        const latest = await getLatestCheckpoint(freshDir);
        expect(latest).toBeUndefined();
      } finally {
        await rm(freshDir, { recursive: true, force: true });
      }
    });
  });

  // =============================================================================
  // Checkpoint Restoration Tests
  // =============================================================================

  describe("restoreCheckpoint", () => {
    test("restores files from checkpoint", async () => {
      // Create checkpoint
      const createResult = await createCheckpoint(testProjectDir, { name: "Before Changes" });
      const checkpointId = createResult.checkpoint!.id;

      // Modify a file
      await writeFile(join(testProjectDir, "index.ts"), "export const modified = true;");

      // Verify file was modified
      const modifiedContent = await readFile(join(testProjectDir, "index.ts"), "utf-8");
      expect(modifiedContent).toBe("export const modified = true;");

      // Restore checkpoint
      const restoreResult = await restoreCheckpoint(checkpointId);

      expect(restoreResult.success).toBe(true);
      expect(restoreResult.filesRestored).toBeGreaterThan(0);

      // Verify file was restored
      const restoredContent = await readFile(join(testProjectDir, "index.ts"), "utf-8");
      expect(restoredContent).toBe("export const hello = 'world';");
    });

    test("skips unchanged files when skipUnchanged is true", async () => {
      const createResult = await createCheckpoint(testProjectDir);
      const checkpointId = createResult.checkpoint!.id;

      // Don't modify any files

      const restoreResult = await restoreCheckpoint(checkpointId, undefined, {
        skipUnchanged: true,
      });

      expect(restoreResult.success).toBe(true);
      expect(restoreResult.filesSkipped).toBe(createResult.fileCount);
      expect(restoreResult.filesRestored).toBe(0);
    });

    test("restores to custom target directory", async () => {
      const createResult = await createCheckpoint(testProjectDir);
      const checkpointId = createResult.checkpoint!.id;

      const targetDir = join(tmpdir(), `restore-target-${Date.now()}`);

      try {
        const restoreResult = await restoreCheckpoint(checkpointId, targetDir);

        expect(restoreResult.success).toBe(true);

        // Verify files exist in target
        const targetFiles = await readdir(targetDir);
        expect(targetFiles.length).toBeGreaterThan(0);
      } finally {
        await rm(targetDir, { recursive: true, force: true });
      }
    });

    test("returns error for non-existent checkpoint", async () => {
      const restoreResult = await restoreCheckpoint("chk_nonexistent_1234");

      expect(restoreResult.success).toBe(false);
      expect(restoreResult.error).toContain("not found");
    });

    test("restores specific files only", async () => {
      const createResult = await createCheckpoint(testProjectDir);
      const checkpointId = createResult.checkpoint!.id;

      // Modify all files
      await writeFile(join(testProjectDir, "index.ts"), "modified");
      await writeFile(join(testProjectDir, "package.json"), "{}");

      const restoreResult = await restoreCheckpoint(checkpointId, undefined, {
        files: ["index.ts"],
        skipUnchanged: false,
      });

      expect(restoreResult.success).toBe(true);
      expect(restoreResult.filesRestored).toBe(1);
      expect(restoreResult.restoredFiles).toContain("index.ts");

      // Verify only index.ts was restored
      const indexContent = await readFile(join(testProjectDir, "index.ts"), "utf-8");
      const packageContent = await readFile(join(testProjectDir, "package.json"), "utf-8");

      expect(indexContent).toBe("export const hello = 'world';");
      expect(packageContent).toBe("{}"); // Still modified
    });
  });

  // =============================================================================
  // Checkpoint Deletion Tests
  // =============================================================================

  describe("deleteCheckpoint", () => {
    test("deletes checkpoint successfully", async () => {
      const createResult = await createCheckpoint(testProjectDir);
      const checkpointId = createResult.checkpoint!.id;

      // Verify checkpoint exists
      let checkpoint = await getCheckpoint(checkpointId);
      expect(checkpoint).toBeDefined();

      // Delete it
      const deleted = await deleteCheckpoint(checkpointId);
      expect(deleted).toBe(true);

      // Verify it's gone
      checkpoint = await getCheckpoint(checkpointId);
      expect(checkpoint).toBeUndefined();
    });

    test("returns true for non-existent checkpoint", async () => {
      // deleteCheckpoint uses force: true, so it succeeds even if not found
      const deleted = await deleteCheckpoint("chk_nonexistent_1234");
      expect(deleted).toBe(true);
    });
  });

  // =============================================================================
  // Checkpoint Rotation Tests
  // =============================================================================

  describe("rotateCheckpoints", () => {
    test("keeps only maxCheckpoints checkpoints", async () => {
      // Create more than max checkpoints
      for (let i = 0; i < 5; i++) {
        await createCheckpoint(testProjectDir, { name: `Checkpoint ${i}` });
        await new Promise((r) => setTimeout(r, 10)); // Small delay between checkpoints
      }

      // Apply rotation with max 3
      await rotateCheckpoints(testProjectDir, 3);

      const checkpoints = await listCheckpoints(testProjectDir);
      expect(checkpoints.length).toBe(3);

      // Should keep the newest ones
      const names = checkpoints.map((c) => c.name);
      expect(names).toContain("Checkpoint 4");
      expect(names).toContain("Checkpoint 3");
      expect(names).toContain("Checkpoint 2");
    });

    test("does nothing when under limit", async () => {
      await createCheckpoint(testProjectDir, { name: "One" });
      await createCheckpoint(testProjectDir, { name: "Two" });

      await rotateCheckpoints(testProjectDir, 5);

      const checkpoints = await listCheckpoints(testProjectDir);
      expect(checkpoints.length).toBe(2);
    });

    test("uses default max when not specified", async () => {
      // Default is 10, so creating 12 should delete 2
      for (let i = 0; i < 12; i++) {
        await createCheckpoint(testProjectDir, { name: `Checkpoint ${i}` });
        await new Promise((r) => setTimeout(r, 5));
      }

      await rotateCheckpoints(testProjectDir);

      const checkpoints = await listCheckpoints(testProjectDir);
      expect(checkpoints.length).toBe(DEFAULT_MAX_CHECKPOINTS);
    });
  });

  // =============================================================================
  // Integration Tests
  // =============================================================================

  describe("Integration", () => {
    test("full workflow: create, list, restore, delete", async () => {
      // Create checkpoint
      const createResult = await createCheckpoint(testProjectDir, {
        name: "Integration Test",
        description: "Testing full workflow",
      });
      expect(createResult.success).toBe(true);
      const checkpointId = createResult.checkpoint!.id;

      // List checkpoints
      const checkpoints = await listCheckpoints(testProjectDir);
      expect(checkpoints.some((c) => c.id === checkpointId)).toBe(true);

      // Get checkpoint
      const checkpoint = await getCheckpoint(checkpointId);
      expect(checkpoint?.name).toBe("Integration Test");
      expect(checkpoint?.description).toBe("Testing full workflow");

      // Modify file
      await writeFile(join(testProjectDir, "index.ts"), "modified content");

      // Restore checkpoint
      const restoreResult = await restoreCheckpoint(checkpointId);
      expect(restoreResult.success).toBe(true);

      // Verify restoration
      const content = await readFile(join(testProjectDir, "index.ts"), "utf-8");
      expect(content).toBe("export const hello = 'world';");

      // Delete checkpoint
      const deleted = await deleteCheckpoint(checkpointId);
      expect(deleted).toBe(true);

      // Verify deletion
      const deletedCheckpoint = await getCheckpoint(checkpointId);
      expect(deletedCheckpoint).toBeUndefined();
    });

    test("automatic rotation during create", async () => {
      const maxCheckpoints = 3;

      // Create more than max
      for (let i = 0; i < 5; i++) {
        await createCheckpoint(testProjectDir, {
          name: `Auto Rotation ${i}`,
          maxCheckpoints,
        });
        await new Promise((r) => setTimeout(r, 10));
      }

      // Should only have max checkpoints
      const checkpoints = await listCheckpoints(testProjectDir);
      expect(checkpoints.length).toBe(maxCheckpoints);
    });
  });
});
