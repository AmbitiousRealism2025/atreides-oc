/**
 * Config Module Unit Tests
 *
 * Tests for configuration loading, defaults, and error handling.
 * Target: >90% coverage for config.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadConfig,
  createDefaultConfig,
  type Config,
} from "../../src/lib/config.js";

describe("Config Module", () => {
  // ===========================================================================
  // createDefaultConfig
  // ===========================================================================

  describe("createDefaultConfig", () => {
    test("returns a valid Config object", () => {
      const config = createDefaultConfig();
      expect(config).toBeDefined();
      expect(config.identity).toBeDefined();
      expect(config.workflow).toBeDefined();
      expect(config.security).toBeDefined();
    });

    test("returns default persona name as Muad'Dib", () => {
      const config = createDefaultConfig();
      expect(config.identity.personaName).toBe("Muad'Dib");
    });

    test("returns response prefix enabled by default", () => {
      const config = createDefaultConfig();
      expect(config.identity.responsePrefix).toBe(true);
    });

    test("returns delegation announcements enabled by default", () => {
      const config = createDefaultConfig();
      expect(config.identity.delegationAnnouncements).toBe(true);
    });

    test("returns workflow defaults", () => {
      const config = createDefaultConfig();
      expect(config.workflow.enablePhaseTracking).toBe(true);
      expect(config.workflow.strictTodoEnforcement).toBe(true);
      expect(config.workflow.autoEscalateOnError).toBe(true);
    });

    test("returns security defaults", () => {
      const config = createDefaultConfig();
      expect(config.security.enableObfuscationDetection).toBe(true);
      expect(config.security.blockedPatterns).toEqual([]);
      expect(config.security.warningPatterns).toEqual([]);
      expect(config.security.blockedFiles).toEqual([]);
    });

    test("returns a new object each time (not a reference)", () => {
      const config1 = createDefaultConfig();
      const config2 = createDefaultConfig();
      expect(config1).not.toBe(config2);

      // Modify config1 and ensure config2 is unaffected
      config1.identity.personaName = "Modified";
      expect(config2.identity.personaName).toBe("Muad'Dib");
    });

    test("returns deep copies of nested objects", () => {
      const config1 = createDefaultConfig();
      const config2 = createDefaultConfig();

      config1.security.blockedPatterns.push("test");
      expect(config2.security.blockedPatterns).toEqual([]);
    });
  });

  // ===========================================================================
  // loadConfig
  // ===========================================================================

  describe("loadConfig", () => {
    let testDir: string;

    beforeEach(async () => {
      // Create a unique temp directory for each test
      testDir = join(tmpdir(), `atreides-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      // Clean up temp directory
      try {
        await rm(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    test("returns defaults when opencode.json does not exist", async () => {
      const config = await loadConfig(testDir);
      expect(config.identity.personaName).toBe("Muad'Dib");
      expect(config.identity.responsePrefix).toBe(true);
      expect(config.identity.delegationAnnouncements).toBe(true);
    });

    test("loads custom persona name from opencode.json", async () => {
      const configContent = {
        atreides: {
          identity: {
            personaName: "CustomAgent",
          },
        },
      };
      await writeFile(
        join(testDir, "opencode.json"),
        JSON.stringify(configContent)
      );

      const config = await loadConfig(testDir);
      expect(config.identity.personaName).toBe("CustomAgent");
    });

    test("loads full identity config from opencode.json", async () => {
      const configContent = {
        atreides: {
          identity: {
            personaName: "TestPersona",
            responsePrefix: false,
            delegationAnnouncements: false,
          },
        },
      };
      await writeFile(
        join(testDir, "opencode.json"),
        JSON.stringify(configContent)
      );

      const config = await loadConfig(testDir);
      expect(config.identity.personaName).toBe("TestPersona");
      expect(config.identity.responsePrefix).toBe(false);
      expect(config.identity.delegationAnnouncements).toBe(false);
    });

    test("loads workflow config from opencode.json", async () => {
      const configContent = {
        atreides: {
          workflow: {
            enablePhaseTracking: false,
            strictTodoEnforcement: false,
            autoEscalateOnError: false,
          },
        },
      };
      await writeFile(
        join(testDir, "opencode.json"),
        JSON.stringify(configContent)
      );

      const config = await loadConfig(testDir);
      expect(config.workflow.enablePhaseTracking).toBe(false);
      expect(config.workflow.strictTodoEnforcement).toBe(false);
      expect(config.workflow.autoEscalateOnError).toBe(false);
    });

    test("loads security config from opencode.json", async () => {
      const configContent = {
        atreides: {
          security: {
            enableObfuscationDetection: false,
            blockedPatterns: ["rm -rf /", "DROP TABLE"],
            warningPatterns: ["sudo", "chmod 777"],
            blockedFiles: [".env", "secrets.json"],
          },
        },
      };
      await writeFile(
        join(testDir, "opencode.json"),
        JSON.stringify(configContent)
      );

      const config = await loadConfig(testDir);
      expect(config.security.enableObfuscationDetection).toBe(false);
      expect(config.security.blockedPatterns).toEqual(["rm -rf /", "DROP TABLE"]);
      expect(config.security.warningPatterns).toEqual(["sudo", "chmod 777"]);
      expect(config.security.blockedFiles).toEqual([".env", "secrets.json"]);
    });

    test("merges partial config with defaults", async () => {
      // Only provide personaName, other defaults should remain
      const configContent = {
        atreides: {
          identity: {
            personaName: "PartialConfig",
          },
        },
      };
      await writeFile(
        join(testDir, "opencode.json"),
        JSON.stringify(configContent)
      );

      const config = await loadConfig(testDir);
      // Custom value
      expect(config.identity.personaName).toBe("PartialConfig");
      // Default values preserved
      expect(config.identity.responsePrefix).toBe(true);
      expect(config.identity.delegationAnnouncements).toBe(true);
      expect(config.workflow.enablePhaseTracking).toBe(true);
    });

    test("returns defaults for invalid JSON", async () => {
      await writeFile(join(testDir, "opencode.json"), "{ invalid json }");

      const config = await loadConfig(testDir);
      expect(config.identity.personaName).toBe("Muad'Dib");
      expect(config.identity.responsePrefix).toBe(true);
    });

    test("returns defaults for empty JSON object", async () => {
      await writeFile(join(testDir, "opencode.json"), "{}");

      const config = await loadConfig(testDir);
      expect(config.identity.personaName).toBe("Muad'Dib");
    });

    test("returns defaults when atreides key is missing", async () => {
      const configContent = {
        someOtherPlugin: {
          setting: "value",
        },
      };
      await writeFile(
        join(testDir, "opencode.json"),
        JSON.stringify(configContent)
      );

      const config = await loadConfig(testDir);
      expect(config.identity.personaName).toBe("Muad'Dib");
    });

    test("handles unicode in persona name", async () => {
      const configContent = {
        atreides: {
          identity: {
            personaName: "测试代理",
          },
        },
      };
      await writeFile(
        join(testDir, "opencode.json"),
        JSON.stringify(configContent)
      );

      const config = await loadConfig(testDir);
      expect(config.identity.personaName).toBe("测试代理");
    });

    test("handles special characters in persona name", async () => {
      const configContent = {
        atreides: {
          identity: {
            personaName: "Test <Agent> & \"Helper\"",
          },
        },
      };
      await writeFile(
        join(testDir, "opencode.json"),
        JSON.stringify(configContent)
      );

      const config = await loadConfig(testDir);
      expect(config.identity.personaName).toBe("Test <Agent> & \"Helper\"");
    });

    test("preserves boolean false values (not treated as missing)", async () => {
      const configContent = {
        atreides: {
          identity: {
            personaName: "Test",
            responsePrefix: false,
            delegationAnnouncements: false,
          },
        },
      };
      await writeFile(
        join(testDir, "opencode.json"),
        JSON.stringify(configContent)
      );

      const config = await loadConfig(testDir);
      // These should be explicitly false, not default true
      expect(config.identity.responsePrefix).toBe(false);
      expect(config.identity.delegationAnnouncements).toBe(false);
    });
  });

  // ===========================================================================
  // Integration with IdentityManager
  // ===========================================================================

  describe("Config Integration", () => {
    test("loaded config can be used with IdentityManager", async () => {
      const { IdentityManager } = await import(
        "../../src/plugin/managers/identity-manager.js"
      );

      const config = createDefaultConfig();
      const manager = new IdentityManager(config);

      expect(manager.getPersonaName()).toBe("Muad'Dib");
      expect(manager.isResponsePrefixEnabled()).toBe(true);
    });

    test("custom config affects IdentityManager behavior", async () => {
      const { IdentityManager } = await import(
        "../../src/plugin/managers/identity-manager.js"
      );

      const config = createDefaultConfig();
      config.identity.personaName = "ConfiguredAgent";
      config.identity.responsePrefix = false;

      const manager = new IdentityManager(config);

      expect(manager.getPersonaName()).toBe("ConfiguredAgent");
      expect(manager.formatHeader()).toBe("");
      expect(manager.formatResponse("Hello")).toBe("Hello");
    });
  });
});
