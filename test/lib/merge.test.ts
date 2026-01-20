/**
 * Merge Module Unit Tests
 *
 * Tests for structural detection, merge logic, and conflict handling.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { writeFile, mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseMarkdownSections,
  detectUserSections,
  detectModifiedSections,
  structuralMergeMarkdown,
  deepMerge,
  mergeConfig,
  mergeAgentsMd,
  mergeAgentFile,
  type MarkdownSection,
} from "../../src/lib/merge.js";
import { computeHash } from "../../src/lib/manifest.js";

describe("Merge Module", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `atreides-merge-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
  // parseMarkdownSections
  // ===========================================================================

  describe("parseMarkdownSections", () => {
    test("parses single section", () => {
      const content = "## Section Title\n\nSection content here.";
      const sections = parseMarkdownSections(content);

      expect(sections.length).toBe(1);
      expect(sections[0].header).toBe("Section Title");
      expect(sections[0].level).toBe(2);
      expect(sections[0].content).toBe("Section content here.");
    });

    test("parses multiple sections", () => {
      const content = `## First Section\n\nFirst content.\n\n## Second Section\n\nSecond content.`;
      const sections = parseMarkdownSections(content);

      expect(sections.length).toBe(2);
      expect(sections[0].header).toBe("First Section");
      expect(sections[1].header).toBe("Second Section");
    });

    test("handles different header levels", () => {
      const content = `# Level 1\n\nContent\n\n## Level 2\n\nMore\n\n### Level 3\n\nDeeper`;
      const sections = parseMarkdownSections(content);

      expect(sections.length).toBe(3);
      expect(sections[0].level).toBe(1);
      expect(sections[1].level).toBe(2);
      expect(sections[2].level).toBe(3);
    });

    test("tracks line numbers", () => {
      const content = `## First\n\nContent\n\n## Second\n\nMore`;
      const sections = parseMarkdownSections(content);

      expect(sections[0].startLine).toBe(0);
      expect(sections[1].startLine).toBe(4);
    });

    test("handles empty content", () => {
      const sections = parseMarkdownSections("");
      expect(sections).toEqual([]);
    });

    test("handles content without headers", () => {
      const content = "Just plain text\nNo headers here.";
      const sections = parseMarkdownSections(content);
      expect(sections).toEqual([]);
    });

    test("trims section content", () => {
      const content = "## Section\n\n  Content with spaces  \n\n";
      const sections = parseMarkdownSections(content);

      expect(sections[0].content).toBe("Content with spaces");
    });
  });

  // ===========================================================================
  // detectUserSections
  // ===========================================================================

  describe("detectUserSections", () => {
    test("detects sections not in template", () => {
      const currentSections: MarkdownSection[] = [
        { header: "Original", level: 2, content: "", startLine: 0, endLine: 0 },
        { header: "Custom", level: 2, content: "", startLine: 1, endLine: 1 },
      ];
      const templateSections: MarkdownSection[] = [
        { header: "Original", level: 2, content: "", startLine: 0, endLine: 0 },
      ];

      const userSections = detectUserSections(currentSections, templateSections);
      expect(userSections).toEqual(["Custom"]);
    });

    test("returns empty array when all sections match", () => {
      const sections: MarkdownSection[] = [
        { header: "One", level: 2, content: "", startLine: 0, endLine: 0 },
        { header: "Two", level: 2, content: "", startLine: 1, endLine: 1 },
      ];

      const userSections = detectUserSections(sections, sections);
      expect(userSections).toEqual([]);
    });

    test("is case-insensitive", () => {
      const current: MarkdownSection[] = [
        { header: "Section One", level: 2, content: "", startLine: 0, endLine: 0 },
      ];
      const template: MarkdownSection[] = [
        { header: "SECTION ONE", level: 2, content: "", startLine: 0, endLine: 0 },
      ];

      const userSections = detectUserSections(current, template);
      expect(userSections).toEqual([]);
    });
  });

  // ===========================================================================
  // detectModifiedSections
  // ===========================================================================

  describe("detectModifiedSections", () => {
    test("detects sections with different content", () => {
      const current: MarkdownSection[] = [
        { header: "Section", level: 2, content: "Modified content", startLine: 0, endLine: 0 },
      ];
      const template: MarkdownSection[] = [
        { header: "Section", level: 2, content: "Original content", startLine: 0, endLine: 0 },
      ];

      const modified = detectModifiedSections(current, template);
      expect(modified).toEqual(["Section"]);
    });

    test("returns empty when content matches", () => {
      const sections: MarkdownSection[] = [
        { header: "Section", level: 2, content: "Same content", startLine: 0, endLine: 0 },
      ];

      const modified = detectModifiedSections(sections, sections);
      expect(modified).toEqual([]);
    });

    test("ignores sections not in template", () => {
      const current: MarkdownSection[] = [
        { header: "Custom", level: 2, content: "User content", startLine: 0, endLine: 0 },
      ];
      const template: MarkdownSection[] = [];

      const modified = detectModifiedSections(current, template);
      expect(modified).toEqual([]);
    });
  });

  // ===========================================================================
  // structuralMergeMarkdown
  // ===========================================================================

  describe("structuralMergeMarkdown", () => {
    test("merges unmodified content with new template", () => {
      const current = "## Section\n\nOriginal content";
      const newTemplate = "## Section\n\nUpdated content";

      const result = structuralMergeMarkdown(current, newTemplate, current);

      expect(result.success).toBe(true);
      expect(result.result).toContain("Updated content");
    });

    test("preserves user-added sections", () => {
      const original = "## Original\n\nTemplate content";
      const current = "## Original\n\nTemplate content\n\n## Custom\n\nUser added this";
      const newTemplate = "## Original\n\nNew template content";

      const result = structuralMergeMarkdown(current, newTemplate, original);

      expect(result.success).toBe(true);
      expect(result.result).toContain("Custom");
      expect(result.result).toContain("User added this");
    });

    test("keeps user modifications when template unchanged", () => {
      const original = "## Section\n\nOriginal";
      const current = "## Section\n\nUser modified";
      const newTemplate = "## Section\n\nOriginal"; // Same as original

      const result = structuralMergeMarkdown(current, newTemplate, original);

      expect(result.success).toBe(true);
      expect(result.result).toContain("User modified");
    });

    test("detects conflict when both modified same section", () => {
      const original = "## Section\n\nOriginal content";
      const current = "## Section\n\nUser modified";
      const newTemplate = "## Section\n\nTemplate modified";

      const result = structuralMergeMarkdown(current, newTemplate, original);

      expect(result.conflicts).toBeDefined();
      expect(result.conflicts?.length).toBeGreaterThan(0);
    });

    test("handles new sections in template", () => {
      const original = "## Existing\n\nContent";
      const current = "## Existing\n\nContent";
      const newTemplate = "## Existing\n\nContent\n\n## New Section\n\nNew content";

      const result = structuralMergeMarkdown(current, newTemplate, original);

      expect(result.success).toBe(true);
      expect(result.result).toContain("New Section");
    });
  });

  // ===========================================================================
  // deepMerge
  // ===========================================================================

  describe("deepMerge", () => {
    test("merges simple objects", () => {
      const target = { a: 1, b: 2 };
      const source = { c: 3 };

      const result = deepMerge(target, source);
      expect(result).toEqual({ a: 1, b: 2, c: 3 });
    });

    test("preserves target values for existing keys", () => {
      const target = { a: "user" };
      const source = { a: "template" };

      const result = deepMerge(target, source);
      expect(result.a).toBe("user");
    });

    test("merges nested objects", () => {
      const target = { nested: { a: 1 } };
      const source = { nested: { b: 2 } };

      const result = deepMerge(target, source);
      expect(result.nested).toEqual({ a: 1, b: 2 });
    });

    test("merges arrays by concatenation (deduplicated)", () => {
      const target = { arr: [1, 2] };
      const source = { arr: [2, 3] };

      const result = deepMerge(target, source);
      expect(result.arr).toEqual([1, 2, 3]);
    });

    test("handles deeply nested structures", () => {
      const target = {
        level1: {
          level2: {
            level3: { a: 1 },
          },
        },
      };
      const source = {
        level1: {
          level2: {
            level3: { b: 2 },
          },
        },
      };

      const result = deepMerge(target, source);
      expect(result.level1.level2.level3).toEqual({ a: 1, b: 2 });
    });

    test("does not modify original objects", () => {
      const target = { a: 1 };
      const source = { b: 2 };

      deepMerge(target, source);
      expect(target).toEqual({ a: 1 });
      expect(source).toEqual({ b: 2 });
    });
  });

  // ===========================================================================
  // mergeConfig
  // ===========================================================================

  describe("mergeConfig", () => {
    test("creates config file when it does not exist", async () => {
      const newConfig = { atreides: { test: true } };
      const result = await mergeConfig(testDir, newConfig);

      expect(result.action).toBe("updated");

      const content = await readFile(join(testDir, "opencode.json"), "utf-8");
      expect(JSON.parse(content)).toEqual(newConfig);
    });

    test("preserves existing config values", async () => {
      const existing = {
        atreides: {
          identity: { personaName: "CustomName" },
        },
      };
      await writeFile(join(testDir, "opencode.json"), JSON.stringify(existing));

      const newTemplate = {
        atreides: {
          identity: { personaName: "Default" },
          newSection: { key: "value" },
        },
      };

      await mergeConfig(testDir, newTemplate);

      const content = await readFile(join(testDir, "opencode.json"), "utf-8");
      const parsed = JSON.parse(content);

      expect(parsed.atreides.identity.personaName).toBe("CustomName");
    });

    test("adds new config sections from template", async () => {
      const existing = { atreides: { existing: true } };
      await writeFile(join(testDir, "opencode.json"), JSON.stringify(existing));

      const newTemplate = {
        atreides: {
          existing: true,
          newSection: { key: "value" },
        },
      };

      await mergeConfig(testDir, newTemplate);

      const content = await readFile(join(testDir, "opencode.json"), "utf-8");
      const parsed = JSON.parse(content);

      expect(parsed.atreides.newSection).toEqual({ key: "value" });
    });
  });

  // ===========================================================================
  // mergeAgentsMd
  // ===========================================================================

  describe("mergeAgentsMd", () => {
    test("creates file when it does not exist", async () => {
      const template = "## Workflow Rules\n\nFollow best practices.";
      const result = await mergeAgentsMd(testDir, template);

      expect(result.action).toBe("updated");
      expect(result.file).toBe("AGENTS.md");
    });

    test("preserves user customizations", async () => {
      const original = "## Original\n\nTemplate content";
      await writeFile(join(testDir, "AGENTS.md"), original + "\n\n## Custom\n\nUser rules");

      const newTemplate = "## Original\n\nUpdated template";
      const result = await mergeAgentsMd(testDir, newTemplate);

      // When the resulting content is unchanged (user sections preserved),
      // the action is "preserved" since no actual file changes were made
      expect(result.action).toBe("preserved");

      const content = await readFile(join(testDir, "AGENTS.md"), "utf-8");
      expect(content).toContain("Custom");
      expect(content).toContain("Template content"); // User's version preserved
    });
  });

  // ===========================================================================
  // mergeAgentFile
  // ===========================================================================

  describe("mergeAgentFile", () => {
    beforeEach(async () => {
      await mkdir(join(testDir, ".opencode", "agent"), { recursive: true });
    });

    test("creates file when it does not exist", async () => {
      const template = "# Explore Agent\n\nConfiguration here.";
      const result = await mergeAgentFile(testDir, "explore.md", template);

      expect(result.action).toBe("updated");

      const content = await readFile(join(testDir, ".opencode", "agent", "explore.md"), "utf-8");
      expect(content).toBe(template);
    });

    test("updates unmodified file to new template", async () => {
      const original = "Original content";
      await writeFile(join(testDir, ".opencode", "agent", "test.md"), original);

      const manifestEntry = {
        path: ".opencode/agent/test.md",
        templateHash: computeHash(original),
        currentHash: computeHash(original),
        modified: false,
        createdAt: new Date().toISOString(),
        lastChecked: new Date().toISOString(),
      };

      const newTemplate = "Updated content";
      const result = await mergeAgentFile(testDir, "test.md", newTemplate, manifestEntry);

      expect(result.action).toBe("updated");
    });

    test("preserves user modifications when template unchanged", async () => {
      const original = "Original";
      const modified = "User modified";
      await writeFile(join(testDir, ".opencode", "agent", "test.md"), modified);

      const manifestEntry = {
        path: ".opencode/agent/test.md",
        templateHash: computeHash(original),
        currentHash: computeHash(modified),
        modified: true,
        createdAt: new Date().toISOString(),
        lastChecked: new Date().toISOString(),
      };

      const result = await mergeAgentFile(testDir, "test.md", original, manifestEntry);

      expect(result.action).toBe("preserved");

      const content = await readFile(join(testDir, ".opencode", "agent", "test.md"), "utf-8");
      expect(content).toBe(modified);
    });

    test("detects conflict when both modified", async () => {
      const original = "Original";
      const userModified = "User modified";
      await writeFile(join(testDir, ".opencode", "agent", "test.md"), userModified);

      const manifestEntry = {
        path: ".opencode/agent/test.md",
        templateHash: computeHash(original),
        currentHash: computeHash(userModified),
        modified: true,
        createdAt: new Date().toISOString(),
        lastChecked: new Date().toISOString(),
      };

      const newTemplate = "Template modified";
      const result = await mergeAgentFile(testDir, "test.md", newTemplate, manifestEntry);

      expect(result.action).toBe("conflict");
      expect(result.conflict).toBeDefined();
      expect(result.conflict?.userContent).toBe(userModified);
      expect(result.conflict?.newTemplate).toBe(newTemplate);
    });
  });
});
