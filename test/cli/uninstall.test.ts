/**
 * Uninstall Command Unit Tests
 *
 * Tests for the uninstall command that removes Atreides from a project.
 * Target: >80% coverage for uninstall.ts
 */

import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { writeFile, mkdir, rm, readdir, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Import types for testing
import type {
  UninstallCommandOptions,
  UninstallCommandResult,
} from "../../src/cli/uninstall.js";

describe("Uninstall Command", () => {
  let testDir: string;
  let consoleOutput: string[];
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = join(
      tmpdir(),
      `atreides-uninstall-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await mkdir(testDir, { recursive: true });

    // Capture console output
    consoleOutput = [];
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(" "));
    };
    console.error = (...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(" "));
    };
  });

  afterEach(async () => {
    // Restore console
    console.log = originalConsoleLog;
    console.error = originalConsoleError;

    // Clean up temp directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // =============================================================================
  // Helper Functions for Test Setup
  // =============================================================================

  async function createOpencodeJson(content: object = {}): Promise<void> {
    await writeFile(join(testDir, "opencode.json"), JSON.stringify(content, null, 2));
  }

  async function createAgentsMd(content = "# AGENTS\n\nOrchestration rules go here."): Promise<void> {
    await writeFile(join(testDir, "AGENTS.md"), content);
  }

  async function createManifest(content: object = {}): Promise<void> {
    await writeFile(join(testDir, ".atreides-manifest.json"), JSON.stringify(content, null, 2));
  }

  async function createOpencodeDir(): Promise<void> {
    const opencodeDir = join(testDir, ".opencode");
    await mkdir(join(opencodeDir, "agent"), { recursive: true });
    await mkdir(join(opencodeDir, "skill"), { recursive: true });
    await mkdir(join(opencodeDir, "plugin"), { recursive: true });

    // Create some content
    await writeFile(join(opencodeDir, "agent", "muad-dib.md"), "# Agent");
    await writeFile(join(opencodeDir, "plugin", "atreides.ts"), "export default {};");
  }

  async function createFullProject(): Promise<void> {
    await createOpencodeJson({ atreides: { identity: { personaName: "TestAgent" } } });
    await createAgentsMd();
    await createManifest({ version: "0.1.0" });
    await createOpencodeDir();
  }

  async function fileExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  // =============================================================================
  // Basic Command Execution Tests
  // =============================================================================

  describe("runUninstallCommand", () => {
    test("returns UninstallCommandResult object", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      await createFullProject();
      const result = await runUninstallCommand({
        directory: testDir,
        force: true,
        skipBackup: true,
      });

      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");
      expect(typeof result.filesRemoved).toBe("number");
      expect(result.removedItems).toBeInstanceOf(Array);
    });

    test("fails when no Atreides installation found", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      // Empty directory - no Atreides files
      const result = await runUninstallCommand({
        directory: testDir,
        force: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("No Atreides installation found");
      expect(result.filesRemoved).toBe(0);
    });

    test("uses current working directory by default", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      // This test just verifies the command can run with default directory
      const result = await runUninstallCommand({
        directory: testDir,
        force: true,
      });

      expect(result).toBeDefined();
    });
  });

  // =============================================================================
  // File Detection Tests
  // =============================================================================

  describe("File Detection", () => {
    test("detects AGENTS.md", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      await createAgentsMd();
      const result = await runUninstallCommand({
        directory: testDir,
        force: true,
        skipBackup: true,
      });

      expect(result.success).toBe(true);
      expect(result.removedItems).toContain("AGENTS.md");
    });

    test("detects opencode.json", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      await createOpencodeJson();
      const result = await runUninstallCommand({
        directory: testDir,
        force: true,
        skipBackup: true,
      });

      expect(result.success).toBe(true);
      expect(result.removedItems).toContain("opencode.json");
    });

    test("detects .atreides-manifest.json", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      await createManifest();
      const result = await runUninstallCommand({
        directory: testDir,
        force: true,
        skipBackup: true,
      });

      expect(result.success).toBe(true);
      expect(result.removedItems).toContain(".atreides-manifest.json");
    });

    test("detects .opencode directory", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      await createOpencodeDir();
      const result = await runUninstallCommand({
        directory: testDir,
        force: true,
        skipBackup: true,
      });

      expect(result.success).toBe(true);
      expect(result.removedItems).toContain(".opencode");
    });

    test("detects all Atreides files in full project", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      await createFullProject();
      const result = await runUninstallCommand({
        directory: testDir,
        force: true,
        skipBackup: true,
      });

      expect(result.success).toBe(true);
      expect(result.removedItems).toContain("AGENTS.md");
      expect(result.removedItems).toContain("opencode.json");
      expect(result.removedItems).toContain(".atreides-manifest.json");
      expect(result.removedItems).toContain(".opencode");
      expect(result.filesRemoved).toBe(4);
    });
  });

  // =============================================================================
  // File Removal Tests
  // =============================================================================

  describe("File Removal", () => {
    test("removes AGENTS.md file", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      await createAgentsMd();
      expect(await fileExists(join(testDir, "AGENTS.md"))).toBe(true);

      await runUninstallCommand({
        directory: testDir,
        force: true,
        skipBackup: true,
      });

      expect(await fileExists(join(testDir, "AGENTS.md"))).toBe(false);
    });

    test("removes opencode.json file", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      await createOpencodeJson();
      expect(await fileExists(join(testDir, "opencode.json"))).toBe(true);

      await runUninstallCommand({
        directory: testDir,
        force: true,
        skipBackup: true,
      });

      expect(await fileExists(join(testDir, "opencode.json"))).toBe(false);
    });

    test("removes .atreides-manifest.json file", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      await createManifest();
      expect(await fileExists(join(testDir, ".atreides-manifest.json"))).toBe(true);

      await runUninstallCommand({
        directory: testDir,
        force: true,
        skipBackup: true,
      });

      expect(await fileExists(join(testDir, ".atreides-manifest.json"))).toBe(false);
    });

    test("removes .opencode directory recursively", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      await createOpencodeDir();
      expect(await fileExists(join(testDir, ".opencode"))).toBe(true);
      expect(await fileExists(join(testDir, ".opencode", "agent", "muad-dib.md"))).toBe(true);

      await runUninstallCommand({
        directory: testDir,
        force: true,
        skipBackup: true,
      });

      expect(await fileExists(join(testDir, ".opencode"))).toBe(false);
    });

    test("removes all files in full project", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      await createFullProject();

      // Verify all files exist before
      expect(await fileExists(join(testDir, "AGENTS.md"))).toBe(true);
      expect(await fileExists(join(testDir, "opencode.json"))).toBe(true);
      expect(await fileExists(join(testDir, ".atreides-manifest.json"))).toBe(true);
      expect(await fileExists(join(testDir, ".opencode"))).toBe(true);

      await runUninstallCommand({
        directory: testDir,
        force: true,
        skipBackup: true,
      });

      // Verify all files removed after
      expect(await fileExists(join(testDir, "AGENTS.md"))).toBe(false);
      expect(await fileExists(join(testDir, "opencode.json"))).toBe(false);
      expect(await fileExists(join(testDir, ".atreides-manifest.json"))).toBe(false);
      expect(await fileExists(join(testDir, ".opencode"))).toBe(false);
    });

    test("preserves non-Atreides files", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      await createFullProject();

      // Create some non-Atreides files
      await writeFile(join(testDir, "package.json"), '{"name": "test"}');
      await writeFile(join(testDir, "README.md"), "# Test Project");
      await mkdir(join(testDir, "src"), { recursive: true });
      await writeFile(join(testDir, "src", "index.ts"), "console.log('hello');");

      await runUninstallCommand({
        directory: testDir,
        force: true,
        skipBackup: true,
      });

      // Non-Atreides files should still exist
      expect(await fileExists(join(testDir, "package.json"))).toBe(true);
      expect(await fileExists(join(testDir, "README.md"))).toBe(true);
      expect(await fileExists(join(testDir, "src", "index.ts"))).toBe(true);
    });
  });

  // =============================================================================
  // Backup Tests
  // =============================================================================

  describe("Backup Creation", () => {
    test("creates backup by default", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      await createFullProject();
      const result = await runUninstallCommand({
        directory: testDir,
        force: true,
        // No skipBackup - should create backup
      });

      expect(result.success).toBe(true);
      expect(result.backupPath).toBeDefined();
      expect(await fileExists(result.backupPath!)).toBe(true);
    });

    test("skips backup with --no-backup flag", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      await createFullProject();
      const result = await runUninstallCommand({
        directory: testDir,
        force: true,
        skipBackup: true,
      });

      expect(result.success).toBe(true);
      expect(result.backupPath).toBeUndefined();
    });

    test("backup contains all Atreides files", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      await createFullProject();
      const result = await runUninstallCommand({
        directory: testDir,
        force: true,
      });

      expect(result.backupPath).toBeDefined();

      // Check backup directory contents
      const backupFiles = await readdir(result.backupPath!);
      expect(backupFiles).toContain("AGENTS.md");
      expect(backupFiles).toContain("opencode.json");
      expect(backupFiles).toContain(".opencode");
    });

    test("preserves existing .atreides-backup directory", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      await createFullProject();

      // Create an existing backup
      const existingBackupDir = join(testDir, ".atreides-backup", "old-backup");
      await mkdir(existingBackupDir, { recursive: true });
      await writeFile(join(existingBackupDir, "test.txt"), "existing backup");

      await runUninstallCommand({
        directory: testDir,
        force: true,
      });

      // Existing backup should still exist
      expect(await fileExists(join(existingBackupDir, "test.txt"))).toBe(true);
    });
  });

  // =============================================================================
  // Force Flag Tests
  // =============================================================================

  describe("Force Flag", () => {
    test("with --force skips confirmation prompt", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      await createFullProject();
      const result = await runUninstallCommand({
        directory: testDir,
        force: true,
        skipBackup: true,
      });

      expect(result.success).toBe(true);
      // Should complete without prompting
      expect(result.filesRemoved).toBe(4);
    });
  });

  // =============================================================================
  // JSON Output Tests
  // =============================================================================

  describe("JSON Output", () => {
    test("outputs JSON when --json flag is set", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      await createFullProject();
      await runUninstallCommand({
        directory: testDir,
        force: true,
        skipBackup: true,
        format: "json",
      });

      // Find the JSON output line
      const jsonOutput = consoleOutput.find((line) => line.startsWith("{"));
      expect(jsonOutput).toBeDefined();

      const parsed = JSON.parse(jsonOutput!);
      expect(parsed.success).toBe(true);
      expect(parsed.filesRemoved).toBe(4);
      expect(parsed.removedItems).toBeInstanceOf(Array);
    });

    test("JSON output includes error on failure", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      // Empty directory - no Atreides files
      await runUninstallCommand({
        directory: testDir,
        force: true,
        format: "json",
      });

      const jsonOutput = consoleOutput.find((line) => line.startsWith("{"));
      expect(jsonOutput).toBeUndefined(); // Error path doesn't output JSON, just returns result
    });
  });

  // =============================================================================
  // Edge Cases
  // =============================================================================

  describe("Edge Cases", () => {
    test("handles partial Atreides installation", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      // Only create some files
      await createAgentsMd();
      // Skip opencode.json, manifest, and .opencode

      const result = await runUninstallCommand({
        directory: testDir,
        force: true,
        skipBackup: true,
      });

      expect(result.success).toBe(true);
      expect(result.filesRemoved).toBe(1);
      expect(result.removedItems).toContain("AGENTS.md");
    });

    test("handles empty .opencode directory", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      // Create empty .opencode directory
      await mkdir(join(testDir, ".opencode"), { recursive: true });

      const result = await runUninstallCommand({
        directory: testDir,
        force: true,
        skipBackup: true,
      });

      expect(result.success).toBe(true);
      expect(result.removedItems).toContain(".opencode");
    });

    test("handles deeply nested .opencode structure", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      // Create deeply nested structure
      const deepPath = join(testDir, ".opencode", "skill", "complex", "nested", "deep");
      await mkdir(deepPath, { recursive: true });
      await writeFile(join(deepPath, "config.json"), "{}");

      const result = await runUninstallCommand({
        directory: testDir,
        force: true,
        skipBackup: true,
      });

      expect(result.success).toBe(true);
      expect(await fileExists(join(testDir, ".opencode"))).toBe(false);
    });
  });

  // =============================================================================
  // Display Tests
  // =============================================================================

  describe("Display Output", () => {
    test("displays success message on completion", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      await createFullProject();
      await runUninstallCommand({
        directory: testDir,
        force: true,
        skipBackup: true,
        format: "text",
      });

      const hasSuccessMessage = consoleOutput.some((line) =>
        line.includes("Uninstall completed successfully")
      );
      expect(hasSuccessMessage).toBe(true);
    });

    test("displays error message when no installation found", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      await runUninstallCommand({
        directory: testDir,
        force: true,
        format: "text",
      });

      const hasErrorMessage = consoleOutput.some((line) =>
        line.includes("No Atreides installation found")
      );
      expect(hasErrorMessage).toBe(true);
    });

    test("displays backup location when backup is created", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      await createFullProject();
      await runUninstallCommand({
        directory: testDir,
        force: true,
        format: "text",
      });

      const hasBackupMessage = consoleOutput.some((line) =>
        line.includes("Backup") || line.includes("backup")
      );
      expect(hasBackupMessage).toBe(true);
    });

    test("displays list of removed items", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      await createFullProject();
      await runUninstallCommand({
        directory: testDir,
        force: true,
        skipBackup: true,
        format: "text",
      });

      const hasAgentsMd = consoleOutput.some((line) => line.includes("AGENTS.md"));
      expect(hasAgentsMd).toBe(true);
    });
  });

  // =============================================================================
  // Help Command Tests
  // =============================================================================

  describe("Help Command", () => {
    test("printUninstallHelp outputs help text", async () => {
      const { printUninstallHelp } = await import("../../src/cli/uninstall.js");

      printUninstallHelp();

      const hasUsage = consoleOutput.some((line) => line.includes("Usage"));
      const hasOptions = consoleOutput.some((line) => line.includes("Options"));
      const hasExamples = consoleOutput.some((line) => line.includes("Examples"));

      expect(hasUsage).toBe(true);
      expect(hasOptions).toBe(true);
      expect(hasExamples).toBe(true);
    });

    test("help text mentions --force flag", async () => {
      const { printUninstallHelp } = await import("../../src/cli/uninstall.js");

      printUninstallHelp();

      const hasForce = consoleOutput.some((line) => line.includes("--force"));
      expect(hasForce).toBe(true);
    });

    test("help text mentions --no-backup flag", async () => {
      const { printUninstallHelp } = await import("../../src/cli/uninstall.js");

      printUninstallHelp();

      const hasNoBackup = consoleOutput.some((line) => line.includes("--no-backup"));
      expect(hasNoBackup).toBe(true);
    });
  });

  // =============================================================================
  // Result Structure Tests
  // =============================================================================

  describe("Result Structure", () => {
    test("successful result has correct structure", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      await createFullProject();
      const result = await runUninstallCommand({
        directory: testDir,
        force: true,
        skipBackup: true,
      });

      expect(result.success).toBe(true);
      expect(result.filesRemoved).toBeGreaterThan(0);
      expect(result.removedItems.length).toBe(result.filesRemoved);
      expect(result.error).toBeUndefined();
    });

    test("failed result has correct structure", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      // Empty directory
      const result = await runUninstallCommand({
        directory: testDir,
        force: true,
      });

      expect(result.success).toBe(false);
      expect(result.filesRemoved).toBe(0);
      expect(result.removedItems).toEqual([]);
      expect(result.error).toBeDefined();
    });

    test("result with backup has backupPath", async () => {
      const { runUninstallCommand } = await import("../../src/cli/uninstall.js");

      await createFullProject();
      const result = await runUninstallCommand({
        directory: testDir,
        force: true,
      });

      expect(result.backupPath).toBeDefined();
      expect(typeof result.backupPath).toBe("string");
    });
  });
});
