/**
 * Skill Generator Unit Tests
 *
 * Tests for skill template loading, rendering, and file generation.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { readFile, mkdir, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  SkillGenerator,
  createSkillGenerator,
  generateMVPSkills,
  MVP_SKILL_NAMES,
  MVP_SKILL_CONFIGS,
  ADVANCED_SKILL_NAMES,
  ADVANCED_SKILL_CONFIGS,
  EXTENDED_SKILL_NAMES,
  EXTENDED_SKILL_CONFIGS,
  ALL_SKILL_NAMES,
  isMVPSkill,
  isAdvancedSkill,
  isExtendedSkill,
  getDefaultSkillConfig,
  getDefaultAdvancedSkillConfig,
  getDefaultExtendedSkillConfig,
  getAllMVPSkillConfigs,
  getAllAdvancedSkillConfigs,
  getAllExtendedSkillConfigs,
  getAllSkillConfigs,
  type SkillConfig,
  type SkillGenerationOptions,
} from "../../src/generators/index.js";

describe("Skill Generator Module", () => {
  let testDir: string;
  let templateDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `atreides-skill-gen-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await mkdir(testDir, { recursive: true });

    // Use the actual templates directory from the package
    templateDir = join(process.cwd(), "templates", "skills");
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ===========================================================================
  // Type Guards and Constants
  // ===========================================================================

  describe("isMVPSkill", () => {
    test("returns true for valid MVP skill names", () => {
      expect(isMVPSkill("base")).toBe(true);
      expect(isMVPSkill("orchestrate")).toBe(true);
      expect(isMVPSkill("explore")).toBe(true);
      expect(isMVPSkill("validate")).toBe(true);
    });

    test("returns false for non-MVP skill names", () => {
      expect(isMVPSkill("lsp")).toBe(false);
      expect(isMVPSkill("refactor")).toBe(false);
      expect(isMVPSkill("checkpoint")).toBe(false);
      expect(isMVPSkill("unknown")).toBe(false);
    });
  });

  describe("MVP_SKILL_NAMES", () => {
    test("contains exactly 4 MVP skills", () => {
      expect(MVP_SKILL_NAMES.length).toBe(4);
    });

    test("contains all expected skills", () => {
      expect(MVP_SKILL_NAMES).toContain("base");
      expect(MVP_SKILL_NAMES).toContain("orchestrate");
      expect(MVP_SKILL_NAMES).toContain("explore");
      expect(MVP_SKILL_NAMES).toContain("validate");
    });
  });

  describe("MVP_SKILL_CONFIGS", () => {
    test("has config for each MVP skill", () => {
      for (const name of MVP_SKILL_NAMES) {
        expect(MVP_SKILL_CONFIGS[name]).toBeDefined();
      }
    });

    test("main context for base and orchestrate skills", () => {
      expect(MVP_SKILL_CONFIGS.base.contextType).toBe("main");
      expect(MVP_SKILL_CONFIGS.orchestrate.contextType).toBe("main");
    });

    test("fork context for explore and validate skills", () => {
      expect(MVP_SKILL_CONFIGS.explore.contextType).toBe("fork");
      expect(MVP_SKILL_CONFIGS.validate.contextType).toBe("fork");
    });

    test("all skills enabled by default", () => {
      for (const name of MVP_SKILL_NAMES) {
        expect(MVP_SKILL_CONFIGS[name].enabled).toBe(true);
      }
    });

    test("all skills have descriptions", () => {
      for (const name of MVP_SKILL_NAMES) {
        expect(MVP_SKILL_CONFIGS[name].description).toBeDefined();
        expect(MVP_SKILL_CONFIGS[name].description.length).toBeGreaterThan(10);
      }
    });
  });

  describe("getDefaultSkillConfig", () => {
    test("returns a copy of the default config", () => {
      const config1 = getDefaultSkillConfig("base");
      const config2 = getDefaultSkillConfig("base");

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Should be different objects
    });

    test("returns correct config for each skill", () => {
      expect(getDefaultSkillConfig("base").name).toBe("base");
      expect(getDefaultSkillConfig("orchestrate").name).toBe("orchestrate");
      expect(getDefaultSkillConfig("explore").name).toBe("explore");
      expect(getDefaultSkillConfig("validate").name).toBe("validate");
    });
  });

  describe("getAllMVPSkillConfigs", () => {
    test("returns all 4 MVP skill configs", () => {
      const configs = getAllMVPSkillConfigs();
      expect(configs.length).toBe(4);
    });

    test("returns configs for all MVP skills", () => {
      const configs = getAllMVPSkillConfigs();
      const names = configs.map((c) => c.name);

      expect(names).toContain("base");
      expect(names).toContain("orchestrate");
      expect(names).toContain("explore");
      expect(names).toContain("validate");
    });
  });

  // ===========================================================================
  // Advanced Skills - Type Guards and Constants
  // ===========================================================================

  describe("isAdvancedSkill", () => {
    test("returns true for valid advanced skill names", () => {
      expect(isAdvancedSkill("lsp")).toBe(true);
      expect(isAdvancedSkill("refactor")).toBe(true);
      expect(isAdvancedSkill("checkpoint")).toBe(true);
      expect(isAdvancedSkill("tdd")).toBe(true);
    });

    test("returns false for MVP skill names", () => {
      expect(isAdvancedSkill("base")).toBe(false);
      expect(isAdvancedSkill("orchestrate")).toBe(false);
      expect(isAdvancedSkill("explore")).toBe(false);
      expect(isAdvancedSkill("validate")).toBe(false);
    });

    test("returns false for unknown skill names", () => {
      expect(isAdvancedSkill("unknown")).toBe(false);
      expect(isAdvancedSkill("")).toBe(false);
    });
  });

  describe("ADVANCED_SKILL_NAMES", () => {
    test("contains exactly 4 advanced skills", () => {
      expect(ADVANCED_SKILL_NAMES.length).toBe(4);
    });

    test("contains all expected advanced skills", () => {
      expect(ADVANCED_SKILL_NAMES).toContain("lsp");
      expect(ADVANCED_SKILL_NAMES).toContain("refactor");
      expect(ADVANCED_SKILL_NAMES).toContain("checkpoint");
      expect(ADVANCED_SKILL_NAMES).toContain("tdd");
    });
  });

  describe("ALL_SKILL_NAMES", () => {
    test("contains all 12 skills (MVP + Advanced + Extended)", () => {
      expect(ALL_SKILL_NAMES.length).toBe(12);
    });

    test("contains all MVP, advanced, and extended skills", () => {
      // MVP skills
      expect(ALL_SKILL_NAMES).toContain("base");
      expect(ALL_SKILL_NAMES).toContain("orchestrate");
      expect(ALL_SKILL_NAMES).toContain("explore");
      expect(ALL_SKILL_NAMES).toContain("validate");
      // Advanced skills
      expect(ALL_SKILL_NAMES).toContain("lsp");
      expect(ALL_SKILL_NAMES).toContain("refactor");
      expect(ALL_SKILL_NAMES).toContain("checkpoint");
      expect(ALL_SKILL_NAMES).toContain("tdd");
      // Extended skills
      expect(ALL_SKILL_NAMES).toContain("parallel-explore");
      expect(ALL_SKILL_NAMES).toContain("incremental-refactor");
      expect(ALL_SKILL_NAMES).toContain("doc-sync");
      expect(ALL_SKILL_NAMES).toContain("quality-gate");
    });
  });

  describe("ADVANCED_SKILL_CONFIGS", () => {
    test("has config for each advanced skill", () => {
      for (const name of ADVANCED_SKILL_NAMES) {
        expect(ADVANCED_SKILL_CONFIGS[name]).toBeDefined();
      }
    });

    test("main context for checkpoint skill only", () => {
      expect(ADVANCED_SKILL_CONFIGS.checkpoint.contextType).toBe("main");
    });

    test("fork context for lsp, refactor, and tdd skills", () => {
      expect(ADVANCED_SKILL_CONFIGS.lsp.contextType).toBe("fork");
      expect(ADVANCED_SKILL_CONFIGS.refactor.contextType).toBe("fork");
      expect(ADVANCED_SKILL_CONFIGS.tdd.contextType).toBe("fork");
    });

    test("all advanced skills enabled by default", () => {
      for (const name of ADVANCED_SKILL_NAMES) {
        expect(ADVANCED_SKILL_CONFIGS[name].enabled).toBe(true);
      }
    });

    test("all advanced skills have descriptions", () => {
      for (const name of ADVANCED_SKILL_NAMES) {
        expect(ADVANCED_SKILL_CONFIGS[name].description).toBeDefined();
        expect(ADVANCED_SKILL_CONFIGS[name].description.length).toBeGreaterThan(10);
      }
    });
  });

  describe("getDefaultAdvancedSkillConfig", () => {
    test("returns a copy of the default config", () => {
      const config1 = getDefaultAdvancedSkillConfig("lsp");
      const config2 = getDefaultAdvancedSkillConfig("lsp");

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Should be different objects
    });

    test("returns correct config for each advanced skill", () => {
      expect(getDefaultAdvancedSkillConfig("lsp").name).toBe("lsp");
      expect(getDefaultAdvancedSkillConfig("refactor").name).toBe("refactor");
      expect(getDefaultAdvancedSkillConfig("checkpoint").name).toBe("checkpoint");
      expect(getDefaultAdvancedSkillConfig("tdd").name).toBe("tdd");
    });
  });

  describe("getAllAdvancedSkillConfigs", () => {
    test("returns all 4 advanced skill configs", () => {
      const configs = getAllAdvancedSkillConfigs();
      expect(configs.length).toBe(4);
    });

    test("returns configs for all advanced skills", () => {
      const configs = getAllAdvancedSkillConfigs();
      const names = configs.map((c) => c.name);

      expect(names).toContain("lsp");
      expect(names).toContain("refactor");
      expect(names).toContain("checkpoint");
      expect(names).toContain("tdd");
    });
  });

  // ===========================================================================
  // Extended Skill Types and Configs (Post-MVP Phase 2, Set 2)
  // ===========================================================================

  describe("EXTENDED_SKILL_NAMES", () => {
    test("has 4 extended skills", () => {
      expect(EXTENDED_SKILL_NAMES.length).toBe(4);
    });

    test("contains all expected extended skills", () => {
      expect(EXTENDED_SKILL_NAMES).toContain("parallel-explore");
      expect(EXTENDED_SKILL_NAMES).toContain("incremental-refactor");
      expect(EXTENDED_SKILL_NAMES).toContain("doc-sync");
      expect(EXTENDED_SKILL_NAMES).toContain("quality-gate");
    });
  });

  describe("isExtendedSkill", () => {
    test("returns true for extended skills", () => {
      expect(isExtendedSkill("parallel-explore")).toBe(true);
      expect(isExtendedSkill("incremental-refactor")).toBe(true);
      expect(isExtendedSkill("doc-sync")).toBe(true);
      expect(isExtendedSkill("quality-gate")).toBe(true);
    });

    test("returns false for MVP skills", () => {
      expect(isExtendedSkill("base")).toBe(false);
      expect(isExtendedSkill("orchestrate")).toBe(false);
    });

    test("returns false for advanced skills", () => {
      expect(isExtendedSkill("lsp")).toBe(false);
      expect(isExtendedSkill("refactor")).toBe(false);
    });

    test("returns false for unknown skills", () => {
      expect(isExtendedSkill("unknown")).toBe(false);
    });
  });

  describe("EXTENDED_SKILL_CONFIGS", () => {
    test("has config for each extended skill", () => {
      for (const name of EXTENDED_SKILL_NAMES) {
        expect(EXTENDED_SKILL_CONFIGS[name]).toBeDefined();
      }
    });

    test("fork context for all extended skills", () => {
      expect(EXTENDED_SKILL_CONFIGS["parallel-explore"].contextType).toBe("fork");
      expect(EXTENDED_SKILL_CONFIGS["incremental-refactor"].contextType).toBe("fork");
      expect(EXTENDED_SKILL_CONFIGS["doc-sync"].contextType).toBe("fork");
      expect(EXTENDED_SKILL_CONFIGS["quality-gate"].contextType).toBe("fork");
    });

    test("all extended skills enabled by default", () => {
      for (const name of EXTENDED_SKILL_NAMES) {
        expect(EXTENDED_SKILL_CONFIGS[name].enabled).toBe(true);
      }
    });

    test("all extended skills have descriptions", () => {
      for (const name of EXTENDED_SKILL_NAMES) {
        expect(EXTENDED_SKILL_CONFIGS[name].description).toBeDefined();
        expect(EXTENDED_SKILL_CONFIGS[name].description.length).toBeGreaterThan(10);
      }
    });
  });

  describe("getDefaultExtendedSkillConfig", () => {
    test("returns a copy of the default config", () => {
      const config1 = getDefaultExtendedSkillConfig("parallel-explore");
      const config2 = getDefaultExtendedSkillConfig("parallel-explore");

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Should be different objects
    });

    test("returns correct config for each extended skill", () => {
      expect(getDefaultExtendedSkillConfig("parallel-explore").name).toBe("parallel-explore");
      expect(getDefaultExtendedSkillConfig("incremental-refactor").name).toBe("incremental-refactor");
      expect(getDefaultExtendedSkillConfig("doc-sync").name).toBe("doc-sync");
      expect(getDefaultExtendedSkillConfig("quality-gate").name).toBe("quality-gate");
    });
  });

  describe("getAllExtendedSkillConfigs", () => {
    test("returns all 4 extended skill configs", () => {
      const configs = getAllExtendedSkillConfigs();
      expect(configs.length).toBe(4);
    });

    test("returns configs for all extended skills", () => {
      const configs = getAllExtendedSkillConfigs();
      const names = configs.map((c) => c.name);

      expect(names).toContain("parallel-explore");
      expect(names).toContain("incremental-refactor");
      expect(names).toContain("doc-sync");
      expect(names).toContain("quality-gate");
    });
  });

  describe("getAllSkillConfigs", () => {
    test("returns all 12 skill configs", () => {
      const configs = getAllSkillConfigs();
      expect(configs.length).toBe(12);
    });

    test("returns configs for all skills", () => {
      const configs = getAllSkillConfigs();
      const names = configs.map((c) => c.name);

      // MVP
      expect(names).toContain("base");
      expect(names).toContain("orchestrate");
      expect(names).toContain("explore");
      expect(names).toContain("validate");
      // Advanced
      expect(names).toContain("lsp");
      expect(names).toContain("refactor");
      expect(names).toContain("checkpoint");
      expect(names).toContain("tdd");
      // Extended
      expect(names).toContain("parallel-explore");
      expect(names).toContain("incremental-refactor");
      expect(names).toContain("doc-sync");
      expect(names).toContain("quality-gate");
    });
  });

  // ===========================================================================
  // SkillGenerator - Template Loading
  // ===========================================================================

  describe("SkillGenerator Template Loading", () => {
    test("loads template for valid skill", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const template = await generator.loadTemplate("base");
      expect(template).toBeDefined();
      expect(template).toContain("{{contextType}}");
      expect(template).toContain("{{name}}");
    });

    test("loads templates for all MVP skills", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      for (const name of MVP_SKILL_NAMES) {
        const template = await generator.loadTemplate(name);
        expect(template).toBeDefined();
        expect(template.length).toBeGreaterThan(100);
      }
    });

    test("throws error for non-existent template", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      await expect(generator.loadTemplate("nonexistent")).rejects.toThrow(
        /Failed to load template/
      );
    });

    test("caches templates after first load", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const template1 = await generator.loadTemplate("base");
      const template2 = await generator.loadTemplate("base");

      expect(template1).toBe(template2);
    });

    test("clearCache removes cached templates", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      await generator.loadTemplate("base");
      generator.clearCache();

      // After clearing, loading again should still work
      const template = await generator.loadTemplate("base");
      expect(template).toBeDefined();
    });
  });

  // ===========================================================================
  // SkillGenerator - Template Rendering
  // ===========================================================================

  describe("SkillGenerator Template Rendering", () => {
    test("renders all placeholders", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const template = await generator.loadTemplate("orchestrate");
      const config: SkillConfig = {
        name: "orchestrate",
        contextType: "main",
        enabled: true,
        description: "Test orchestration description",
      };

      const rendered = generator.renderTemplate(template, config);
      expect(rendered).toContain("name: orchestrate");
      expect(rendered).toContain("contextType: main");
      expect(rendered).toContain("enabled: true");
      expect(rendered).toContain("description: Test orchestration description");
      expect(rendered).not.toContain("{{name}}");
      expect(rendered).not.toContain("{{contextType}}");
      expect(rendered).not.toContain("{{enabled}}");
      expect(rendered).not.toContain("{{description}}");
    });

    test("preserves other template content", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const template = await generator.loadTemplate("orchestrate");
      const config: SkillConfig = {
        name: "orchestrate",
        contextType: "main",
        enabled: true,
        description: "Workflow orchestration and agent delegation",
      };

      const rendered = generator.renderTemplate(template, config);
      expect(rendered).toContain("# Orchestrate Skill");
      expect(rendered).toContain("## Purpose");
      expect(rendered).toContain("## Workflow Phases");
      expect(rendered).toContain("<!-- CUSTOM IMPLEMENTATION START -->");
      expect(rendered).toContain("<!-- CUSTOM IMPLEMENTATION END -->");
    });

    test("renders correctly for each MVP skill", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      for (const name of MVP_SKILL_NAMES) {
        const template = await generator.loadTemplate(name);
        const config = getDefaultSkillConfig(name);

        const rendered = generator.renderTemplate(template, config);
        expect(rendered).toContain(`name: ${name}`);
        expect(rendered).toContain(`contextType: ${config.contextType}`);
        expect(rendered).not.toContain("{{");
        expect(rendered).not.toContain("}}");
      }
    });

    test("renders fork context type correctly", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const template = await generator.loadTemplate("explore");
      const config: SkillConfig = {
        name: "explore",
        contextType: "fork",
        enabled: true,
        description: "Codebase exploration",
      };

      const rendered = generator.renderTemplate(template, config);
      expect(rendered).toContain("contextType: fork");
    });
  });

  // ===========================================================================
  // SkillGenerator - Frontmatter Parsing
  // ===========================================================================

  describe("SkillGenerator Frontmatter Parsing", () => {
    test("parses valid frontmatter", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const content = `---
name: orchestrate
contextType: main
enabled: true
description: Workflow orchestration and agent delegation
---

# Content`;

      const frontmatter = generator.parseFrontmatter(content);
      expect(frontmatter).not.toBeNull();
      expect(frontmatter?.name).toBe("orchestrate");
      expect(frontmatter?.contextType).toBe("main");
      expect(frontmatter?.enabled).toBe(true);
      expect(frontmatter?.description).toBe(
        "Workflow orchestration and agent delegation"
      );
    });

    test("returns null for content without frontmatter", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const content = "# Just content without frontmatter";
      const frontmatter = generator.parseFrontmatter(content);
      expect(frontmatter).toBeNull();
    });

    test("parses enabled: false correctly", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const content = `---
name: test
contextType: main
enabled: false
description: Test skill
---`;

      const frontmatter = generator.parseFrontmatter(content);
      expect(frontmatter?.enabled).toBe(false);
    });

    test("parses fork context type", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const content = `---
name: explore
contextType: fork
enabled: true
description: Exploration skill
---`;

      const frontmatter = generator.parseFrontmatter(content);
      expect(frontmatter?.contextType).toBe("fork");
    });

    test("returns null for invalid context type", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const content = `---
name: test
contextType: invalid
enabled: true
description: Test
---`;

      const frontmatter = generator.parseFrontmatter(content);
      expect(frontmatter).toBeNull();
    });
  });

  // ===========================================================================
  // SkillGenerator - Content Validation
  // ===========================================================================

  describe("SkillGenerator Content Validation", () => {
    test("validates content with valid frontmatter", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const validContent = `---
name: orchestrate
contextType: main
enabled: true
description: Workflow orchestration
---

# Content`;

      // Should not throw
      expect(() =>
        generator.validateContent(validContent, "orchestrate")
      ).not.toThrow();
    });

    test("throws for content without frontmatter", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const invalidContent = "# No frontmatter";
      expect(() => generator.validateContent(invalidContent, "test")).toThrow(
        /Invalid frontmatter/
      );
    });

    test("throws for content without name", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const invalidContent = `---
contextType: main
enabled: true
description: Test
---`;

      expect(() => generator.validateContent(invalidContent, "test")).toThrow(
        /Missing 'name'/
      );
    });

    test("throws for content without contextType", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const invalidContent = `---
name: test
enabled: true
description: Test
---`;

      // This will fail at parseFrontmatter returning null due to invalid contextType
      expect(() => generator.validateContent(invalidContent, "test")).toThrow(
        /Invalid frontmatter/
      );
    });

    test("throws for content without description", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const invalidContent = `---
name: test
contextType: main
enabled: true
---`;

      expect(() => generator.validateContent(invalidContent, "test")).toThrow(
        /Missing 'description'/
      );
    });
  });

  // ===========================================================================
  // SkillGenerator - File Generation
  // ===========================================================================

  describe("SkillGenerator File Generation", () => {
    test("generates single skill file", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const config = getDefaultSkillConfig("orchestrate");

      const result = await generator.generateSkillFile(config);
      expect(result.created).toBe(true);
      expect(result.updated).toBe(false);
      expect(result.error).toBeUndefined();

      // Verify file exists in subdirectory
      const filePath = join(testDir, ".opencode", "skill", "orchestrate", "SKILL.md");
      const fileExists = await access(filePath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);

      // Verify content
      const content = await readFile(filePath, "utf-8");
      expect(content).toContain("name: orchestrate");
      expect(content).toContain("contextType: main");
    });

    test("generates all 4 MVP skill files", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const configs = getAllMVPSkillConfigs();

      const results = await generator.generateSkillFiles(configs);

      expect(results.length).toBe(4);
      expect(results.every((r) => r.created)).toBe(true);
      expect(results.every((r) => !r.error)).toBe(true);

      // Verify all files exist
      for (const name of MVP_SKILL_NAMES) {
        const filePath = join(testDir, ".opencode", "skill", name, "SKILL.md");
        const fileExists = await access(filePath)
          .then(() => true)
          .catch(() => false);
        expect(fileExists).toBe(true);
      }
    });

    test("does not overwrite existing files by default", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const config = getDefaultSkillConfig("base");

      // Generate first time
      const result1 = await generator.generateSkillFile(config);
      expect(result1.created).toBe(true);

      // Generate second time
      const result2 = await generator.generateSkillFile(config);
      expect(result2.created).toBe(false);
      expect(result2.updated).toBe(false);
    });

    test("overwrites existing files when overwrite is true", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
        overwrite: true,
      });

      const config = getDefaultSkillConfig("base");

      // Generate first time
      const result1 = await generator.generateSkillFile(config);
      expect(result1.created).toBe(true);

      // Generate second time with overwrite
      const result2 = await generator.generateSkillFile(config);
      expect(result2.created).toBe(false);
      expect(result2.updated).toBe(true);
    });

    test("returns error for invalid skill template", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const config: SkillConfig = {
        name: "nonexistent-skill",
        contextType: "main",
        enabled: true,
        description: "Nonexistent skill",
      };

      const result = await generator.generateSkillFile(config);
      expect(result.created).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain("Failed to load template");
    });

    test("sets correct context type for main skills", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const config = getDefaultSkillConfig("orchestrate");
      await generator.generateSkillFile(config);

      const filePath = join(
        testDir,
        ".opencode",
        "skill",
        "orchestrate",
        "SKILL.md"
      );
      const content = await readFile(filePath, "utf-8");
      expect(content).toContain("contextType: main");
    });

    test("sets correct context type for fork skills", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const config = getDefaultSkillConfig("explore");
      await generator.generateSkillFile(config);

      const filePath = join(
        testDir,
        ".opencode",
        "skill",
        "explore",
        "SKILL.md"
      );
      const content = await readFile(filePath, "utf-8");
      expect(content).toContain("contextType: fork");
    });
  });

  // ===========================================================================
  // SkillGenerator - Output Path
  // ===========================================================================

  describe("SkillGenerator Output Path", () => {
    test("returns correct output path for skill", () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const path = generator.getSkillOutputPath("orchestrate");
      expect(path).toBe(".opencode/skill/orchestrate/SKILL.md");
    });

    test("returns correct output path for all MVP skills", () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      for (const name of MVP_SKILL_NAMES) {
        const path = generator.getSkillOutputPath(name);
        expect(path).toBe(`.opencode/skill/${name}/SKILL.md`);
      }
    });
  });

  // ===========================================================================
  // generateMVPSkills Convenience Function
  // ===========================================================================

  describe("generateMVPSkills", () => {
    test("generates all MVP skills with manifest tracking", async () => {
      const configs = getAllMVPSkillConfigs();

      const results = await generateMVPSkills(configs, testDir, { templateDir });

      expect(results.length).toBe(4);
      expect(results.every((r) => r.created)).toBe(true);

      // Verify manifest was created
      const manifestPath = join(testDir, ".atreides-manifest.json");
      const manifestExists = await access(manifestPath)
        .then(() => true)
        .catch(() => false);
      expect(manifestExists).toBe(true);

      const manifestContent = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(manifestContent);
      expect(Object.keys(manifest.files).length).toBe(4);
    });
  });

  // ===========================================================================
  // createSkillGenerator Factory
  // ===========================================================================

  describe("createSkillGenerator", () => {
    test("creates generator instance", () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      expect(generator).toBeInstanceOf(SkillGenerator);
    });

    test("uses custom template directory", async () => {
      const customTemplateDir = join(testDir, "custom-templates", "test-skill");
      await mkdir(customTemplateDir, { recursive: true });

      // Create a simple test template
      const testTemplate = `---
name: {{name}}
contextType: {{contextType}}
enabled: {{enabled}}
description: {{description}}
---

# Test Skill`;

      await import("node:fs/promises").then((fs) =>
        fs.writeFile(join(customTemplateDir, "SKILL.md.template"), testTemplate)
      );

      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir: join(testDir, "custom-templates"),
      });

      const template = await generator.loadTemplate("test-skill");
      expect(template).toContain("# Test Skill");
    });
  });

  // ===========================================================================
  // Advanced Skills - Template Loading and Generation
  // ===========================================================================

  describe("Advanced Skill Template Loading", () => {
    test("loads templates for all advanced skills", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      for (const name of ADVANCED_SKILL_NAMES) {
        const template = await generator.loadTemplate(name);
        expect(template).toBeDefined();
        expect(template.length).toBeGreaterThan(100);
        expect(template).toContain("{{name}}");
        expect(template).toContain("{{contextType}}");
      }
    });

    test("loads lsp skill template with correct content", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const template = await generator.loadTemplate("lsp");
      expect(template).toContain("# LSP Skill");
      expect(template).toContain("Language Server Protocol");
    });

    test("loads refactor skill template with correct content", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const template = await generator.loadTemplate("refactor");
      expect(template).toContain("# Refactor Skill");
      expect(template).toContain("refactoring");
    });

    test("loads checkpoint skill template with correct content", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const template = await generator.loadTemplate("checkpoint");
      expect(template).toContain("# Checkpoint Skill");
      expect(template).toContain("checkpointing");
    });

    test("loads tdd skill template with correct content", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const template = await generator.loadTemplate("tdd");
      expect(template).toContain("# TDD Skill");
      expect(template).toContain("Test-Driven Development");
    });
  });

  describe("Advanced Skill File Generation", () => {
    test("generates lsp skill file with fork context", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const config = getDefaultAdvancedSkillConfig("lsp");
      const result = await generator.generateSkillFile(config);

      expect(result.created).toBe(true);
      expect(result.error).toBeUndefined();

      const filePath = join(testDir, ".opencode", "skill", "lsp", "SKILL.md");
      const content = await readFile(filePath, "utf-8");
      expect(content).toContain("name: lsp");
      expect(content).toContain("contextType: fork");
    });

    test("generates refactor skill file with fork context", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const config = getDefaultAdvancedSkillConfig("refactor");
      const result = await generator.generateSkillFile(config);

      expect(result.created).toBe(true);
      expect(result.error).toBeUndefined();

      const filePath = join(testDir, ".opencode", "skill", "refactor", "SKILL.md");
      const content = await readFile(filePath, "utf-8");
      expect(content).toContain("name: refactor");
      expect(content).toContain("contextType: fork");
    });

    test("generates checkpoint skill file with main context", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const config = getDefaultAdvancedSkillConfig("checkpoint");
      const result = await generator.generateSkillFile(config);

      expect(result.created).toBe(true);
      expect(result.error).toBeUndefined();

      const filePath = join(testDir, ".opencode", "skill", "checkpoint", "SKILL.md");
      const content = await readFile(filePath, "utf-8");
      expect(content).toContain("name: checkpoint");
      expect(content).toContain("contextType: main");
    });

    test("generates tdd skill file with fork context", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const config = getDefaultAdvancedSkillConfig("tdd");
      const result = await generator.generateSkillFile(config);

      expect(result.created).toBe(true);
      expect(result.error).toBeUndefined();

      const filePath = join(testDir, ".opencode", "skill", "tdd", "SKILL.md");
      const content = await readFile(filePath, "utf-8");
      expect(content).toContain("name: tdd");
      expect(content).toContain("contextType: fork");
    });

    test("generates all 4 advanced skill files", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const configs = getAllAdvancedSkillConfigs();
      const results = await generator.generateSkillFiles(configs);

      expect(results.length).toBe(4);
      expect(results.every((r) => r.created)).toBe(true);
      expect(results.every((r) => !r.error)).toBe(true);

      // Verify all files exist
      for (const name of ADVANCED_SKILL_NAMES) {
        const filePath = join(testDir, ".opencode", "skill", name, "SKILL.md");
        const fileExists = await access(filePath)
          .then(() => true)
          .catch(() => false);
        expect(fileExists).toBe(true);
      }
    });

    test("generates all 12 skills (MVP + Advanced + Extended) together", async () => {
      const generator = createSkillGenerator({
        outputDir: testDir,
        templateDir,
      });

      const configs = getAllSkillConfigs();
      const results = await generator.generateSkillFiles(configs);

      expect(results.length).toBe(12);
      expect(results.every((r) => r.created)).toBe(true);

      // Verify all files exist
      for (const name of ALL_SKILL_NAMES) {
        const filePath = join(testDir, ".opencode", "skill", name, "SKILL.md");
        const fileExists = await access(filePath)
          .then(() => true)
          .catch(() => false);
        expect(fileExists).toBe(true);
      }
    });
  });
});
