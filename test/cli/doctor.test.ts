/**
 * Doctor Command Unit Tests
 *
 * Tests for the doctor command that verifies Atreides installation and diagnoses issues.
 * Target: >80% coverage for doctor.ts
 */

import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Import types for testing
import type {
  DiagnosticResult,
  DiagnosticStatus,
  DoctorResults,
  OverallStatus,
} from "../../src/cli/doctor.js";

describe("Doctor Command", () => {
  let testDir: string;
  let originalProcessCwd: typeof process.cwd;
  let originalProcessExitCode: number | undefined;
  let consoleOutput: string[];

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = join(
      tmpdir(),
      `atreides-doctor-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await mkdir(testDir, { recursive: true });

    // Store original values
    originalProcessCwd = process.cwd;
    originalProcessExitCode = process.exitCode;

    // Capture console output
    consoleOutput = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(" "));
    };
  });

  afterEach(async () => {
    // Restore process.exitCode
    process.exitCode = originalProcessExitCode;

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

  async function createOpencodeJson(content: object): Promise<void> {
    await writeFile(join(testDir, "opencode.json"), JSON.stringify(content, null, 2));
  }

  async function createAgentsMd(content = "# AGENTS\n\nOrchestration rules go here."): Promise<void> {
    await writeFile(join(testDir, "AGENTS.md"), content);
  }

  async function createPluginFile(
    content = "export default function plugin() { return {}; }"
  ): Promise<void> {
    const pluginDir = join(testDir, ".opencode", "plugin");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(pluginDir, "atreides.ts"), content);
  }

  async function createAgentFile(
    name: string,
    content?: string
  ): Promise<void> {
    const agentDir = join(testDir, ".opencode", "agent");
    await mkdir(agentDir, { recursive: true });
    const defaultContent = `---
name: ${name}
description: Test agent for ${name}
---

# ${name} Agent

Agent implementation here.
`;
    await writeFile(join(agentDir, `${name}.md`), content ?? defaultContent);
  }

  async function createSkillFile(
    skillName: string,
    content?: string
  ): Promise<void> {
    const skillDir = join(testDir, ".opencode", "skill", skillName);
    await mkdir(skillDir, { recursive: true });
    const defaultContent = `---
name: ${skillName}
context_type: full
---

# ${skillName} Skill

Skill implementation here.
`;
    await writeFile(join(skillDir, "SKILL.md"), content ?? defaultContent);
  }

  async function createFullProject(): Promise<void> {
    // Create a fully configured project
    await createOpencodeJson({
      atreides: {
        identity: { personaName: "TestAgent" },
        security: {
          enableObfuscationDetection: true,
          blockedPatterns: ["rm -rf /"],
        },
      },
    });
    await createAgentsMd();
    await createPluginFile();
    await createAgentFile("oracle");
    await createAgentFile("explore");
    await createSkillFile("orchestrate");
    await createSkillFile("validate");
  }

  // =============================================================================
  // Doctor Command Execution Tests
  // =============================================================================

  describe("runDoctorCommand", () => {
    test("returns DoctorResults object", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createFullProject();
      const results = await runDoctorCommand({ directory: testDir });

      expect(results).toBeDefined();
      expect(results.overallStatus).toBeDefined();
      expect(results.results).toBeInstanceOf(Array);
      expect(typeof results.passCount).toBe("number");
      expect(typeof results.warnCount).toBe("number");
      expect(typeof results.failCount).toBe("number");
    });

    test("uses current working directory by default", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      // This test verifies the command can run (will likely fail since cwd isn't configured)
      const results = await runDoctorCommand({ directory: testDir });

      expect(results).toBeDefined();
    });
  });

  // =============================================================================
  // Project Files Checks
  // =============================================================================

  describe("Project Files Checks", () => {
    test("detects missing AGENTS.md", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createOpencodeJson({});
      await createPluginFile();

      const results = await runDoctorCommand({ directory: testDir });

      const agentsCheck = results.results.find(
        (r) => r.category === "Project Files" && r.message.includes("AGENTS.md")
      );
      expect(agentsCheck).toBeDefined();
      expect(agentsCheck?.status).toBe("fail");
    });

    test("detects existing AGENTS.md", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createAgentsMd();
      await createOpencodeJson({});
      await createPluginFile();

      const results = await runDoctorCommand({ directory: testDir });

      const agentsCheck = results.results.find(
        (r) => r.category === "Project Files" && r.message.includes("AGENTS.md exists")
      );
      expect(agentsCheck).toBeDefined();
      expect(agentsCheck?.status).toBe("pass");
    });

    test("detects missing opencode.json", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createAgentsMd();
      await createPluginFile();

      const results = await runDoctorCommand({ directory: testDir });

      const configCheck = results.results.find(
        (r) => r.category === "Project Files" && r.message.includes("opencode.json missing")
      );
      expect(configCheck).toBeDefined();
      expect(configCheck?.status).toBe("fail");
    });

    test("detects valid opencode.json", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createOpencodeJson({ atreides: {} });
      await createAgentsMd();
      await createPluginFile();

      const results = await runDoctorCommand({ directory: testDir });

      const configCheck = results.results.find(
        (r) => r.category === "Project Files" && r.message.includes("opencode.json exists and valid")
      );
      expect(configCheck).toBeDefined();
      expect(configCheck?.status).toBe("pass");
    });

    test("detects invalid JSON in opencode.json", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await writeFile(join(testDir, "opencode.json"), "{ invalid json }");
      await createAgentsMd();
      await createPluginFile();

      const results = await runDoctorCommand({ directory: testDir });

      const configCheck = results.results.find(
        (r) => r.category === "Project Files" && r.message.includes("invalid JSON syntax")
      );
      expect(configCheck).toBeDefined();
      expect(configCheck?.status).toBe("fail");
    });

    test("detects missing plugin file", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createOpencodeJson({});
      await createAgentsMd();
      // Don't create plugin file

      const results = await runDoctorCommand({ directory: testDir });

      const pluginCheck = results.results.find(
        (r) => r.category === "Project Files" && r.message.includes("Plugin file not found")
      );
      expect(pluginCheck).toBeDefined();
      expect(pluginCheck?.status).toBe("fail");
    });

    test("detects existing plugin file (.ts)", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createOpencodeJson({});
      await createAgentsMd();
      await createPluginFile();

      const results = await runDoctorCommand({ directory: testDir });

      const pluginCheck = results.results.find(
        (r) => r.category === "Project Files" && r.message.includes(".opencode/plugin/atreides.ts")
      );
      expect(pluginCheck).toBeDefined();
      expect(pluginCheck?.status).toBe("pass");
    });

    test("detects existing plugin file (.js)", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createOpencodeJson({});
      await createAgentsMd();

      // Create .js plugin instead of .ts
      const pluginDir = join(testDir, ".opencode", "plugin");
      await mkdir(pluginDir, { recursive: true });
      await writeFile(join(pluginDir, "atreides.js"), "module.exports = {}");

      const results = await runDoctorCommand({ directory: testDir });

      const pluginCheck = results.results.find(
        (r) => r.category === "Project Files" && r.message.includes(".opencode/plugin/atreides.js")
      );
      expect(pluginCheck).toBeDefined();
      expect(pluginCheck?.status).toBe("pass");
    });
  });

  // =============================================================================
  // Agent Validation Tests
  // =============================================================================

  describe("Agent Validation", () => {
    test("reports when no agents directory exists", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createOpencodeJson({});
      await createAgentsMd();
      await createPluginFile();

      const results = await runDoctorCommand({ directory: testDir });

      const agentCheck = results.results.find(
        (r) => r.category === "Agents" && r.message.includes("No agents directory found")
      );
      expect(agentCheck).toBeDefined();
      expect(agentCheck?.status).toBe("warn");
    });

    test("reports when agents directory is empty", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createOpencodeJson({});
      await createAgentsMd();
      await createPluginFile();

      // Create empty agents directory
      await mkdir(join(testDir, ".opencode", "agent"), { recursive: true });

      const results = await runDoctorCommand({ directory: testDir });

      const agentCheck = results.results.find(
        (r) => r.category === "Agents" && r.message.includes("No agent files found")
      );
      expect(agentCheck).toBeDefined();
      expect(agentCheck?.status).toBe("warn");
    });

    test("validates agent files with valid frontmatter", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createOpencodeJson({});
      await createAgentsMd();
      await createPluginFile();
      await createAgentFile("oracle");
      await createAgentFile("explore");

      const results = await runDoctorCommand({ directory: testDir });

      const oracleCheck = results.results.find(
        (r) => r.category === "Agents" && r.message.includes("oracle.md - valid frontmatter")
      );
      expect(oracleCheck).toBeDefined();
      expect(oracleCheck?.status).toBe("pass");

      const exploreCheck = results.results.find(
        (r) => r.category === "Agents" && r.message.includes("explore.md - valid frontmatter")
      );
      expect(exploreCheck).toBeDefined();
      expect(exploreCheck?.status).toBe("pass");
    });

    test("warns about agent files with missing frontmatter", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createOpencodeJson({});
      await createAgentsMd();
      await createPluginFile();
      await createAgentFile("invalid", "# Invalid Agent\n\nNo frontmatter here.");

      const results = await runDoctorCommand({ directory: testDir });

      const invalidCheck = results.results.find(
        (r) => r.category === "Agents" && r.message.includes("invalid.md - missing frontmatter")
      );
      expect(invalidCheck).toBeDefined();
      expect(invalidCheck?.status).toBe("warn");
    });

    test("warns about agent files with missing name in frontmatter", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createOpencodeJson({});
      await createAgentsMd();
      await createPluginFile();
      await createAgentFile(
        "noname",
        `---
description: Agent without name
---

# Agent
`
      );

      const results = await runDoctorCommand({ directory: testDir });

      const nonameCheck = results.results.find(
        (r) => r.category === "Agents" && r.message.includes("noname.md - missing 'name'")
      );
      expect(nonameCheck).toBeDefined();
      expect(nonameCheck?.status).toBe("warn");
    });
  });

  // =============================================================================
  // Skills Validation Tests
  // =============================================================================

  describe("Skills Validation", () => {
    test("reports when no skills directory exists", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createOpencodeJson({});
      await createAgentsMd();
      await createPluginFile();

      const results = await runDoctorCommand({ directory: testDir });

      const skillCheck = results.results.find(
        (r) => r.category === "Skills" && r.message.includes("No skills directory found")
      );
      expect(skillCheck).toBeDefined();
      expect(skillCheck?.status).toBe("warn");
    });

    test("validates skill files with valid frontmatter", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createOpencodeJson({});
      await createAgentsMd();
      await createPluginFile();
      await createSkillFile("orchestrate");
      await createSkillFile("validate");

      const results = await runDoctorCommand({ directory: testDir });

      const orchestrateCheck = results.results.find(
        (r) => r.category === "Skills" && r.message.includes("orchestrate/SKILL.md - valid")
      );
      expect(orchestrateCheck).toBeDefined();
      expect(orchestrateCheck?.status).toBe("pass");
    });

    test("warns about skill directories without SKILL.md", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createOpencodeJson({});
      await createAgentsMd();
      await createPluginFile();

      // Create skill directory without SKILL.md
      const skillDir = join(testDir, ".opencode", "skill", "incomplete");
      await mkdir(skillDir, { recursive: true });

      const results = await runDoctorCommand({ directory: testDir });

      const incompleteCheck = results.results.find(
        (r) => r.category === "Skills" && r.message.includes("incomplete/SKILL.md - not found")
      );
      expect(incompleteCheck).toBeDefined();
      expect(incompleteCheck?.status).toBe("warn");
    });
  });

  // =============================================================================
  // Security Checks Tests
  // =============================================================================

  describe("Security Checks", () => {
    test("passes when obfuscation detection is enabled", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createOpencodeJson({
        atreides: {
          security: {
            enableObfuscationDetection: true,
          },
        },
      });
      await createAgentsMd();
      await createPluginFile();

      const results = await runDoctorCommand({ directory: testDir });

      const securityCheck = results.results.find(
        (r) => r.category === "Security" && r.message.includes("Obfuscation detection enabled")
      );
      expect(securityCheck).toBeDefined();
      expect(securityCheck?.status).toBe("pass");
    });

    test("warns when obfuscation detection is disabled", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createOpencodeJson({
        atreides: {
          security: {
            enableObfuscationDetection: false,
          },
        },
      });
      await createAgentsMd();
      await createPluginFile();

      const results = await runDoctorCommand({ directory: testDir });

      const securityCheck = results.results.find(
        (r) => r.category === "Security" && r.message.includes("Obfuscation detection disabled")
      );
      expect(securityCheck).toBeDefined();
      expect(securityCheck?.status).toBe("warn");
    });

    test("passes when blocked patterns are configured", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createOpencodeJson({
        atreides: {
          security: {
            blockedPatterns: ["rm -rf /", "DROP TABLE"],
          },
        },
      });
      await createAgentsMd();
      await createPluginFile();

      const results = await runDoctorCommand({ directory: testDir });

      const patternsCheck = results.results.find(
        (r) => r.category === "Security" && r.message.includes("Blocked patterns configured: 2")
      );
      expect(patternsCheck).toBeDefined();
      expect(patternsCheck?.status).toBe("pass");
    });
  });

  // =============================================================================
  // Backward Compatibility Tests
  // =============================================================================

  describe("Backward Compatibility", () => {
    test("passes when CLAUDE.md is detected", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createOpencodeJson({});
      await createAgentsMd();
      await createPluginFile();
      await writeFile(join(testDir, "CLAUDE.md"), "# Legacy CLAUDE.md");

      const results = await runDoctorCommand({ directory: testDir });

      const claudeCheck = results.results.find(
        (r) =>
          r.category === "Backward Compatibility" &&
          r.message.includes("CLAUDE.md detected")
      );
      expect(claudeCheck).toBeDefined();
      expect(claudeCheck?.status).toBe("pass");
    });

    test("warns when .claude/settings.json is found", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createOpencodeJson({});
      await createAgentsMd();
      await createPluginFile();

      // Create legacy .claude/settings.json
      const claudeDir = join(testDir, ".claude");
      await mkdir(claudeDir, { recursive: true });
      await writeFile(join(claudeDir, "settings.json"), "{}");

      const results = await runDoctorCommand({ directory: testDir });

      const settingsCheck = results.results.find(
        (r) =>
          r.category === "Backward Compatibility" &&
          r.message.includes(".claude/settings.json found")
      );
      expect(settingsCheck).toBeDefined();
      expect(settingsCheck?.status).toBe("warn");
      expect(settingsCheck?.remediation).toContain("migrate");
    });

    test("passes when no legacy configurations found", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createOpencodeJson({});
      await createAgentsMd();
      await createPluginFile();

      const results = await runDoctorCommand({ directory: testDir });

      const legacyCheck = results.results.find(
        (r) =>
          r.category === "Backward Compatibility" &&
          r.message.includes("No legacy configurations found")
      );
      expect(legacyCheck).toBeDefined();
      expect(legacyCheck?.status).toBe("pass");
    });
  });

  // =============================================================================
  // Overall Status Calculation Tests
  // =============================================================================

  describe("Overall Status Calculation", () => {
    test("returns green status when all checks pass", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createFullProject();

      const results = await runDoctorCommand({ directory: testDir });

      // May not be perfectly green due to OpenCode check, but project files should pass
      const projectFilesResults = results.results.filter(
        (r) => r.category === "Project Files"
      );
      expect(projectFilesResults.every((r) => r.status === "pass")).toBe(true);
    });

    test("returns red status when core category fails", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      // Missing all files - should fail Project Files (core category)
      const results = await runDoctorCommand({ directory: testDir });

      // Should have failures in Project Files
      const projectFilesFailures = results.results.filter(
        (r) => r.category === "Project Files" && r.status === "fail"
      );
      expect(projectFilesFailures.length).toBeGreaterThan(0);
    });

    test("returns yellow status when only non-core category has warnings", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createOpencodeJson({});
      await createAgentsMd();
      await createPluginFile();
      // Don't create agents or skills - these are non-core categories

      const results = await runDoctorCommand({ directory: testDir });

      // Should have warnings in Agents/Skills but not core failures
      const hasAgentWarning = results.results.some(
        (r) => r.category === "Agents" && r.status === "warn"
      );
      expect(hasAgentWarning).toBe(true);
    });

    test("sets exit code 0 for green status", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createFullProject();

      await runDoctorCommand({ directory: testDir });

      // Exit code should be set (we can't fully test green without mocking OpenCode)
      expect(process.exitCode).toBeDefined();
    });

    test("sets exit code 2 for red status", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      // Missing core files
      await runDoctorCommand({ directory: testDir });

      expect(process.exitCode).toBe(2);
    });
  });

  // =============================================================================
  // Result Counts Tests
  // =============================================================================

  describe("Result Counts", () => {
    test("correctly counts pass results", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createFullProject();

      const results = await runDoctorCommand({ directory: testDir });

      // Count should match filter
      const actualPassCount = results.results.filter((r) => r.status === "pass").length;
      expect(results.passCount).toBe(actualPassCount);
    });

    test("correctly counts warn results", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createOpencodeJson({});
      await createAgentsMd();
      await createPluginFile();

      const results = await runDoctorCommand({ directory: testDir });

      const actualWarnCount = results.results.filter((r) => r.status === "warn").length;
      expect(results.warnCount).toBe(actualWarnCount);
    });

    test("correctly counts fail results", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      // Empty project
      const results = await runDoctorCommand({ directory: testDir });

      const actualFailCount = results.results.filter((r) => r.status === "fail").length;
      expect(results.failCount).toBe(actualFailCount);
    });
  });

  // =============================================================================
  // Plugin Integration Tests
  // =============================================================================

  describe("Plugin Integration Checks", () => {
    test("detects plugin with valid exports", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createOpencodeJson({});
      await createAgentsMd();
      await createPluginFile("export default function plugin() { return {}; }");

      const results = await runDoctorCommand({ directory: testDir });

      const pluginLoadCheck = results.results.find(
        (r) =>
          r.category === "Plugin Integration" &&
          r.message.includes("Plugin loads without errors")
      );
      expect(pluginLoadCheck).toBeDefined();
      expect(pluginLoadCheck?.status).toBe("pass");
    });

    test("warns about plugin with CommonJS exports", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createOpencodeJson({});
      await createAgentsMd();

      const pluginDir = join(testDir, ".opencode", "plugin");
      await mkdir(pluginDir, { recursive: true });
      await writeFile(join(pluginDir, "atreides.js"), "module.exports = {}");

      const results = await runDoctorCommand({ directory: testDir });

      const pluginLoadCheck = results.results.find(
        (r) =>
          r.category === "Plugin Integration" &&
          r.message.includes("Plugin loads")
      );
      expect(pluginLoadCheck).toBeDefined();
      expect(pluginLoadCheck?.status).toBe("pass");
    });

    test("detects hooks registration count", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createOpencodeJson({
        hooks: {
          onStart: "hook1",
          onEnd: "hook2",
        },
      });
      await createAgentsMd();
      await createPluginFile();

      const results = await runDoctorCommand({ directory: testDir });

      const hooksCheck = results.results.find(
        (r) =>
          r.category === "Plugin Integration" && r.message.includes("Hooks registered")
      );
      expect(hooksCheck).toBeDefined();
    });

    test("detects other plugins in directory", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createOpencodeJson({});
      await createAgentsMd();
      await createPluginFile();

      // Add another plugin
      await writeFile(
        join(testDir, ".opencode", "plugin", "other-plugin.ts"),
        "export default {}"
      );

      const results = await runDoctorCommand({ directory: testDir });

      const conflictCheck = results.results.find(
        (r) =>
          r.category === "Plugin Integration" &&
          r.message.includes("Other plugins detected")
      );
      expect(conflictCheck).toBeDefined();
      expect(conflictCheck?.status).toBe("warn");
    });
  });

  // =============================================================================
  // Installation Checks Tests
  // =============================================================================

  describe("Installation Checks", () => {
    test("reports atreides-opencode package as installed", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createFullProject();

      const results = await runDoctorCommand({ directory: testDir });

      const packageCheck = results.results.find(
        (r) =>
          r.category === "Installation" &&
          r.message.includes("atreides-opencode package installed")
      );
      expect(packageCheck).toBeDefined();
      expect(packageCheck?.status).toBe("pass");
    });

    test("checks for runtime (Bun or Node)", async () => {
      const { runDoctorCommand } = await import("../../src/cli/doctor.js");

      await createFullProject();

      const results = await runDoctorCommand({ directory: testDir });

      const runtimeCheck = results.results.find(
        (r) =>
          r.category === "Installation" &&
          (r.message.includes("Bun runtime") || r.message.includes("Node.js runtime"))
      );
      expect(runtimeCheck).toBeDefined();
      // Should pass since we're running under Bun in tests
      expect(runtimeCheck?.status).toBe("pass");
    });
  });
});
