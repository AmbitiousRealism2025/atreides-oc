/**
 * Checkpoint CLI Command Tests
 *
 * Tests for the checkpoint and restore CLI commands.
 * Target: >80% coverage
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { writeFile, mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runCheckpointCommand, type CheckpointCommandOptions } from "../../src/cli/checkpoint.js";
import { runRestoreCommand, type RestoreCommandOptions } from "../../src/cli/restore.js";
import {
  listCheckpoints,
  deleteCheckpoint,
  getCheckpoint,
} from "../../src/lib/checkpoint-manager.js";

describe("Checkpoint CLI", () => {
  let testDir: string;
  let consoleOutput: string[];
  let consoleErrorOutput: string[];
  let originalLog: typeof console.log;
  let originalError: typeof console.error;

  beforeEach(async () => {
    // Create unique test directory
    testDir = join(
      tmpdir(),
      `checkpoint-cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await mkdir(testDir, { recursive: true });

    // Create test files
    await writeFile(join(testDir, "index.ts"), "export const hello = 'world';");
    await writeFile(join(testDir, "package.json"), JSON.stringify({ name: "test" }));
    await mkdir(join(testDir, "src"), { recursive: true });
    await writeFile(join(testDir, "src", "main.ts"), "console.log('main');");

    // Capture console output
    consoleOutput = [];
    consoleErrorOutput = [];
    originalLog = console.log;
    originalError = console.error;

    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(" "));
    };
    console.error = (...args: unknown[]) => {
      consoleErrorOutput.push(args.map(String).join(" "));
    };
  });

  afterEach(async () => {
    // Restore console
    console.log = originalLog;
    console.error = originalError;

    // Clean up test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    // Clean up any checkpoints created during tests
    try {
      const checkpoints = await listCheckpoints(testDir);
      for (const checkpoint of checkpoints) {
        await deleteCheckpoint(checkpoint.id);
      }
    } catch {
      // Ignore errors
    }
  });

  // =============================================================================
  // Checkpoint Command Tests
  // =============================================================================

  describe("runCheckpointCommand", () => {
    describe("create action", () => {
      test("creates checkpoint with default options", async () => {
        const result = await runCheckpointCommand({
          directory: testDir,
          action: "create",
        });

        expect(result.success).toBe(true);
        expect(result.action).toBe("create");
        expect(result.data).toBeDefined();
      });

      test("creates checkpoint with custom name", async () => {
        const result = await runCheckpointCommand({
          directory: testDir,
          action: "create",
          name: "My Custom Checkpoint",
        });

        expect(result.success).toBe(true);
        expect((result.data as any)?.name).toBe("My Custom Checkpoint");
      });

      test("creates checkpoint with description", async () => {
        const result = await runCheckpointCommand({
          directory: testDir,
          action: "create",
          name: "Test",
          description: "Test description",
        });

        expect(result.success).toBe(true);
        expect((result.data as any)?.description).toBe("Test description");
      });

      test("outputs JSON when format is json", async () => {
        const result = await runCheckpointCommand({
          directory: testDir,
          action: "create",
          format: "json",
        });

        expect(result.success).toBe(true);
        // Should have output JSON to console
        const jsonOutput = consoleOutput.find((o) => o.includes('"id"'));
        expect(jsonOutput).toBeDefined();
      });

      test("displays success message in text format", async () => {
        await runCheckpointCommand({
          directory: testDir,
          action: "create",
          format: "text",
        });

        const hasSuccessMessage = consoleOutput.some((o) =>
          o.includes("Checkpoint created successfully")
        );
        expect(hasSuccessMessage).toBe(true);
      });
    });

    describe("list action", () => {
      test("lists checkpoints for project", async () => {
        // Create some checkpoints
        await runCheckpointCommand({
          directory: testDir,
          action: "create",
          name: "First",
        });
        await runCheckpointCommand({
          directory: testDir,
          action: "create",
          name: "Second",
        });

        const result = await runCheckpointCommand({
          directory: testDir,
          action: "list",
        });

        expect(result.success).toBe(true);
        expect(result.action).toBe("list");
        expect(Array.isArray(result.data)).toBe(true);
        expect((result.data as any[]).length).toBe(2);
      });

      test("shows message when no checkpoints exist", async () => {
        const freshDir = join(tmpdir(), `no-checkpoints-${Date.now()}`);
        await mkdir(freshDir, { recursive: true });

        try {
          await runCheckpointCommand({
            directory: freshDir,
            action: "list",
            format: "text",
          });

          const hasNoCheckpointsMessage = consoleOutput.some((o) =>
            o.includes("No checkpoints found")
          );
          expect(hasNoCheckpointsMessage).toBe(true);
        } finally {
          await rm(freshDir, { recursive: true, force: true });
        }
      });

      test("outputs JSON when format is json", async () => {
        await runCheckpointCommand({
          directory: testDir,
          action: "create",
          name: "Test",
        });

        await runCheckpointCommand({
          directory: testDir,
          action: "list",
          format: "json",
        });

        // Should output an array
        const jsonOutput = consoleOutput.find((o) => o.startsWith("["));
        expect(jsonOutput).toBeDefined();
      });
    });

    describe("show action", () => {
      test("shows checkpoint details", async () => {
        const createResult = await runCheckpointCommand({
          directory: testDir,
          action: "create",
          name: "Show Test",
        });
        const checkpointId = (createResult.data as any)?.id;

        const result = await runCheckpointCommand({
          action: "show",
          checkpointId,
        });

        expect(result.success).toBe(true);
        expect(result.action).toBe("show");
        expect((result.data as any)?.name).toBe("Show Test");
      });

      test("returns error when checkpoint ID not provided", async () => {
        const result = await runCheckpointCommand({
          action: "show",
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("Checkpoint ID is required");
      });

      test("returns error when checkpoint not found", async () => {
        const result = await runCheckpointCommand({
          action: "show",
          checkpointId: "chk_nonexistent_1234",
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("not found");
      });

      test("shows verbose output with file list", async () => {
        const createResult = await runCheckpointCommand({
          directory: testDir,
          action: "create",
          name: "Verbose Test",
        });
        const checkpointId = (createResult.data as any)?.id;

        await runCheckpointCommand({
          action: "show",
          checkpointId,
          verbose: true,
          format: "text",
        });

        const hasFilesSection = consoleOutput.some((o) => o.includes("Files:"));
        expect(hasFilesSection).toBe(true);
      });
    });

    describe("delete action", () => {
      test("deletes checkpoint", async () => {
        const createResult = await runCheckpointCommand({
          directory: testDir,
          action: "create",
          name: "Delete Test",
        });
        const checkpointId = (createResult.data as any)?.id;

        const result = await runCheckpointCommand({
          action: "delete",
          checkpointId,
        });

        expect(result.success).toBe(true);
        expect(result.action).toBe("delete");

        // Verify deleted
        const checkpoint = await getCheckpoint(checkpointId);
        expect(checkpoint).toBeUndefined();
      });

      test("returns error when checkpoint ID not provided", async () => {
        const result = await runCheckpointCommand({
          action: "delete",
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("Checkpoint ID is required");
      });

      test("displays success message", async () => {
        const createResult = await runCheckpointCommand({
          directory: testDir,
          action: "create",
          name: "Delete Message Test",
        });
        const checkpointId = (createResult.data as any)?.id;

        await runCheckpointCommand({
          action: "delete",
          checkpointId,
          format: "text",
        });

        const hasDeleteMessage = consoleOutput.some((o) =>
          o.includes("Checkpoint deleted")
        );
        expect(hasDeleteMessage).toBe(true);
      });
    });

    describe("unknown action", () => {
      test("returns error for unknown action", async () => {
        const result = await runCheckpointCommand({
          action: "unknown" as any,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("Unknown action");
      });
    });
  });

  // =============================================================================
  // Restore Command Tests
  // =============================================================================

  describe("runRestoreCommand", () => {
    test("restores from checkpoint with force flag", async () => {
      // Create checkpoint
      const createResult = await runCheckpointCommand({
        directory: testDir,
        action: "create",
        name: "Restore Test",
      });
      const checkpointId = (createResult.data as any)?.id;

      // Modify a file
      await writeFile(join(testDir, "index.ts"), "modified content");

      // Restore
      const result = await runRestoreCommand({
        checkpointId,
        force: true,
      });

      expect(result.success).toBe(true);
      expect(result.filesRestored).toBeGreaterThan(0);

      // Verify restoration
      const content = await readFile(join(testDir, "index.ts"), "utf-8");
      expect(content).toBe("export const hello = 'world';");
    });

    test("restores latest checkpoint when --latest flag used", async () => {
      // Create checkpoints
      await runCheckpointCommand({
        directory: testDir,
        action: "create",
        name: "First",
      });
      await new Promise((r) => setTimeout(r, 10));
      await runCheckpointCommand({
        directory: testDir,
        action: "create",
        name: "Second (Latest)",
      });

      // Modify file
      await writeFile(join(testDir, "index.ts"), "modified");

      // Restore latest
      const result = await runRestoreCommand({
        directory: testDir,
        latest: true,
        force: true,
      });

      expect(result.success).toBe(true);
    });

    test("returns error when no checkpoint ID and not --latest", async () => {
      const result = await runRestoreCommand({
        directory: testDir,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Checkpoint ID is required");
    });

    test("returns error when checkpoint not found", async () => {
      const result = await runRestoreCommand({
        checkpointId: "chk_nonexistent_1234",
        force: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    test("outputs JSON when format is json", async () => {
      const createResult = await runCheckpointCommand({
        directory: testDir,
        action: "create",
        name: "JSON Test",
      });
      const checkpointId = (createResult.data as any)?.id;

      await runRestoreCommand({
        checkpointId,
        force: true,
        format: "json",
      });

      const jsonOutput = consoleOutput.find((o) => o.includes('"success"'));
      expect(jsonOutput).toBeDefined();
    });

    test("respects skipUnchanged option", async () => {
      const createResult = await runCheckpointCommand({
        directory: testDir,
        action: "create",
        name: "Skip Test",
      });
      const checkpointId = (createResult.data as any)?.id;

      // Don't modify files

      const result = await runRestoreCommand({
        checkpointId,
        skipUnchanged: true,
        force: true,
      });

      expect(result.success).toBe(true);
      expect(result.filesSkipped).toBeGreaterThan(0);
      expect(result.filesRestored).toBe(0);
    });

    test("restores specific files only", async () => {
      const createResult = await runCheckpointCommand({
        directory: testDir,
        action: "create",
        name: "Specific Files Test",
      });
      const checkpointId = (createResult.data as any)?.id;

      // Modify files
      await writeFile(join(testDir, "index.ts"), "modified");
      await writeFile(join(testDir, "package.json"), "{}");

      const result = await runRestoreCommand({
        checkpointId,
        files: ["index.ts"],
        skipUnchanged: false,
        force: true,
      });

      expect(result.success).toBe(true);
      expect(result.filesRestored).toBe(1);

      // Verify only index.ts was restored
      const indexContent = await readFile(join(testDir, "index.ts"), "utf-8");
      const packageContent = await readFile(join(testDir, "package.json"), "utf-8");

      expect(indexContent).toBe("export const hello = 'world';");
      expect(packageContent).toBe("{}"); // Still modified
    });

    test("restores to custom target directory", async () => {
      const createResult = await runCheckpointCommand({
        directory: testDir,
        action: "create",
        name: "Target Dir Test",
      });
      const checkpointId = (createResult.data as any)?.id;

      const targetDir = join(tmpdir(), `restore-target-${Date.now()}`);

      try {
        const result = await runRestoreCommand({
          checkpointId,
          targetDirectory: targetDir,
          force: true,
        });

        expect(result.success).toBe(true);

        // Verify file exists in target
        const content = await readFile(join(targetDir, "index.ts"), "utf-8");
        expect(content).toBe("export const hello = 'world';");
      } finally {
        await rm(targetDir, { recursive: true, force: true });
      }
    });

    test("returns error when --latest but no checkpoints exist", async () => {
      const freshDir = join(tmpdir(), `no-checkpoints-restore-${Date.now()}`);
      await mkdir(freshDir, { recursive: true });

      try {
        const result = await runRestoreCommand({
          directory: freshDir,
          latest: true,
          force: true,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("No checkpoints found");
      } finally {
        await rm(freshDir, { recursive: true, force: true });
      }
    });
  });

  // =============================================================================
  // Integration Tests
  // =============================================================================

  describe("Integration", () => {
    test("full workflow: create, list, show, restore, delete", async () => {
      // Create checkpoint
      const createResult = await runCheckpointCommand({
        directory: testDir,
        action: "create",
        name: "Full Workflow Test",
        description: "Integration test",
      });
      expect(createResult.success).toBe(true);
      const checkpointId = (createResult.data as any)?.id;

      // List checkpoints
      const listResult = await runCheckpointCommand({
        directory: testDir,
        action: "list",
      });
      expect(listResult.success).toBe(true);
      expect((listResult.data as any[]).some((c) => c.id === checkpointId)).toBe(true);

      // Show checkpoint
      const showResult = await runCheckpointCommand({
        action: "show",
        checkpointId,
      });
      expect(showResult.success).toBe(true);
      expect((showResult.data as any)?.name).toBe("Full Workflow Test");

      // Modify file
      await writeFile(join(testDir, "index.ts"), "modified");

      // Restore
      const restoreResult = await runRestoreCommand({
        checkpointId,
        force: true,
      });
      expect(restoreResult.success).toBe(true);

      // Verify restoration
      const content = await readFile(join(testDir, "index.ts"), "utf-8");
      expect(content).toBe("export const hello = 'world';");

      // Delete checkpoint
      const deleteResult = await runCheckpointCommand({
        action: "delete",
        checkpointId,
      });
      expect(deleteResult.success).toBe(true);

      // Verify deletion
      const verifyResult = await runCheckpointCommand({
        action: "show",
        checkpointId,
      });
      expect(verifyResult.success).toBe(false);
    });
  });
});
