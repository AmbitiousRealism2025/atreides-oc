/**
 * IdentityManager Unit Tests
 *
 * Tests for persona identity formatting, response prefixes, and delegation announcements.
 * Target: >90% coverage
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  IdentityManager,
  createIdentityManager,
} from "../../../src/plugin/managers/identity-manager.js";
import { createDefaultConfig, type Config } from "../../../src/lib/config.js";

describe("IdentityManager", () => {
  let config: Config;
  let manager: IdentityManager;

  beforeEach(() => {
    config = createDefaultConfig();
    manager = new IdentityManager(config);
  });

  // ===========================================================================
  // Factory Function
  // ===========================================================================

  describe("Factory Function", () => {
    test("createIdentityManager creates an instance", () => {
      const instance = createIdentityManager(config);
      expect(instance).toBeInstanceOf(IdentityManager);
    });

    test("createIdentityManager uses provided config", () => {
      config.identity.personaName = "CustomPersona";
      const instance = createIdentityManager(config);
      expect(instance.getPersonaName()).toBe("CustomPersona");
    });
  });

  // ===========================================================================
  // Constructor
  // ===========================================================================

  describe("Constructor", () => {
    test("initializes with default config", () => {
      expect(manager.getPersonaName()).toBe("Muad'Dib");
      expect(manager.isResponsePrefixEnabled()).toBe(true);
      expect(manager.isDelegationAnnouncementsEnabled()).toBe(true);
    });

    test("initializes with custom persona name", () => {
      config.identity.personaName = "TestPersona";
      const customManager = new IdentityManager(config);
      expect(customManager.getPersonaName()).toBe("TestPersona");
    });

    test("initializes with response prefix disabled", () => {
      config.identity.responsePrefix = false;
      const customManager = new IdentityManager(config);
      expect(customManager.isResponsePrefixEnabled()).toBe(false);
    });

    test("initializes with delegation announcements disabled", () => {
      config.identity.delegationAnnouncements = false;
      const customManager = new IdentityManager(config);
      expect(customManager.isDelegationAnnouncementsEnabled()).toBe(false);
    });
  });

  // ===========================================================================
  // formatHeader
  // ===========================================================================

  describe("formatHeader", () => {
    test("returns identity header when response prefix enabled", () => {
      const header = manager.formatHeader();
      expect(header).toContain("Muad'Dib");
      expect(header).toContain("orchestration agent");
      expect(header).toContain("RULE #1");
      expect(header).toContain("[Muad'Dib]:");
    });

    test("returns empty string when response prefix disabled", () => {
      config.identity.responsePrefix = false;
      const customManager = new IdentityManager(config);
      const header = customManager.formatHeader();
      expect(header).toBe("");
    });

    test("uses custom persona name in header", () => {
      config.identity.personaName = "CustomName";
      const customManager = new IdentityManager(config);
      const header = customManager.formatHeader();
      expect(header).toContain("CustomName");
      expect(header).toContain("[CustomName]:");
      expect(header).not.toContain("Muad'Dib");
    });

    test("includes correct and wrong examples", () => {
      const header = manager.formatHeader();
      expect(header).toContain("CORRECT:");
      expect(header).toContain("WRONG");
    });
  });

  // ===========================================================================
  // formatResponse
  // ===========================================================================

  describe("formatResponse", () => {
    test("prefixes response with persona name", () => {
      const result = manager.formatResponse("Hello, world!");
      expect(result).toBe("[Muad'Dib]: Hello, world!");
    });

    test("returns unchanged response when prefix disabled", () => {
      config.identity.responsePrefix = false;
      const customManager = new IdentityManager(config);
      const result = customManager.formatResponse("Hello, world!");
      expect(result).toBe("Hello, world!");
    });

    test("uses custom persona name", () => {
      config.identity.personaName = "CustomPersona";
      const customManager = new IdentityManager(config);
      const result = customManager.formatResponse("Test message");
      expect(result).toBe("[CustomPersona]: Test message");
    });

    test("handles empty response", () => {
      const result = manager.formatResponse("");
      expect(result).toBe("[Muad'Dib]: ");
    });

    test("handles multi-line response", () => {
      const result = manager.formatResponse("Line 1\nLine 2\nLine 3");
      expect(result).toBe("[Muad'Dib]: Line 1\nLine 2\nLine 3");
    });
  });

  // ===========================================================================
  // formatDelegationAnnouncement
  // ===========================================================================

  describe("formatDelegationAnnouncement", () => {
    test("formats before delegation announcement", () => {
      const result = manager.formatDelegationAnnouncement("explore", true);
      expect(result).toBe("[Muad'Dib]: Delegating to Explore agent...");
    });

    test("formats after delegation announcement", () => {
      const result = manager.formatDelegationAnnouncement("explore", false);
      expect(result).toBe("[Muad'Dib]: Explore agent has completed the task.");
    });

    test("returns empty when delegation announcements disabled", () => {
      config.identity.delegationAnnouncements = false;
      const customManager = new IdentityManager(config);
      const result = customManager.formatDelegationAnnouncement("explore", true);
      expect(result).toBe("");
    });

    test("uses custom persona name", () => {
      config.identity.personaName = "TestPersona";
      const customManager = new IdentityManager(config);
      const result = customManager.formatDelegationAnnouncement("plan", true);
      expect(result).toBe("[TestPersona]: Delegating to Plan agent...");
    });

    test("handles known agent names", () => {
      const agents = [
        { id: "explore", display: "Explore" },
        { id: "plan", display: "Plan" },
        { id: "bash", display: "Bash" },
        { id: "general-purpose", display: "General Purpose" },
        { id: "technical-writer", display: "Technical Writer" },
        { id: "backend-architect", display: "Backend Architect" },
        { id: "frontend-architect", display: "Frontend Architect" },
        { id: "security-engineer", display: "Security Engineer" },
      ];

      for (const agent of agents) {
        const result = manager.formatDelegationAnnouncement(agent.id, true);
        expect(result).toContain(agent.display);
      }
    });

    test("handles unknown agent by converting to title case", () => {
      const result = manager.formatDelegationAnnouncement("my-custom-agent", true);
      expect(result).toContain("My Custom Agent");
    });
  });

  // ===========================================================================
  // getAgentDisplayName
  // ===========================================================================

  describe("getAgentDisplayName", () => {
    test("returns mapped name for known agents", () => {
      expect(manager.getAgentDisplayName("explore")).toBe("Explore");
      expect(manager.getAgentDisplayName("plan")).toBe("Plan");
      expect(manager.getAgentDisplayName("bash")).toBe("Bash");
      expect(manager.getAgentDisplayName("general-purpose")).toBe("General Purpose");
    });

    test("converts kebab-case to title case for unknown agents", () => {
      expect(manager.getAgentDisplayName("my-custom-agent")).toBe("My Custom Agent");
      expect(manager.getAgentDisplayName("test-agent")).toBe("Test Agent");
    });

    test("handles single word agent names", () => {
      expect(manager.getAgentDisplayName("unknown")).toBe("Unknown");
    });

    test("handles empty agent name", () => {
      expect(manager.getAgentDisplayName("")).toBe("");
    });
  });

  // ===========================================================================
  // Getter Methods
  // ===========================================================================

  describe("Getter Methods", () => {
    test("getPersonaName returns persona name", () => {
      expect(manager.getPersonaName()).toBe("Muad'Dib");
    });

    test("isResponsePrefixEnabled returns correct value", () => {
      expect(manager.isResponsePrefixEnabled()).toBe(true);

      config.identity.responsePrefix = false;
      const customManager = new IdentityManager(config);
      expect(customManager.isResponsePrefixEnabled()).toBe(false);
    });

    test("isDelegationAnnouncementsEnabled returns correct value", () => {
      expect(manager.isDelegationAnnouncementsEnabled()).toBe(true);

      config.identity.delegationAnnouncements = false;
      const customManager = new IdentityManager(config);
      expect(customManager.isDelegationAnnouncementsEnabled()).toBe(false);
    });
  });

  // ===========================================================================
  // updateConfig
  // ===========================================================================

  describe("updateConfig", () => {
    test("updates persona name", () => {
      const newConfig = createDefaultConfig();
      newConfig.identity.personaName = "NewPersona";

      manager.updateConfig(newConfig);

      expect(manager.getPersonaName()).toBe("NewPersona");
    });

    test("updates response prefix setting", () => {
      expect(manager.isResponsePrefixEnabled()).toBe(true);

      const newConfig = createDefaultConfig();
      newConfig.identity.responsePrefix = false;
      manager.updateConfig(newConfig);

      expect(manager.isResponsePrefixEnabled()).toBe(false);
    });

    test("updates delegation announcements setting", () => {
      expect(manager.isDelegationAnnouncementsEnabled()).toBe(true);

      const newConfig = createDefaultConfig();
      newConfig.identity.delegationAnnouncements = false;
      manager.updateConfig(newConfig);

      expect(manager.isDelegationAnnouncementsEnabled()).toBe(false);
    });

    test("affects subsequent format calls", () => {
      // Before update
      const headerBefore = manager.formatHeader();
      expect(headerBefore).toContain("Muad'Dib");

      // Update
      const newConfig = createDefaultConfig();
      newConfig.identity.personaName = "UpdatedPersona";
      manager.updateConfig(newConfig);

      // After update
      const headerAfter = manager.formatHeader();
      expect(headerAfter).toContain("UpdatedPersona");
      expect(headerAfter).not.toContain("Muad'Dib");
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("Edge Cases", () => {
    test("handles special characters in persona name", () => {
      config.identity.personaName = "Test<>&'\"Persona";
      const customManager = new IdentityManager(config);
      const header = customManager.formatHeader();
      expect(header).toContain("Test<>&'\"Persona");
    });

    test("handles unicode in persona name", () => {
      config.identity.personaName = "测试";
      const customManager = new IdentityManager(config);
      expect(customManager.getPersonaName()).toBe("测试");
      const header = customManager.formatHeader();
      expect(header).toContain("测试");
    });

    test("handles very long persona name", () => {
      config.identity.personaName = "A".repeat(1000);
      const customManager = new IdentityManager(config);
      expect(customManager.getPersonaName().length).toBe(1000);
    });

    test("handles whitespace in persona name", () => {
      config.identity.personaName = "  Spaced Name  ";
      const customManager = new IdentityManager(config);
      expect(customManager.getPersonaName()).toBe("  Spaced Name  ");
    });
  });

  // ===========================================================================
  // All Known Agents
  // ===========================================================================

  describe("All Known Agents", () => {
    const knownAgents = [
      { id: "explore", display: "Explore" },
      { id: "plan", display: "Plan" },
      { id: "general-purpose", display: "General Purpose" },
      { id: "bash", display: "Bash" },
      { id: "technical-writer", display: "Technical Writer" },
      { id: "backend-architect", display: "Backend Architect" },
      { id: "frontend-architect", display: "Frontend Architect" },
      { id: "security-engineer", display: "Security Engineer" },
      { id: "quality-engineer", display: "Quality Engineer" },
      { id: "performance-engineer", display: "Performance Engineer" },
      { id: "devops-architect", display: "DevOps Architect" },
      { id: "system-architect", display: "System Architect" },
      { id: "refactoring-expert", display: "Refactoring Expert" },
      { id: "python-expert", display: "Python Expert" },
      { id: "root-cause-analyst", display: "Root Cause Analyst" },
      { id: "learning-guide", display: "Learning Guide" },
      { id: "socratic-mentor", display: "Socratic Mentor" },
      { id: "requirements-analyst", display: "Requirements Analyst" },
      { id: "validator", display: "Validator" },
      { id: "design-reviewer", display: "Design Reviewer" },
    ];

    for (const agent of knownAgents) {
      test(`returns "${agent.display}" for "${agent.id}"`, () => {
        expect(manager.getAgentDisplayName(agent.id)).toBe(agent.display);
      });
    }
  });
});
