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
  generatePostMVPAgents,
  generateAllAgents,
  MVP_AGENT_NAMES,
  POST_MVP_AGENT_NAMES,
  ALL_AGENT_NAMES,
  isMVPAgent,
  isPostMVPAgent,
  isValidAgent,
  DEFAULT_AGENT_MODELS,
  DEFAULT_POST_MVP_AGENT_MODELS,
  ALL_DEFAULT_AGENT_MODELS,
  AGENT_DISPLAY_NAMES,
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

  // ===========================================================================
  // Post-MVP Agent Type Guards and Constants
  // ===========================================================================

  describe("isPostMVPAgent", () => {
    test("returns true for valid Post-MVP agent names", () => {
      expect(isPostMVPAgent("frontend-ui-ux")).toBe(true);
      expect(isPostMVPAgent("document-writer")).toBe(true);
      expect(isPostMVPAgent("general")).toBe(true);
    });

    test("returns false for MVP agent names", () => {
      expect(isPostMVPAgent("stilgar")).toBe(false);
      expect(isPostMVPAgent("explore")).toBe(false);
      expect(isPostMVPAgent("librarian")).toBe(false);
      expect(isPostMVPAgent("build")).toBe(false);
      expect(isPostMVPAgent("plan")).toBe(false);
    });

    test("returns false for unknown agent names", () => {
      expect(isPostMVPAgent("unknown")).toBe(false);
      expect(isPostMVPAgent("invalid")).toBe(false);
    });
  });

  describe("isValidAgent", () => {
    test("returns true for all MVP agent names", () => {
      for (const name of MVP_AGENT_NAMES) {
        expect(isValidAgent(name)).toBe(true);
      }
    });

    test("returns true for all Post-MVP agent names", () => {
      for (const name of POST_MVP_AGENT_NAMES) {
        expect(isValidAgent(name)).toBe(true);
      }
    });

    test("returns false for unknown agent names", () => {
      expect(isValidAgent("unknown")).toBe(false);
      expect(isValidAgent("invalid")).toBe(false);
    });
  });

  describe("POST_MVP_AGENT_NAMES", () => {
    test("contains exactly 3 Post-MVP agents", () => {
      expect(POST_MVP_AGENT_NAMES.length).toBe(3);
    });

    test("contains all expected Post-MVP agents", () => {
      expect(POST_MVP_AGENT_NAMES).toContain("frontend-ui-ux");
      expect(POST_MVP_AGENT_NAMES).toContain("document-writer");
      expect(POST_MVP_AGENT_NAMES).toContain("general");
    });
  });

  describe("ALL_AGENT_NAMES", () => {
    test("contains all 8 agents (MVP + Post-MVP)", () => {
      expect(ALL_AGENT_NAMES.length).toBe(8);
    });

    test("contains all MVP agents", () => {
      for (const name of MVP_AGENT_NAMES) {
        expect(ALL_AGENT_NAMES).toContain(name);
      }
    });

    test("contains all Post-MVP agents", () => {
      for (const name of POST_MVP_AGENT_NAMES) {
        expect(ALL_AGENT_NAMES).toContain(name);
      }
    });
  });

  describe("DEFAULT_POST_MVP_AGENT_MODELS", () => {
    test("has model for each Post-MVP agent", () => {
      for (const name of POST_MVP_AGENT_NAMES) {
        expect(DEFAULT_POST_MVP_AGENT_MODELS[name]).toBeDefined();
      }
    });

    test("uses haiku for general agent", () => {
      expect(DEFAULT_POST_MVP_AGENT_MODELS.general).toBe("claude-haiku-4-5");
    });

    test("uses sonnet for frontend-ui-ux agent", () => {
      expect(DEFAULT_POST_MVP_AGENT_MODELS["frontend-ui-ux"]).toBe("claude-sonnet-4");
    });

    test("uses sonnet for document-writer agent", () => {
      expect(DEFAULT_POST_MVP_AGENT_MODELS["document-writer"]).toBe("claude-sonnet-4");
    });
  });

  describe("ALL_DEFAULT_AGENT_MODELS", () => {
    test("has model for all agents", () => {
      for (const name of ALL_AGENT_NAMES) {
        expect(ALL_DEFAULT_AGENT_MODELS[name]).toBeDefined();
      }
    });

    test("includes all MVP agent models", () => {
      for (const name of MVP_AGENT_NAMES) {
        expect(ALL_DEFAULT_AGENT_MODELS[name]).toBe(DEFAULT_AGENT_MODELS[name]);
      }
    });

    test("includes all Post-MVP agent models", () => {
      for (const name of POST_MVP_AGENT_NAMES) {
        expect(ALL_DEFAULT_AGENT_MODELS[name]).toBe(DEFAULT_POST_MVP_AGENT_MODELS[name]);
      }
    });
  });

  describe("AGENT_DISPLAY_NAMES", () => {
    test("has display name for all agents", () => {
      for (const name of ALL_AGENT_NAMES) {
        expect(AGENT_DISPLAY_NAMES[name]).toBeDefined();
        expect(AGENT_DISPLAY_NAMES[name].length).toBeGreaterThan(0);
      }
    });

    test("has correct display names for MVP agents", () => {
      expect(AGENT_DISPLAY_NAMES.stilgar).toBe("Stilgar");
      expect(AGENT_DISPLAY_NAMES.explore).toBe("Explore");
      expect(AGENT_DISPLAY_NAMES.librarian).toBe("Librarian");
      expect(AGENT_DISPLAY_NAMES.build).toBe("Build");
      expect(AGENT_DISPLAY_NAMES.plan).toBe("Plan");
    });

    test("has correct display names for Post-MVP agents", () => {
      expect(AGENT_DISPLAY_NAMES["frontend-ui-ux"]).toBe("Frontend Architect");
      expect(AGENT_DISPLAY_NAMES["document-writer"]).toBe("Documentation Writer");
      expect(AGENT_DISPLAY_NAMES.general).toBe("Research Agent");
    });
  });

  // ===========================================================================
  // Post-MVP Agent Template Loading and Generation
  // ===========================================================================

  describe("Post-MVP Agent Template Loading", () => {
    test("loads templates for all Post-MVP agents", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      for (const name of POST_MVP_AGENT_NAMES) {
        const template = await generator.loadTemplate(name);
        expect(template).toBeDefined();
        expect(template.length).toBeGreaterThan(100);
        expect(template).toContain(`name: ${name}`);
      }
    });

    test("frontend-ui-ux template has correct content", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      const template = await generator.loadTemplate("frontend-ui-ux");
      expect(template).toContain("displayName: Frontend Architect");
      expect(template).toContain("## Purpose");
      expect(template).toContain("## Responsibilities");
      expect(template).toContain("UI component design");
      expect(template).toContain("accessibility");
    });

    test("document-writer template has correct content", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      const template = await generator.loadTemplate("document-writer");
      expect(template).toContain("displayName: Documentation Writer");
      expect(template).toContain("## Purpose");
      expect(template).toContain("## Responsibilities");
      expect(template).toContain("Technical documentation");
    });

    test("general template has correct content", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      const template = await generator.loadTemplate("general");
      expect(template).toContain("displayName: Research Agent");
      expect(template).toContain("## Purpose");
      expect(template).toContain("## Responsibilities");
      expect(template).toContain("General research");
    });
  });

  describe("Post-MVP Agent File Generation", () => {
    test("generates all 3 Post-MVP agent files", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      const configs: AgentConfig[] = POST_MVP_AGENT_NAMES.map(name => ({
        name,
        displayName: AGENT_DISPLAY_NAMES[name],
        model: DEFAULT_POST_MVP_AGENT_MODELS[name],
        enabled: true,
      }));

      const results = await generator.generateAgentFiles(configs);

      expect(results.length).toBe(3);
      expect(results.every(r => r.created)).toBe(true);
      expect(results.every(r => !r.error)).toBe(true);

      // Verify all files exist
      for (const name of POST_MVP_AGENT_NAMES) {
        const filePath = join(testDir, ".opencode", "agent", `${name}.md`);
        const fileExists = await access(filePath).then(() => true).catch(() => false);
        expect(fileExists).toBe(true);
      }
    });

    test("renders Post-MVP templates correctly", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      for (const name of POST_MVP_AGENT_NAMES) {
        const template = await generator.loadTemplate(name);
        const config: AgentConfig = {
          name,
          displayName: AGENT_DISPLAY_NAMES[name],
          model: DEFAULT_POST_MVP_AGENT_MODELS[name],
          enabled: true,
        };

        const rendered = generator.renderTemplate(template, config);
        expect(rendered).toContain(`name: ${name}`);
        expect(rendered).toContain(`model: ${DEFAULT_POST_MVP_AGENT_MODELS[name]}`);
        expect(rendered).not.toContain("{{");
        expect(rendered).not.toContain("}}");
      }
    });
  });

  // ===========================================================================
  // generatePostMVPAgents Convenience Function
  // ===========================================================================

  describe("generatePostMVPAgents", () => {
    test("generates all Post-MVP agents with manifest tracking", async () => {
      const configs: AgentConfig[] = POST_MVP_AGENT_NAMES.map(name => ({
        name,
        displayName: AGENT_DISPLAY_NAMES[name],
        model: DEFAULT_POST_MVP_AGENT_MODELS[name],
        enabled: true,
      }));

      const results = await generatePostMVPAgents(configs, testDir, { templateDir });

      expect(results.length).toBe(3);
      expect(results.every(r => r.created)).toBe(true);

      // Verify manifest was created
      const manifestPath = join(testDir, ".atreides-manifest.json");
      const manifestExists = await access(manifestPath).then(() => true).catch(() => false);
      expect(manifestExists).toBe(true);

      const manifestContent = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(manifestContent);
      expect(Object.keys(manifest.files).length).toBe(3);
    });
  });

  // ===========================================================================
  // generateAllAgents Convenience Function
  // ===========================================================================

  describe("generateAllAgents", () => {
    test("generates all 8 agents with manifest tracking", async () => {
      const configs: AgentConfig[] = ALL_AGENT_NAMES.map(name => ({
        name,
        displayName: AGENT_DISPLAY_NAMES[name],
        model: ALL_DEFAULT_AGENT_MODELS[name],
        enabled: true,
      }));

      const results = await generateAllAgents(configs, testDir, { templateDir });

      expect(results.length).toBe(8);
      expect(results.every(r => r.created)).toBe(true);

      // Verify manifest was created with all files
      const manifestPath = join(testDir, ".atreides-manifest.json");
      const manifestContent = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(manifestContent);
      expect(Object.keys(manifest.files).length).toBe(8);

      // Verify all agent files exist
      for (const name of ALL_AGENT_NAMES) {
        const filePath = join(testDir, ".opencode", "agent", `${name}.md`);
        const fileExists = await access(filePath).then(() => true).catch(() => false);
        expect(fileExists).toBe(true);
      }
    });
  });
});
