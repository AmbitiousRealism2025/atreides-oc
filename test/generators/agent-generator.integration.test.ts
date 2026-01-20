/**
 * Agent Generator Integration Tests
 *
 * Tests for agent generation integration with init wizard and manifest system.
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
  DEFAULT_AGENT_MODELS,
  type AgentConfig,
} from "../../src/generators/index.js";
import {
  loadManifest,
  isMarkdownFileEntry,
} from "../../src/lib/manifest.js";

describe("Agent Generator Integration", () => {
  let testDir: string;
  let templateDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `atreides-agent-int-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
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
  // Manifest Integration
  // ===========================================================================

  describe("Manifest Integration", () => {
    test("creates manifest when generating agents", async () => {
      const configs: AgentConfig[] = [
        {
          name: "stilgar",
          displayName: "Stilgar",
          model: "claude-sonnet-4",
          enabled: true,
        },
      ];

      await generateMVPAgents(configs, testDir, { templateDir });

      const manifest = await loadManifest(testDir);
      expect(manifest).not.toBeNull();
      expect(manifest?.version).toBeDefined();
    });

    test("tracks all generated files in manifest", async () => {
      const configs: AgentConfig[] = MVP_AGENT_NAMES.map(name => ({
        name,
        displayName: name.charAt(0).toUpperCase() + name.slice(1),
        model: DEFAULT_AGENT_MODELS[name],
        enabled: true,
      }));

      await generateMVPAgents(configs, testDir, { templateDir });

      const manifest = await loadManifest(testDir);
      expect(manifest).not.toBeNull();

      // Should have entries for all 5 MVP agents
      expect(Object.keys(manifest!.files).length).toBe(5);

      for (const name of MVP_AGENT_NAMES) {
        const path = `.opencode/agent/${name}.md`;
        expect(manifest!.files[path]).toBeDefined();
      }
    });

    test("stores correct hashes in manifest", async () => {
      const configs: AgentConfig[] = [
        {
          name: "stilgar",
          displayName: "Stilgar",
          model: "claude-sonnet-4",
          enabled: true,
        },
      ];

      await generateMVPAgents(configs, testDir, { templateDir });

      const manifest = await loadManifest(testDir);
      const entry = manifest?.files[".opencode/agent/stilgar.md"];

      expect(entry).toBeDefined();
      expect(entry?.templateHash).toBeDefined();
      expect(entry?.currentHash).toBeDefined();
      expect(entry?.templateHash).toBe(entry?.currentHash); // Just generated, should match
    });

    test("creates markdown file entries with sections", async () => {
      const configs: AgentConfig[] = [
        {
          name: "stilgar",
          displayName: "Stilgar",
          model: "claude-sonnet-4",
          enabled: true,
        },
      ];

      await generateMVPAgents(configs, testDir, { templateDir });

      const manifest = await loadManifest(testDir);
      const entry = manifest?.files[".opencode/agent/stilgar.md"];

      expect(entry).toBeDefined();
      expect(isMarkdownFileEntry(entry!)).toBe(true);

      if (isMarkdownFileEntry(entry!)) {
        expect(entry.sections.length).toBeGreaterThan(0);
        // Should have common sections
        const headers = entry.sections.map(s => s.header);
        expect(headers.some(h => h.includes("Responsibilities"))).toBe(true);
        expect(headers.some(h => h.includes("Tool Permissions"))).toBe(true);
        expect(headers.some(h => h.includes("Guidelines"))).toBe(true);
      }
    });

    test("preserves manifest across multiple generation calls", async () => {
      const generator = createAgentGenerator({
        outputDir: testDir,
        templateDir,
      });

      // Generate first agent
      await generator.generateWithManifest(
        [{ name: "stilgar", displayName: "Stilgar", model: "claude-sonnet-4", enabled: true }],
        testDir
      );

      let manifest = await loadManifest(testDir);
      expect(Object.keys(manifest!.files).length).toBe(1);

      // Generate second agent
      await generator.generateWithManifest(
        [{ name: "explore", displayName: "Explore", model: "claude-haiku-4-5", enabled: true }],
        testDir
      );

      manifest = await loadManifest(testDir);
      expect(Object.keys(manifest!.files).length).toBe(2);
    });
  });

  // ===========================================================================
  // Directory Structure
  // ===========================================================================

  describe("Directory Structure", () => {
    test("creates .opencode directory if not exists", async () => {
      const configs: AgentConfig[] = [
        {
          name: "stilgar",
          displayName: "Stilgar",
          model: "claude-sonnet-4",
          enabled: true,
        },
      ];

      await generateMVPAgents(configs, testDir, { templateDir });

      const opencodePath = join(testDir, ".opencode");
      const dirExists = await access(opencodePath).then(() => true).catch(() => false);
      expect(dirExists).toBe(true);
    });

    test("creates .opencode/agent directory if not exists", async () => {
      const configs: AgentConfig[] = [
        {
          name: "stilgar",
          displayName: "Stilgar",
          model: "claude-sonnet-4",
          enabled: true,
        },
      ];

      await generateMVPAgents(configs, testDir, { templateDir });

      const agentPath = join(testDir, ".opencode", "agent");
      const agentDirExists = await access(agentPath).then(() => true).catch(() => false);
      expect(agentDirExists).toBe(true);
    });

    test("creates correct file structure for all MVP agents", async () => {
      const configs: AgentConfig[] = MVP_AGENT_NAMES.map(name => ({
        name,
        displayName: name.charAt(0).toUpperCase() + name.slice(1),
        model: DEFAULT_AGENT_MODELS[name],
        enabled: true,
      }));

      await generateMVPAgents(configs, testDir, { templateDir });

      // Check all expected files
      for (const name of MVP_AGENT_NAMES) {
        const filePath = join(testDir, ".opencode", "agent", `${name}.md`);
        const fileExists = await access(filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
      }
    });
  });

  // ===========================================================================
  // Content Validation
  // ===========================================================================

  describe("Content Validation", () => {
    test("generated files have valid frontmatter", async () => {
      const configs: AgentConfig[] = MVP_AGENT_NAMES.map(name => ({
        name,
        displayName: name.charAt(0).toUpperCase() + name.slice(1),
        model: DEFAULT_AGENT_MODELS[name],
        enabled: true,
      }));

      await generateMVPAgents(configs, testDir, { templateDir });

      for (const name of MVP_AGENT_NAMES) {
        const filePath = join(testDir, ".opencode", "agent", `${name}.md`);
        const content = await readFile(filePath, "utf-8");

        // Check frontmatter structure
        expect(content.startsWith("---\n")).toBe(true);
        expect(content).toContain(`name: ${name}`);
        expect(content).toContain(`model: ${DEFAULT_AGENT_MODELS[name]}`);
        expect(content).toContain("enabled: true");
      }
    });

    test("generated files have customization zones", async () => {
      const configs: AgentConfig[] = MVP_AGENT_NAMES.map(name => ({
        name,
        displayName: name.charAt(0).toUpperCase() + name.slice(1),
        model: DEFAULT_AGENT_MODELS[name],
        enabled: true,
      }));

      await generateMVPAgents(configs, testDir, { templateDir });

      for (const name of MVP_AGENT_NAMES) {
        const filePath = join(testDir, ".opencode", "agent", `${name}.md`);
        const content = await readFile(filePath, "utf-8");

        expect(content).toContain("<!-- CUSTOM RULES START -->");
        expect(content).toContain("<!-- CUSTOM RULES END -->");
      }
    });

    test("generated files have required sections", async () => {
      const configs: AgentConfig[] = MVP_AGENT_NAMES.map(name => ({
        name,
        displayName: name.charAt(0).toUpperCase() + name.slice(1),
        model: DEFAULT_AGENT_MODELS[name],
        enabled: true,
      }));

      await generateMVPAgents(configs, testDir, { templateDir });

      for (const name of MVP_AGENT_NAMES) {
        const filePath = join(testDir, ".opencode", "agent", `${name}.md`);
        const content = await readFile(filePath, "utf-8");

        expect(content).toContain("## Purpose");
        expect(content).toContain("## Responsibilities");
        expect(content).toContain("## Tool Permissions");
        expect(content).toContain("## Guidelines");
      }
    });
  });

  // ===========================================================================
  // Model Configuration
  // ===========================================================================

  describe("Model Configuration", () => {
    test("uses provided model configuration", async () => {
      const customModel = "claude-opus-4";
      const configs: AgentConfig[] = [
        {
          name: "stilgar",
          displayName: "Stilgar",
          model: customModel,
          enabled: true,
        },
      ];

      await generateMVPAgents(configs, testDir, { templateDir });

      const filePath = join(testDir, ".opencode", "agent", "stilgar.md");
      const content = await readFile(filePath, "utf-8");
      expect(content).toContain(`model: ${customModel}`);
    });

    test("each agent can have different model", async () => {
      const configs: AgentConfig[] = [
        { name: "stilgar", displayName: "Stilgar", model: "claude-opus-4", enabled: true },
        { name: "explore", displayName: "Explore", model: "claude-haiku-4-5", enabled: true },
        { name: "build", displayName: "Build", model: "gpt-4o", enabled: true },
      ];

      await generateMVPAgents(configs, testDir, { templateDir });

      const stilgarContent = await readFile(
        join(testDir, ".opencode", "agent", "stilgar.md"),
        "utf-8"
      );
      const exploreContent = await readFile(
        join(testDir, ".opencode", "agent", "explore.md"),
        "utf-8"
      );
      const buildContent = await readFile(
        join(testDir, ".opencode", "agent", "build.md"),
        "utf-8"
      );

      expect(stilgarContent).toContain("model: claude-opus-4");
      expect(exploreContent).toContain("model: claude-haiku-4-5");
      expect(buildContent).toContain("model: gpt-4o");
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe("Error Handling", () => {
    test("handles missing templates gracefully", async () => {
      const configs: AgentConfig[] = [
        { name: "nonexistent", displayName: "Nonexistent", model: "test", enabled: true },
      ];

      const results = await generateMVPAgents(configs, testDir, { templateDir });

      expect(results.length).toBe(1);
      expect(results[0].created).toBe(false);
      expect(results[0].error).toBeDefined();
    });

    test("continues generation after single failure", async () => {
      const configs: AgentConfig[] = [
        { name: "nonexistent", displayName: "Nonexistent", model: "test", enabled: true },
        { name: "stilgar", displayName: "Stilgar", model: "claude-sonnet-4", enabled: true },
      ];

      const results = await generateMVPAgents(configs, testDir, { templateDir });

      expect(results.length).toBe(2);
      expect(results[0].error).toBeDefined();
      expect(results[1].created).toBe(true);
    });

    test("reports errors correctly in results", async () => {
      const configs: AgentConfig[] = [
        { name: "missing-agent", displayName: "Missing", model: "test", enabled: true },
      ];

      const results = await generateMVPAgents(configs, testDir, { templateDir });

      expect(results[0].error).toContain("Failed to load template");
      expect(results[0].path).toBe(".opencode/agent/missing-agent.md");
    });
  });

  // ===========================================================================
  // Overwrite Behavior
  // ===========================================================================

  describe("Overwrite Behavior", () => {
    test("generateWithManifest does not overwrite by default", async () => {
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
      const result1 = await generator.generateWithManifest([config], testDir);
      expect(result1.results[0].created).toBe(true);

      // Try to generate again
      const result2 = await generator.generateWithManifest([config], testDir);
      expect(result2.results[0].created).toBe(false);
      expect(result2.results[0].updated).toBe(false);
    });

    test("can force overwrite with option", async () => {
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
      const result1 = await generator.generateWithManifest([config], testDir);
      expect(result1.results[0].created).toBe(true);

      // Generate again with overwrite
      const result2 = await generator.generateWithManifest([config], testDir);
      expect(result2.results[0].created).toBe(false);
      expect(result2.results[0].updated).toBe(true);
    });
  });
});
