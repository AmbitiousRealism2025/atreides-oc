/**
 * Manifest Module Unit Tests
 *
 * Tests for customization manifest handling and change detection.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  computeHash,
  createManifest,
  createFileEntry,
  createMarkdownFileEntry,
  extractMarkdownSections,
  loadManifest,
  saveManifest,
  detectChanges,
  detectMarkdownChanges,
  isMarkdownFileEntry,
  type CustomizationManifest,
  type FileEntry,
  type MarkdownFileEntry,
} from "../../src/lib/manifest.js";

describe("Manifest Module", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `atreides-manifest-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ===========================================================================
  // computeHash
  // ===========================================================================

  describe("computeHash", () => {
    test("returns consistent hash for same content", () => {
      const content = "test content";
      const hash1 = computeHash(content);
      const hash2 = computeHash(content);
      expect(hash1).toBe(hash2);
    });

    test("returns different hash for different content", () => {
      const hash1 = computeHash("content one");
      const hash2 = computeHash("content two");
      expect(hash1).not.toBe(hash2);
    });

    test("returns 16-character hash", () => {
      const hash = computeHash("any content");
      expect(hash.length).toBe(16);
    });

    test("handles empty string", () => {
      const hash = computeHash("");
      expect(hash).toBeDefined();
      expect(hash.length).toBe(16);
    });

    test("handles unicode content", () => {
      const hash = computeHash("测试内容 🎉");
      expect(hash).toBeDefined();
      expect(hash.length).toBe(16);
    });
  });

  // ===========================================================================
  // createManifest
  // ===========================================================================

  describe("createManifest", () => {
    test("creates manifest with correct version", () => {
      const manifest = createManifest("1.0.0");
      expect(manifest.version).toBe("1.0.0");
    });

    test("creates manifest with package version", () => {
      const manifest = createManifest("2.0.0");
      expect(manifest.packageVersion).toBe("2.0.0");
    });

    test("creates manifest with timestamps", () => {
      const manifest = createManifest("1.0.0");
      expect(manifest.createdAt).toBeDefined();
      expect(manifest.updatedAt).toBeDefined();
      expect(new Date(manifest.createdAt).getTime()).not.toBeNaN();
    });

    test("creates manifest with empty files object", () => {
      const manifest = createManifest("1.0.0");
      expect(manifest.files).toEqual({});
    });
  });

  // ===========================================================================
  // createFileEntry
  // ===========================================================================

  describe("createFileEntry", () => {
    test("creates entry with correct path", () => {
      const entry = createFileEntry("test.md", "template", "current");
      expect(entry.path).toBe("test.md");
    });

    test("computes template hash correctly", () => {
      const entry = createFileEntry("test.md", "template content", "current");
      expect(entry.templateHash).toBe(computeHash("template content"));
    });

    test("computes current hash correctly", () => {
      const entry = createFileEntry("test.md", "template", "current content");
      expect(entry.currentHash).toBe(computeHash("current content"));
    });

    test("sets modified true when hashes differ", () => {
      const entry = createFileEntry("test.md", "template", "different");
      expect(entry.modified).toBe(true);
    });

    test("sets modified false when hashes match", () => {
      const entry = createFileEntry("test.md", "same content", "same content");
      expect(entry.modified).toBe(false);
    });

    test("includes timestamps", () => {
      const entry = createFileEntry("test.md", "a", "b");
      expect(entry.createdAt).toBeDefined();
      expect(entry.lastChecked).toBeDefined();
    });
  });

  // ===========================================================================
  // extractMarkdownSections
  // ===========================================================================

  describe("extractMarkdownSections", () => {
    test("extracts single section", () => {
      const content = "## Section One\n\nContent here.";
      const sections = extractMarkdownSections(content);
      expect(sections.length).toBe(1);
      expect(sections[0].header).toBe("## Section One");
    });

    test("extracts multiple sections", () => {
      const content = `## Section One\n\nContent one.\n\n## Section Two\n\nContent two.`;
      const sections = extractMarkdownSections(content);
      expect(sections.length).toBe(2);
      expect(sections[0].header).toBe("## Section One");
      expect(sections[1].header).toBe("## Section Two");
    });

    test("handles different header levels", () => {
      const content = `# H1\n\n## H2\n\n### H3`;
      const sections = extractMarkdownSections(content);
      expect(sections.length).toBe(3);
      expect(sections[0].header).toBe("# H1");
      expect(sections[1].header).toBe("## H2");
      expect(sections[2].header).toBe("### H3");
    });

    test("computes hash for section content", () => {
      const content = "## Test\n\nContent here.";
      const sections = extractMarkdownSections(content);
      expect(sections[0].hash).toBeDefined();
      expect(sections[0].hash.length).toBe(16);
    });

    test("handles empty content", () => {
      const sections = extractMarkdownSections("");
      expect(sections).toEqual([]);
    });

    test("handles content without sections", () => {
      const content = "Just some text without headers.";
      const sections = extractMarkdownSections(content);
      expect(sections).toEqual([]);
    });
  });

  // ===========================================================================
  // createMarkdownFileEntry
  // ===========================================================================

  describe("createMarkdownFileEntry", () => {
    test("creates entry with sections", () => {
      const entry = createMarkdownFileEntry(
        "AGENTS.md",
        "## Template\n\nContent",
        "## Template\n\nContent\n\n## User Added\n\nCustom",
        [{ header: "## Template", hash: "abc", userAdded: false }],
        [
          { header: "## Template", hash: "abc", userAdded: false },
          { header: "## User Added", hash: "def", userAdded: false },
        ]
      );

      expect(isMarkdownFileEntry(entry)).toBe(true);
      expect(entry.sections.length).toBe(2);
    });

    test("marks user-added sections", () => {
      const entry = createMarkdownFileEntry(
        "AGENTS.md",
        "## Original\n\nContent",
        "## Original\n\nContent\n\n## Custom\n\nNew",
        [{ header: "## Original", hash: "abc", userAdded: false }],
        [
          { header: "## Original", hash: "abc", userAdded: false },
          { header: "## Custom", hash: "def", userAdded: false },
        ]
      );

      const userAddedSection = entry.sections.find(s => s.header === "## Custom");
      expect(userAddedSection?.userAdded).toBe(true);
    });
  });

  // ===========================================================================
  // loadManifest / saveManifest
  // ===========================================================================

  describe("loadManifest", () => {
    test("returns null when manifest does not exist", async () => {
      const manifest = await loadManifest(testDir);
      expect(manifest).toBeNull();
    });

    test("loads manifest from file", async () => {
      const original: CustomizationManifest = {
        version: "1.0.0",
        packageVersion: "0.1.0",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        files: {},
      };

      await writeFile(
        join(testDir, ".atreides-manifest.json"),
        JSON.stringify(original)
      );

      const loaded = await loadManifest(testDir);
      expect(loaded).not.toBeNull();
      expect(loaded?.version).toBe("1.0.0");
    });

    test("returns null for invalid JSON", async () => {
      await writeFile(
        join(testDir, ".atreides-manifest.json"),
        "{ invalid json }"
      );

      const manifest = await loadManifest(testDir);
      expect(manifest).toBeNull();
    });
  });

  describe("saveManifest", () => {
    test("saves manifest to file", async () => {
      const manifest = createManifest("0.1.0");
      await saveManifest(testDir, manifest);

      const loaded = await loadManifest(testDir);
      expect(loaded).not.toBeNull();
      expect(loaded?.packageVersion).toBe("0.1.0");
    });

    test("updates updatedAt timestamp", async () => {
      const manifest = createManifest("0.1.0");
      const originalUpdatedAt = manifest.updatedAt;

      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      await saveManifest(testDir, manifest);
      expect(manifest.updatedAt).not.toBe(originalUpdatedAt);
    });
  });

  // ===========================================================================
  // detectChanges
  // ===========================================================================

  describe("detectChanges", () => {
    test("detects no conflict when nothing changed", () => {
      const entry = createFileEntry("test.md", "same", "same");
      const result = detectChanges("same", "same", entry);

      expect(result.userModified).toBe(false);
      expect(result.templateChanged).toBe(false);
      expect(result.hasConflict).toBe(false);
    });

    test("detects user modification only", () => {
      const entry = createFileEntry("test.md", "original", "original");
      const result = detectChanges("user modified", "original", entry);

      expect(result.userModified).toBe(true);
      expect(result.templateChanged).toBe(false);
      expect(result.hasConflict).toBe(false);
    });

    test("detects template change only", () => {
      const entry = createFileEntry("test.md", "original", "original");
      const result = detectChanges("original", "new template", entry);

      expect(result.userModified).toBe(false);
      expect(result.templateChanged).toBe(true);
      expect(result.hasConflict).toBe(false);
    });

    test("detects conflict when both changed", () => {
      const entry = createFileEntry("test.md", "original", "original");
      const result = detectChanges("user modified", "new template", entry);

      expect(result.userModified).toBe(true);
      expect(result.templateChanged).toBe(true);
      expect(result.hasConflict).toBe(true);
    });

    test("assumes conflict when no manifest entry", () => {
      const result = detectChanges("current", "new", null);

      expect(result.hasConflict).toBe(true);
    });
  });

  // ===========================================================================
  // detectMarkdownChanges
  // ===========================================================================

  describe("detectMarkdownChanges", () => {
    test("detects user-added sections", () => {
      const current = "## Original\n\nContent\n\n## Custom\n\nNew";
      const newTemplate = "## Original\n\nContent";
      const entry = createMarkdownFileEntry(
        "test.md",
        "## Original\n\nContent",
        current,
        [{ header: "## Original", hash: computeHash("Content"), userAdded: false }],
        [
          { header: "## Original", hash: computeHash("Content"), userAdded: false },
          { header: "## Custom", hash: computeHash("New"), userAdded: false },
        ]
      );

      const result = detectMarkdownChanges(current, newTemplate, entry);
      expect(result.userAddedSections).toContain("## Custom");
    });

    test("handles no manifest entry gracefully", () => {
      const result = detectMarkdownChanges(
        "## Test\n\nContent",
        "## Test\n\nDifferent",
        null
      );

      expect(result.hasConflict).toBe(true);
    });
  });

  // ===========================================================================
  // isMarkdownFileEntry
  // ===========================================================================

  describe("isMarkdownFileEntry", () => {
    test("returns true for markdown file entry", () => {
      const entry = createMarkdownFileEntry(
        "test.md",
        "template",
        "current",
        [],
        []
      );
      expect(isMarkdownFileEntry(entry)).toBe(true);
    });

    test("returns false for regular file entry", () => {
      const entry = createFileEntry("test.ts", "template", "current");
      expect(isMarkdownFileEntry(entry)).toBe(false);
    });
  });
});
