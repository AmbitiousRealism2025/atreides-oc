/**
 * WorkflowEngine Unit Tests
 *
 * Tests for phase tracking, transitions, intent classification, and guidance generation.
 * Target: >90% coverage
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  WorkflowEngine,
  workflowEngine,
  PHASE_TOOL_PATTERNS,
} from "../../../src/plugin/managers/workflow-engine.js";
import * as SessionManager from "../../../src/plugin/managers/session-manager.js";
import type { WorkflowPhase, IntentType } from "../../../src/plugin/types.js";
import { createDefaultConfig } from "../../../src/lib/config.js";

describe("WorkflowEngine", () => {
  let engine: WorkflowEngine;
  const testSessionId = "test-session-workflow";

  beforeEach(() => {
    SessionManager.clearSessions();
    const config = createDefaultConfig();
    config.workflow.enablePhaseTracking = true;
    SessionManager.setDefaultConfig(config);
    engine = new WorkflowEngine();
  });

  afterEach(() => {
    SessionManager.clearSessions();
  });

  // ===========================================================================
  // Singleton Export
  // ===========================================================================

  describe("Singleton Export", () => {
    test("workflowEngine is a WorkflowEngine instance", () => {
      expect(workflowEngine).toBeInstanceOf(WorkflowEngine);
    });
  });

  // ===========================================================================
  // Phase Detection from Tools
  // ===========================================================================

  describe("Phase Detection from Tools", () => {
    test("detectPhaseFromTool returns exploration for read tool", () => {
      const phase = engine.detectPhaseFromTool("read", "idle");
      expect(phase).toBe("exploration");
    });

    test("detectPhaseFromTool returns exploration for grep tool", () => {
      const phase = engine.detectPhaseFromTool("grep", "idle");
      expect(phase).toBe("exploration");
    });

    test("detectPhaseFromTool returns exploration for list_dir tool", () => {
      const phase = engine.detectPhaseFromTool("list_dir", "idle");
      expect(phase).toBe("exploration");
    });

    test("detectPhaseFromTool returns exploration for glob tool", () => {
      const phase = engine.detectPhaseFromTool("glob", "assessment");
      expect(phase).toBe("exploration");
    });

    test("detectPhaseFromTool returns exploration for file_search tool", () => {
      const phase = engine.detectPhaseFromTool("file_search", "intent");
      expect(phase).toBe("exploration");
    });

    test("detectPhaseFromTool returns implementation for edit tool", () => {
      const phase = engine.detectPhaseFromTool("edit", "exploration");
      expect(phase).toBe("implementation");
    });

    test("detectPhaseFromTool returns implementation for write tool", () => {
      const phase = engine.detectPhaseFromTool("write", "exploration");
      expect(phase).toBe("implementation");
    });

    test("detectPhaseFromTool returns implementation for multiedit tool", () => {
      const phase = engine.detectPhaseFromTool("multiedit", "exploration");
      expect(phase).toBe("implementation");
    });

    test("detectPhaseFromTool returns verification for test tool", () => {
      const phase = engine.detectPhaseFromTool("test", "implementation");
      expect(phase).toBe("verification");
    });

    test("detectPhaseFromTool returns verification for lint tool", () => {
      const phase = engine.detectPhaseFromTool("lint", "implementation");
      expect(phase).toBe("verification");
    });

    test("detectPhaseFromTool returns undefined for unknown tool", () => {
      const phase = engine.detectPhaseFromTool("unknown_tool", "idle");
      expect(phase).toBeUndefined();
    });

    test("detectPhaseFromTool is case-insensitive", () => {
      const phase = engine.detectPhaseFromTool("READ", "idle");
      expect(phase).toBe("exploration");
    });
  });

  // ===========================================================================
  // Bash Command Analysis
  // ===========================================================================

  describe("Bash Command Analysis", () => {
    test("bash with test command returns verification", () => {
      const phase = engine.detectPhaseFromTool("bash", "implementation", {
        command: "npm test",
      });
      expect(phase).toBe("verification");
    });

    test("bash with jest returns verification", () => {
      const phase = engine.detectPhaseFromTool("bash", "implementation", {
        command: "jest",
      });
      expect(phase).toBe("verification");
    });

    test("bash with vitest returns verification", () => {
      const phase = engine.detectPhaseFromTool("bash", "implementation", {
        command: "vitest run",
      });
      expect(phase).toBe("verification");
    });

    test("bash with pytest returns verification", () => {
      const phase = engine.detectPhaseFromTool("bash", "implementation", {
        command: "pytest tests/",
      });
      expect(phase).toBe("verification");
    });

    test("bash with bun test returns verification", () => {
      const phase = engine.detectPhaseFromTool("bash", "implementation", {
        command: "bun test",
      });
      expect(phase).toBe("verification");
    });

    test("bash with cargo test returns verification", () => {
      const phase = engine.detectPhaseFromTool("bash", "implementation", {
        command: "cargo test",
      });
      expect(phase).toBe("verification");
    });

    test("bash with go test returns verification", () => {
      const phase = engine.detectPhaseFromTool("bash", "implementation", {
        command: "go test ./...",
      });
      expect(phase).toBe("verification");
    });

    test("bash with build command returns verification", () => {
      const phase = engine.detectPhaseFromTool("bash", "implementation", {
        command: "npm run build",
      });
      expect(phase).toBe("verification");
    });

    test("bash with lint command returns verification", () => {
      const phase = engine.detectPhaseFromTool("bash", "implementation", {
        command: "npm run lint",
      });
      expect(phase).toBe("verification");
    });

    test("bash with tsc returns verification", () => {
      const phase = engine.detectPhaseFromTool("bash", "implementation", {
        command: "tsc --noEmit",
      });
      expect(phase).toBe("verification");
    });

    test("bash without test/build command returns exploration for early phases", () => {
      const phase = engine.detectPhaseFromTool("bash", "intent", {
        command: "ls -la",
      });
      expect(phase).toBe("exploration");
    });

    test("bash without test/build command stays in current phase for implementation", () => {
      const phase = engine.detectPhaseFromTool("bash", "implementation", {
        command: "cat file.txt",
      });
      expect(phase).toBe("implementation");
    });

    test("bash with string input instead of object", () => {
      const phase = engine.detectPhaseFromTool("bash", "implementation", "npm test");
      expect(phase).toBe("verification");
    });

    test("bash with cmd property instead of command", () => {
      const phase = engine.detectPhaseFromTool("bash", "implementation", {
        cmd: "npm test",
      });
      expect(phase).toBe("verification");
    });

    test("bash with no input defaults to exploration for idle", () => {
      const phase = engine.detectPhaseFromTool("bash", "idle");
      expect(phase).toBe("exploration");
    });

    test("bash with no input stays in current phase for non-idle", () => {
      const phase = engine.detectPhaseFromTool("bash", "implementation");
      expect(phase).toBe("implementation");
    });

    test("shell tool is treated same as bash", () => {
      const phase = engine.detectPhaseFromTool("shell", "implementation", {
        command: "npm test",
      });
      expect(phase).toBe("verification");
    });
  });

  // ===========================================================================
  // Phase Transitions
  // ===========================================================================

  describe("Phase Transitions", () => {
    test("isValidTransition: idle -> intent is valid", () => {
      expect(engine.isValidTransition("idle", "intent")).toBe(true);
    });

    test("isValidTransition: idle -> exploration is invalid", () => {
      expect(engine.isValidTransition("idle", "exploration")).toBe(false);
    });

    test("isValidTransition: intent -> assessment is valid", () => {
      expect(engine.isValidTransition("intent", "assessment")).toBe(true);
    });

    test("isValidTransition: intent -> exploration is valid", () => {
      expect(engine.isValidTransition("intent", "exploration")).toBe(true);
    });

    test("isValidTransition: assessment -> exploration is valid", () => {
      expect(engine.isValidTransition("assessment", "exploration")).toBe(true);
    });

    test("isValidTransition: assessment -> implementation is valid", () => {
      expect(engine.isValidTransition("assessment", "implementation")).toBe(true);
    });

    test("isValidTransition: exploration -> implementation is valid", () => {
      expect(engine.isValidTransition("exploration", "implementation")).toBe(true);
    });

    test("isValidTransition: exploration -> assessment is valid (re-assess)", () => {
      expect(engine.isValidTransition("exploration", "assessment")).toBe(true);
    });

    test("isValidTransition: implementation -> verification is valid", () => {
      expect(engine.isValidTransition("implementation", "verification")).toBe(true);
    });

    test("isValidTransition: implementation -> exploration is valid", () => {
      expect(engine.isValidTransition("implementation", "exploration")).toBe(true);
    });

    test("isValidTransition: verification -> intent is valid", () => {
      expect(engine.isValidTransition("verification", "intent")).toBe(true);
    });

    test("isValidTransition: verification -> implementation is valid", () => {
      expect(engine.isValidTransition("verification", "implementation")).toBe(true);
    });

    test("isValidTransition: verification -> idle is valid", () => {
      expect(engine.isValidTransition("verification", "idle")).toBe(true);
    });
  });

  // ===========================================================================
  // Phase Update Integration
  // ===========================================================================

  describe("Phase Update Integration", () => {
    test("updatePhase transitions from idle on first tool", async () => {
      // Initialize session
      SessionManager.getState(testSessionId);
      // Force session to intent phase to test transition
      SessionManager.setPhase(testSessionId, "intent");

      const newPhase = await engine.updatePhase("read", testSessionId);
      expect(newPhase).toBe("exploration");
    });

    test("updatePhase records transition in history", async () => {
      SessionManager.getState(testSessionId);
      SessionManager.setPhase(testSessionId, "intent");

      await engine.updatePhase("read", testSessionId);

      const history = engine.getPhaseHistory(testSessionId);
      expect(history.length).toBe(1);
      expect(history[0].from).toBe("intent");
      expect(history[0].to).toBe("exploration");
      expect(history[0].triggeredBy).toBe("read");
    });

    test("updatePhase does not transition for invalid transition", async () => {
      SessionManager.getState(testSessionId);
      // Session starts at idle, edit would want implementation but that's invalid from idle

      const newPhase = await engine.updatePhase("edit", testSessionId);
      expect(newPhase).toBe("idle");
    });

    test("updatePhase returns idle for non-existent session", async () => {
      const newPhase = await engine.updatePhase("read", "non-existent-session");
      expect(newPhase).toBe("idle");
    });

    test("updatePhase handles errors gracefully", async () => {
      // This should not throw, just return idle
      const newPhase = await engine.updatePhase("read", testSessionId);
      // Session wasn't initialized, but should handle gracefully
      expect(newPhase).toBe("idle");
    });

    test("updatePhase from exploration to implementation", async () => {
      SessionManager.getState(testSessionId);
      SessionManager.setPhase(testSessionId, "exploration");

      const newPhase = await engine.updatePhase("edit", testSessionId);
      expect(newPhase).toBe("implementation");
    });

    test("updatePhase from implementation to verification", async () => {
      SessionManager.getState(testSessionId);
      SessionManager.setPhase(testSessionId, "implementation");

      const newPhase = await engine.updatePhase("bash", testSessionId, {
        command: "npm test",
      });
      expect(newPhase).toBe("verification");
    });
  });

  // ===========================================================================
  // Intent Classification
  // ===========================================================================

  describe("Intent Classification", () => {
    test("classifyIntent identifies feature intent", () => {
      const intent = engine.classifyIntent("Add a new user authentication feature");
      expect(intent).toBe("feature");
    });

    test("classifyIntent identifies bugfix intent", () => {
      const intent = engine.classifyIntent("Fix the login bug that crashes the app");
      expect(intent).toBe("bugfix");
    });

    test("classifyIntent identifies refactor intent", () => {
      const intent = engine.classifyIntent("Refactor the database layer to clean up the code");
      expect(intent).toBe("refactor");
    });

    test("classifyIntent identifies exploration intent", () => {
      const intent = engine.classifyIntent("How does the authentication system work?");
      expect(intent).toBe("exploration");
    });

    test("classifyIntent identifies documentation intent", () => {
      const intent = engine.classifyIntent("Add JSDoc comments to the API functions");
      expect(intent).toBe("documentation");
    });

    test("classifyIntent identifies test intent", () => {
      const intent = engine.classifyIntent("Write unit tests for the user service");
      expect(intent).toBe("test");
    });

    test("classifyIntent identifies config intent", () => {
      const intent = engine.classifyIntent("Update the environment configuration");
      expect(intent).toBe("config");
    });

    test("classifyIntent returns unknown for ambiguous messages", () => {
      const intent = engine.classifyIntent("Do the thing");
      expect(intent).toBe("unknown");
    });

    test("classifyIntent is case insensitive", () => {
      const intent = engine.classifyIntent("FIX THE BUG");
      expect(intent).toBe("bugfix");
    });

    test("classifyIntent handles multiple keywords by highest count", () => {
      const intent = engine.classifyIntent("Add a new feature and implement the build system");
      expect(intent).toBe("feature");
    });
  });

  // ===========================================================================
  // Intent Setting
  // ===========================================================================

  describe("Intent Setting", () => {
    test("setIntentClassification stores intent in workflow state", () => {
      SessionManager.getState(testSessionId);
      engine.setIntentClassification(testSessionId, "feature");

      const workflowState = engine.getWorkflowState(testSessionId);
      expect(workflowState?.intentClassification).toBe("feature");
    });

    test("setIntentClassification does nothing for non-existent session", () => {
      // Should not throw
      engine.setIntentClassification("non-existent", "bugfix");
    });
  });

  // ===========================================================================
  // Workflow Start
  // ===========================================================================

  describe("Workflow Start", () => {
    test("startWorkflow transitions from idle to intent", () => {
      SessionManager.getState(testSessionId);
      engine.startWorkflow(testSessionId);

      const phase = engine.getCurrentPhase(testSessionId);
      expect(phase).toBe("intent");
    });

    test("startWorkflow classifies intent from message", () => {
      SessionManager.getState(testSessionId);
      engine.startWorkflow(testSessionId, "Fix the authentication bug");

      const workflowState = engine.getWorkflowState(testSessionId);
      expect(workflowState?.intentClassification).toBe("bugfix");
    });

    test("startWorkflow does not transition if not idle", () => {
      SessionManager.getState(testSessionId);
      SessionManager.setPhase(testSessionId, "exploration");

      engine.startWorkflow(testSessionId);

      const phase = engine.getCurrentPhase(testSessionId);
      expect(phase).toBe("exploration");
    });

    test("startWorkflow does nothing for non-existent session", () => {
      // Should not throw
      engine.startWorkflow("non-existent");
    });
  });

  // ===========================================================================
  // Phase Guidance
  // ===========================================================================

  describe("Phase Guidance", () => {
    test("generatePhaseGuidance returns empty for idle", () => {
      const guidance = engine.generatePhaseGuidance("idle");
      expect(guidance).toBe("");
    });

    test("generatePhaseGuidance returns intent guidance", () => {
      const guidance = engine.generatePhaseGuidance("intent");
      expect(guidance).toContain("INTENT");
      expect(guidance).toContain("Understanding");
    });

    test("generatePhaseGuidance returns assessment guidance", () => {
      const guidance = engine.generatePhaseGuidance("assessment");
      expect(guidance).toContain("ASSESSMENT");
      expect(guidance).toContain("Analyzing");
    });

    test("generatePhaseGuidance returns exploration guidance", () => {
      const guidance = engine.generatePhaseGuidance("exploration");
      expect(guidance).toContain("EXPLORATION");
      expect(guidance).toContain("Reading");
      expect(guidance).toContain("Do NOT make changes");
    });

    test("generatePhaseGuidance returns implementation guidance", () => {
      const guidance = engine.generatePhaseGuidance("implementation");
      expect(guidance).toContain("IMPLEMENTATION");
      expect(guidance).toContain("minimal changes");
    });

    test("generatePhaseGuidance returns verification guidance", () => {
      const guidance = engine.generatePhaseGuidance("verification");
      expect(guidance).toContain("VERIFICATION");
      expect(guidance).toContain("Running tests");
    });

    test("generatePhaseGuidance includes intent-specific guidance for feature", () => {
      const guidance = engine.generatePhaseGuidance("implementation", "feature");
      expect(guidance).toContain("FEATURE implementation");
    });

    test("generatePhaseGuidance includes intent-specific guidance for bugfix", () => {
      const guidance = engine.generatePhaseGuidance("exploration", "bugfix");
      expect(guidance).toContain("BUGFIX");
      expect(guidance).toContain("root cause");
    });

    test("generatePhaseGuidance includes intent-specific guidance for refactor", () => {
      const guidance = engine.generatePhaseGuidance("implementation", "refactor");
      expect(guidance).toContain("REFACTOR");
      expect(guidance).toContain("Preserve behavior");
    });

    test("generatePhaseGuidance includes intent-specific guidance for exploration", () => {
      const guidance = engine.generatePhaseGuidance("exploration", "exploration");
      expect(guidance).toContain("EXPLORATION");
      expect(guidance).toContain("understanding");
    });

    test("generatePhaseGuidance includes intent-specific guidance for documentation", () => {
      const guidance = engine.generatePhaseGuidance("implementation", "documentation");
      expect(guidance).toContain("DOCUMENTATION");
      expect(guidance).toContain("clarity");
    });

    test("generatePhaseGuidance includes intent-specific guidance for test", () => {
      const guidance = engine.generatePhaseGuidance("implementation", "test");
      expect(guidance).toContain("TEST");
      expect(guidance).toContain("coverage");
    });

    test("generatePhaseGuidance includes intent-specific guidance for config", () => {
      const guidance = engine.generatePhaseGuidance("implementation", "config");
      expect(guidance).toContain("CONFIGURATION");
      expect(guidance).toContain("environment");
    });

    test("generatePhaseGuidance handles unknown intent gracefully", () => {
      const guidance = engine.generatePhaseGuidance("implementation", "unknown");
      expect(guidance).toContain("IMPLEMENTATION");
      // Should not add unknown intent guidance
      expect(guidance).not.toContain("unknown");
    });
  });

  // ===========================================================================
  // Workflow State Queries
  // ===========================================================================

  describe("Workflow State Queries", () => {
    test("getCurrentPhase returns idle for non-existent session", () => {
      const phase = engine.getCurrentPhase("non-existent");
      expect(phase).toBe("idle");
    });

    test("getCurrentPhase returns current phase", () => {
      SessionManager.getState(testSessionId);
      SessionManager.setPhase(testSessionId, "exploration");

      const phase = engine.getCurrentPhase(testSessionId);
      expect(phase).toBe("exploration");
    });

    test("getWorkflowState returns undefined for non-existent session", () => {
      const state = engine.getWorkflowState("non-existent");
      expect(state).toBeUndefined();
    });

    test("getWorkflowState returns full workflow state", () => {
      SessionManager.getState(testSessionId);
      SessionManager.setPhase(testSessionId, "implementation");

      const state = engine.getWorkflowState(testSessionId);
      expect(state).toBeDefined();
      expect(state?.currentPhase).toBe("implementation");
      expect(state?.phaseHistory).toBeDefined();
    });

    test("getPhaseHistory returns empty array for non-existent session", () => {
      const history = engine.getPhaseHistory("non-existent");
      expect(history).toEqual([]);
    });

    test("getPhaseHistory returns phase transitions", async () => {
      SessionManager.getState(testSessionId);
      SessionManager.setPhase(testSessionId, "intent");
      await engine.updatePhase("read", testSessionId);
      await engine.updatePhase("edit", testSessionId);

      const history = engine.getPhaseHistory(testSessionId);
      expect(history.length).toBe(2);
    });

    test("isWorkflowComplete returns false for non-existent session", () => {
      const complete = engine.isWorkflowComplete("non-existent");
      expect(complete).toBe(false);
    });

    test("isWorkflowComplete returns false for incomplete workflow", () => {
      SessionManager.getState(testSessionId);
      const complete = engine.isWorkflowComplete(testSessionId);
      expect(complete).toBe(false);
    });

    test("isWorkflowComplete returns true after verification -> idle", () => {
      SessionManager.getState(testSessionId);
      SessionManager.setPhase(testSessionId, "verification");
      engine.transitionPhase(testSessionId, "verification", "idle");

      const complete = engine.isWorkflowComplete(testSessionId);
      expect(complete).toBe(true);
    });
  });

  // ===========================================================================
  // Workflow Reset
  // ===========================================================================

  describe("Workflow Reset", () => {
    test("resetWorkflow resets to idle", () => {
      SessionManager.getState(testSessionId);
      SessionManager.setPhase(testSessionId, "implementation");

      engine.resetWorkflow(testSessionId);

      const phase = engine.getCurrentPhase(testSessionId);
      expect(phase).toBe("idle");
    });

    test("resetWorkflow clears phase history", async () => {
      SessionManager.getState(testSessionId);
      SessionManager.setPhase(testSessionId, "intent");
      await engine.updatePhase("read", testSessionId);

      engine.resetWorkflow(testSessionId);

      const history = engine.getPhaseHistory(testSessionId);
      expect(history.length).toBe(0);
    });

    test("resetWorkflow clears intent classification", () => {
      SessionManager.getState(testSessionId);
      engine.setIntentClassification(testSessionId, "feature");

      engine.resetWorkflow(testSessionId);

      const state = engine.getWorkflowState(testSessionId);
      expect(state?.intentClassification).toBeUndefined();
    });

    test("resetWorkflow does nothing for non-existent session", () => {
      // Should not throw
      engine.resetWorkflow("non-existent");
    });
  });

  // ===========================================================================
  // Tool Patterns Constants
  // ===========================================================================

  describe("Tool Patterns Constants", () => {
    test("PHASE_TOOL_PATTERNS includes exploration tools", () => {
      expect(PHASE_TOOL_PATTERNS.read).toContain("exploration");
      expect(PHASE_TOOL_PATTERNS.grep).toContain("exploration");
      expect(PHASE_TOOL_PATTERNS.list_dir).toContain("exploration");
    });

    test("PHASE_TOOL_PATTERNS includes implementation tools", () => {
      expect(PHASE_TOOL_PATTERNS.edit).toContain("implementation");
      expect(PHASE_TOOL_PATTERNS.write).toContain("implementation");
    });

    test("PHASE_TOOL_PATTERNS includes verification tools", () => {
      expect(PHASE_TOOL_PATTERNS.test).toContain("verification");
      expect(PHASE_TOOL_PATTERNS.lint).toContain("verification");
    });

    test("PHASE_TOOL_PATTERNS bash has multiple phases", () => {
      expect(PHASE_TOOL_PATTERNS.bash.length).toBeGreaterThan(1);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("Edge Cases", () => {
    test("handles empty session ID", async () => {
      const phase = await engine.updatePhase("read", "");
      expect(phase).toBe("idle");
    });

    test("handles null-ish input", () => {
      const phase = engine.detectPhaseFromTool("bash", "idle", null);
      expect(phase).toBe("exploration");
    });

    test("handles undefined input", () => {
      const phase = engine.detectPhaseFromTool("bash", "idle", undefined);
      expect(phase).toBe("exploration");
    });

    test("handles empty command", () => {
      const phase = engine.detectPhaseFromTool("bash", "implementation", {
        command: "",
      });
      expect(phase).toBe("implementation");
    });

    test("multiple transitions build history correctly", async () => {
      SessionManager.getState(testSessionId);
      engine.startWorkflow(testSessionId);

      // Intent -> Exploration
      await engine.updatePhase("read", testSessionId);
      // Exploration -> Implementation
      await engine.updatePhase("edit", testSessionId);
      // Implementation -> Verification
      await engine.updatePhase("bash", testSessionId, { command: "npm test" });

      const history = engine.getPhaseHistory(testSessionId);
      expect(history.length).toBe(4); // idle->intent, intent->exploration, exploration->implementation, implementation->verification

      expect(history[0].from).toBe("idle");
      expect(history[0].to).toBe("intent");
      expect(history[1].from).toBe("intent");
      expect(history[1].to).toBe("exploration");
      expect(history[2].from).toBe("exploration");
      expect(history[2].to).toBe("implementation");
      expect(history[3].from).toBe("implementation");
      expect(history[3].to).toBe("verification");
    });

    test("transitionPhase handles non-existent session gracefully", () => {
      // Should not throw
      engine.transitionPhase("non-existent", "idle", "intent");
    });
  });
});
