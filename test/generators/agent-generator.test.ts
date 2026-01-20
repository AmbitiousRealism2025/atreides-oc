/**
 * Agent Generator Unit Tests
 *
 * Tests for agent template loading, rendering, and file generation.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { readFile, mkdir, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  AgentGenerator,
  createAgentGenerator,
  generateMVPAgents,
  MVP_AGENT_NAMES,
  isMVPAgent,
  DEFAULT_AGENT_MODELS,
  type AgentConfig,
  type AgentGenerationOptions,
} from "../../src/generators/index.js";

describe("Agent Generator Module", () => {
  let testDir: string;
  let templateDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `atreides-agent-gen-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await mkdir(testDir, { recursive: true });

    // Use the actual templates directory from the package
    templateDir = join(process.cwd(), "templates", "agents");
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

  describe("isMVPAgent", () => {
    test("returns true for valid MVP agent names", () => {
      expect(isMVPAgent("stilgar")).toBe(true);
      expect(isMVPAgent("explore")).toBe(true);
      expect(isMVPAgent("librarian")).toBe(true);
      expect(isMVPAgent("build")).toBe(true);
      expect(isMVPAgent("plan")).toBe(true);
    });

    test("returns false for non-MVP agent names", () => {
      expect(isMVPAgent("frontend-ui-ux")).toBe(false);
      expect(isMVPAgent("document-writer")).toBe(false);
      expect(isMVPAgent("general")).toBe(false);
      expect(isMVPAgent("unknown")).toBe(false);
    });
  });

  describe("MVP_AGENT_NAMES", () => {
    test("contains exactly 5 MVP agents", () => {
      expect(MVP_AGENT_NAMES.length).toBe(5);
    });

    test("contains all expected agents", () => {
      expect(MVP_AGENT_NAMES).toContain("stilgar");
      expect(MVP_AGENT_NAMES).toContain("explore");
      expect(MVP_AGENT_NAMES).toContain("librarian");
      expect(MVP_AGENT_NAMES).toContain("build");
      expect(MVP_AGENT_NAMES).toContain("plan");
    });
  });

  describe("DEFAULT_AGENT_MODELS", () => {
    test("has model for each MVP agent", () => {
      for (const name of MVP_AGENT_NAMES) {
        expect(DEFAULT_AGENT_MODELS[name]).toBeDefined();
      }
    });

    test("uses haiku for explore agent", () => {
      expect(DEFAULT_AGENT_MODELS.explore).toBe("claude-haiku-4-5");
    });

    test("uses sonnet for other agents", () => {
      expect(DEFAULT_AGENT_MODELS.stilgar).toBe("claude-sonnet-4");
      expect(DEFAULT_AGENT_MODELS.librarian).toBe("claude-sonnet-4");
      expect(DEFAULT_AGENT_MODELS.build).toBe("claude-sonnet-4");
      expect(DEFAULT_AGENT_MODELS.plan).toBe("claude-sonnet-4");
    });
  });

  // ===========================================================================
  // AgentGenerator - Template Loading
  // ===========================================================================

  describe("AgentGenerator Template Loading", () => {
    test("loads template for valid agent", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      const template = await generator.loadTemplate("stilgar");
      expect(template).toBeDefined();
      expect(template).toContain("{{model}}");
      expect(template).toContain("name: stilgar");
    });

    test("loads templates for all MVP agents", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      for (const name of MVP_AGENT_NAMES) {
        const template = await generator.loadTemplate(name);
        expect(template).toBeDefined();
        expect(template.length).toBeGreaterThan(100);
      }
    });

    test("throws error for non-existent template", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      await expect(generator.loadTemplate("nonexistent")).rejects.toThrow(
        /Failed to load template/
      );
    });

    test("caches templates after first load", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      const template1 = await generator.loadTemplate("stilgar");
      const template2 = await generator.loadTemplate("stilgar");

      expect(template1).toBe(template2);
    });

    test("clearCache removes cached templates", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      await generator.loadTemplate("stilgar");
      generator.clearCache();

      // After clearing, loading again should still work
      const template = await generator.loadTemplate("stilgar");
      expect(template).toBeDefined();
    });
  });

  // ===========================================================================
  // AgentGenerator - Template Rendering
  // ===========================================================================

  describe("AgentGenerator Template Rendering", () => {
    test("renders model placeholder", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      const template = await generator.loadTemplate("stilgar");
      const config: AgentConfig = {
        name: "stilgar",
        displayName: "Stilgar",
        model: "claude-opus-4",
        enabled: true,
      };

      const rendered = generator.renderTemplate(template, config);
      expect(rendered).toContain("model: claude-opus-4");
      expect(rendered).not.toContain("{{model}}");
    });

    test("preserves other template content", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      const template = await generator.loadTemplate("stilgar");
      const config: AgentConfig = {
        name: "stilgar",
        displayName: "Stilgar",
        model: "claude-sonnet-4",
        enabled: true,
      };

      const rendered = generator.renderTemplate(template, config);
      expect(rendered).toContain("# Stilgar (Oracle)");
      expect(rendered).toContain("## Responsibilities");
      expect(rendered).toContain("## Tool Permissions");
      expect(rendered).toContain("## Guidelines");
      expect(rendered).toContain("<!-- CUSTOM RULES START -->");
      expect(rendered).toContain("<!-- CUSTOM RULES END -->");
    });

    test("renders correctly for each MVP agent", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      for (const name of MVP_AGENT_NAMES) {
        const template = await generator.loadTemplate(name);
        const config: AgentConfig = {
          name,
          displayName: name.charAt(0).toUpperCase() + name.slice(1),
          model: DEFAULT_AGENT_MODELS[name],
          enabled: true,
        };

        const rendered = generator.renderTemplate(template, config);
        expect(rendered).toContain(`name: ${name}`);
        expect(rendered).toContain(`model: ${DEFAULT_AGENT_MODELS[name]}`);
        expect(rendered).not.toContain("{{");
        expect(rendered).not.toContain("}}");
      }
    });
  });

  // ===========================================================================
  // AgentGenerator - Frontmatter Parsing
  // ===========================================================================

  describe("AgentGenerator Frontmatter Parsing", () => {
    test("parses valid frontmatter", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      const content = `---
name: stilgar
displayName: Stilgar
model: claude-sonnet-4
enabled: true
---

# Content`;

      const frontmatter = generator.parseFrontmatter(content);
      expect(frontmatter).not.toBeNull();
      expect(frontmatter?.name).toBe("stilgar");
      expect(frontmatter?.displayName).toBe("Stilgar");
      expect(frontmatter?.model).toBe("claude-sonnet-4");
      expect(frontmatter?.enabled).toBe(true);
    });

    test("returns null for content without frontmatter", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      const content = "# Just content without frontmatter";
      const frontmatter = generator.parseFrontmatter(content);
      expect(frontmatter).toBeNull();
    });

    test("parses enabled: false correctly", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      const content = `---
name: test
displayName: Test
model: test-model
enabled: false
---`;

      const frontmatter = generator.parseFrontmatter(content);
      expect(frontmatter?.enabled).toBe(false);
    });
  });

  // ===========================================================================
  // AgentGenerator - Content Validation
  // ===========================================================================

  describe("AgentGenerator Content Validation", () => {
    test("validates content with valid frontmatter", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      const validContent = `---
name: stilgar
displayName: Stilgar
model: claude-sonnet-4
enabled: true
---

# Content`;

      // Should not throw
      expect(() => generator.validateContent(validContent, "stilgar")).not.toThrow();
    });

    test("throws for content without frontmatter", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      const invalidContent = "# No frontmatter";
      expect(() => generator.validateContent(invalidContent, "test")).toThrow(
        /Invalid frontmatter/
      );
    });

    test("throws for content without name", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      const invalidContent = `---
displayName: Test
model: test-model
enabled: true
---`;

      expect(() => generator.validateContent(invalidContent, "test")).toThrow(
        /Missing 'name'/
      );
    });

    test("throws for content without model", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      const invalidContent = `---
name: test
displayName: Test
enabled: true
---`;

      expect(() => generator.validateContent(invalidContent, "test")).toThrow(
        /Missing 'model'/
      );
    });
  });

  // ===========================================================================
  // AgentGenerator - File Generation
  // ===========================================================================

  describe("AgentGenerator File Generation", () => {
    test("generates single agent file", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      const config: AgentConfig = {
        name: "stilgar",
        displayName: "Stilgar",
        model: "claude-sonnet-4",
        enabled: true,
      };

      const result = await generator.generateAgentFile(config);
      expect(result.created).toBe(true);
      expect(result.updated).toBe(false);
      expect(result.error).toBeUndefined();

      // Verify file exists
      const filePath = join(testDir, ".opencode", "agent", "stilgar.md");
      const fileExists = await access(filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      // Verify content
      const content = await readFile(filePath, "utf-8");
      expect(content).toContain("name: stilgar");
      expect(content).toContain("model: claude-sonnet-4");
    });

    test("generates all 5 MVP agent files", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      const configs: AgentConfig[] = MVP_AGENT_NAMES.map(name => ({
        name,
        displayName: name.charAt(0).toUpperCase() + name.slice(1),
        model: DEFAULT_AGENT_MODELS[name],
        enabled: true,
      }));

      const results = await generator.generateAgentFiles(configs);

      expect(results.length).toBe(5);
      expect(results.every(r => r.created)).toBe(true);
      expect(results.every(r => !r.error)).toBe(true);

      // Verify all files exist
      for (const name of MVP_AGENT_NAMES) {
        const filePath = join(testDir, ".opencode", "agent", `${name}.md`);
        const fileExists = await access(filePath).then(() => true).catch(() => false);
        expect(fileExists).toBe(true);
      }
    });

    test("does not overwrite existing files by default", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      const config: AgentConfig = {
        name: "stilgar",
        displayName: "Stilgar",
        model: "claude-sonnet-4",
        enabled: true,
      };

      // Generate first time
      const result1 = await generator.generateAgentFile(config);
      expect(result1.created).toBe(true);

      // Generate second time
      const result2 = await generator.generateAgentFile(config);
      expect(result2.created).toBe(false);
      expect(result2.updated).toBe(false);
    });

    test("overwrites existing files when overwrite is true", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
        overwrite: true,
      });

      const config: AgentConfig = {
        name: "stilgar",
        displayName: "Stilgar",
        model: "claude-sonnet-4",
        enabled: true,
      };

      // Generate first time
      const result1 = await generator.generateAgentFile(config);
      expect(result1.created).toBe(true);

      // Generate second time with overwrite
      const result2 = await generator.generateAgentFile(config);
      expect(result2.created).toBe(false);
      expect(result2.updated).toBe(true);
    });

    test("returns error for invalid agent template", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      const config: AgentConfig = {
        name: "nonexistent-agent",
        displayName: "Nonexistent",
        model: "test-model",
        enabled: true,
      };

      const result = await generator.generateAgentFile(config);
      expect(result.created).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain("Failed to load template");
    });

    test("renders template with custom model configuration", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      const config: AgentConfig = {
        name: "stilgar",
        displayName: "Stilgar",
        model: "claude-opus-4", // Custom model
        enabled: true,
      };

      await generator.generateAgentFile(config);

      const filePath = join(testDir, ".opencode", "agent", "stilgar.md");
      const content = await readFile(filePath, "utf-8");
      expect(content).toContain("model: claude-opus-4");
    });
  });

  // ===========================================================================
  // AgentGenerator - Output Path
  // ===========================================================================

  describe("AgentGenerator Output Path", () => {
    test("returns correct output path for agent", () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      const path = generator.getAgentOutputPath("stilgar");
      expect(path).toBe(".opencode/agent/stilgar.md");
    });

    test("returns correct output path for all MVP agents", () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      for (const name of MVP_AGENT_NAMES) {
        const path = generator.getAgentOutputPath(name);
        expect(path).toBe(`.opencode/agent/${name}.md`);
      }
    });
  });

  // ===========================================================================
  // generateMVPAgents Convenience Function
  // ===========================================================================

  describe("generateMVPAgents", () => {
    test("generates all MVP agents with manifest tracking", async () => {
      const configs: AgentConfig[] = MVP_AGENT_NAMES.map(name => ({
        name,
        displayName: name.charAt(0).toUpperCase() + name.slice(1),
        model: DEFAULT_AGENT_MODELS[name],
        enabled: true,
      }));

      const results = await generateMVPAgents(configs, testDir, { templateDir });

      expect(results.length).toBe(5);
      expect(results.every(r => r.created)).toBe(true);

      // Verify manifest was created
      const manifestPath = join(testDir, ".atreides-manifest.json");
      const manifestExists = await access(manifestPath).then(() => true).catch(() => false);
      expect(manifestExists).toBe(true);

      const manifestContent = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(manifestContent);
      expect(Object.keys(manifest.files).length).toBe(5);
    });
  });

  // ===========================================================================
  // createAgentGenerator Factory
  // ===========================================================================

  describe("createAgentGenerator", () => {
    test("creates generator instance", () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      expect(generator).toBeInstanceOf(AgentGenerator);
    });

    test("uses custom template directory", async () => {
      const customTemplateDir = join(testDir, "custom-templates");
      await mkdir(customTemplateDir, { recursive: true });

      // Create a simple test template
      const testTemplate = `---
name: test
displayName: Test
model: {{model}}
enabled: true
---

# Test Agent`;

      await import("node:fs/promises").then(fs =>
        fs.writeFile(join(customTemplateDir, "test.md.template"), testTemplate)
      );

      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir: customTemplateDir,
      });

      const template = await generator.loadTemplate("test");
      expect(template).toContain("# Test Agent");
    });
  });
});
