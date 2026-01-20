import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  ThinkModeManager,
  getThinkModeManager,
  resetThinkModeManager,
} from "../../../src/plugin/managers/think-mode-manager.js";
import * as SessionManager from "../../../src/plugin/managers/session-manager.js";
import { createDefaultConfig, type ThinkModeConfig } from "../../../src/lib/config.js";

describe("ThinkModeManager", () => {
  let manager: ThinkModeManager;
  const testSessionId = "test-session-think-mode";

  const createTestConfig = (overrides: Partial<ThinkModeConfig> = {}): ThinkModeConfig => ({
    enabled: true,
    defaultModel: "claude-sonnet-4",
    thinkModel: "claude-opus-4",
    fastModel: "claude-haiku-4-5",
    autoSwitch: false,
    complexityThreshold: 0.7,
    trackPerformance: true,
    ...overrides,
  });

  beforeEach(() => {
    SessionManager.clearSessions();
    resetThinkModeManager();
    const config = createDefaultConfig();
    SessionManager.setDefaultConfig(config);
    manager = new ThinkModeManager(createTestConfig());
  });

  afterEach(() => {
    SessionManager.clearSessions();
    resetThinkModeManager();
  });

  describe("Singleton Export", () => {
    test("getThinkModeManager returns ThinkModeManager instance", () => {
      const instance = getThinkModeManager(createTestConfig());
      expect(instance).toBeInstanceOf(ThinkModeManager);
    });

    test("getThinkModeManager returns same instance on subsequent calls", () => {
      const instance1 = getThinkModeManager(createTestConfig());
      const instance2 = getThinkModeManager();
      expect(instance1).toBe(instance2);
    });

    test("getThinkModeManager throws if called without config when not initialized", () => {
      resetThinkModeManager();
      expect(() => getThinkModeManager()).toThrow("ThinkModeManager not initialized");
    });
  });

  describe("State Management", () => {
    test("getState returns default for new session", () => {
      const state = manager.getState(testSessionId);
      expect(state).toBe("default");
    });

    test("activate sets state to think", () => {
      manager.activate(testSessionId);
      expect(manager.getState(testSessionId)).toBe("think");
    });

    test("deactivate sets state to default", () => {
      manager.activate(testSessionId);
      manager.deactivate(testSessionId);
      expect(manager.getState(testSessionId)).toBe("default");
    });

    test("setFastMode sets state to fast", () => {
      manager.setFastMode(testSessionId);
      expect(manager.getState(testSessionId)).toBe("fast");
    });

    test("cleanup removes session state", () => {
      manager.activate(testSessionId);
      manager.cleanup(testSessionId);
      expect(manager.getState(testSessionId)).toBe("default");
    });
  });

  describe("Disabled Mode", () => {
    test("activate does nothing when disabled", () => {
      const disabledManager = new ThinkModeManager(createTestConfig({ enabled: false }));
      disabledManager.activate(testSessionId);
      expect(disabledManager.getState(testSessionId)).toBe("default");
    });

    test("setFastMode does nothing when disabled", () => {
      const disabledManager = new ThinkModeManager(createTestConfig({ enabled: false }));
      disabledManager.setFastMode(testSessionId);
      expect(disabledManager.getState(testSessionId)).toBe("default");
    });
  });

  describe("Model Selection", () => {
    test("getModelForState returns defaultModel for default state", () => {
      expect(manager.getModelForState("default")).toBe("claude-sonnet-4");
    });

    test("getModelForState returns thinkModel for think state", () => {
      expect(manager.getModelForState("think")).toBe("claude-opus-4");
    });

    test("getModelForState returns fastModel for fast state", () => {
      expect(manager.getModelForState("fast")).toBe("claude-haiku-4-5");
    });
  });

  describe("Complexity Estimation", () => {
    test("estimateComplexity returns 0 for empty text", () => {
      expect(manager.estimateComplexity("")).toBe(0);
    });

    test("estimateComplexity increases for architecture keywords", () => {
      const simple = manager.estimateComplexity("fix typo");
      const complex = manager.estimateComplexity("design the architecture for this system");
      expect(complex).toBeGreaterThan(simple);
    });

    test("estimateComplexity increases for refactoring keywords", () => {
      const simple = manager.estimateComplexity("add a button");
      const complex = manager.estimateComplexity("refactor the entire module structure");
      expect(complex).toBeGreaterThan(simple);
    });

    test("estimateComplexity decreases for simple keywords", () => {
      const complex = manager.estimateComplexity("design complex system");
      const simple = manager.estimateComplexity("quick fix for typo");
      expect(simple).toBeLessThan(complex);
    });

    test("estimateComplexity increases for longer text", () => {
      const short = manager.estimateComplexity("fix bug");
      const long = manager.estimateComplexity("a".repeat(600));
      expect(long).toBeGreaterThan(short);
    });

    test("estimateComplexity caps at 1", () => {
      const text = "architect design pattern refactor security performance complex tradeoff debug fail";
      expect(manager.estimateComplexity(text)).toBeLessThanOrEqual(1);
    });

    test("estimateComplexity floors at 0", () => {
      const text = "simple quick just add typo format lint rename";
      expect(manager.estimateComplexity(text)).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Auto Switch", () => {
    test("shouldAutoSwitch returns null when disabled", () => {
      const noAutoManager = new ThinkModeManager(createTestConfig({ autoSwitch: false }));
      expect(noAutoManager.shouldAutoSwitch(testSessionId)).toBeNull();
    });

    test("shouldAutoSwitch returns null when think mode disabled", () => {
      const disabledManager = new ThinkModeManager(createTestConfig({ enabled: false, autoSwitch: true }));
      expect(disabledManager.shouldAutoSwitch(testSessionId)).toBeNull();
    });

    test("shouldAutoSwitch returns null when already in non-default state", () => {
      const autoManager = new ThinkModeManager(createTestConfig({ autoSwitch: true }));
      autoManager.activate(testSessionId);
      expect(autoManager.shouldAutoSwitch(testSessionId)).toBeNull();
    });

    test("shouldAutoSwitch returns think for high complexity message", () => {
      const autoManager = new ThinkModeManager(createTestConfig({ autoSwitch: true, complexityThreshold: 0.3 }));
      const result = autoManager.shouldAutoSwitch(testSessionId, "architect the security design pattern");
      expect(result).toBe("think");
    });

    test("shouldAutoSwitch returns fast for low complexity message", () => {
      const autoManager = new ThinkModeManager(createTestConfig({ autoSwitch: true, complexityThreshold: 0.7 }));
      const result = autoManager.shouldAutoSwitch(testSessionId, "fix typo");
      expect(result).toBe("fast");
    });

    test("shouldAutoSwitch returns think when error count >= 2", () => {
      const autoManager = new ThinkModeManager(createTestConfig({ autoSwitch: true }));
      const config = createDefaultConfig();
      SessionManager.setDefaultConfig(config);
      const state = SessionManager.initializeSessionState(testSessionId, config);
      state.errorCount = 2;
      SessionManager.setState(testSessionId, state);
      
      const result = autoManager.shouldAutoSwitch(testSessionId);
      expect(result).toBe("think");
    });
  });

  describe("Performance Tracking", () => {
    test("recordPerformance stores metrics when enabled", () => {
      manager.recordPerformance({
        sessionId: testSessionId,
        model: "claude-opus-4",
        responseTime: 1500,
        timestamp: Date.now(),
      });

      const stats = manager.getPerformanceStats();
      expect(stats.sampleCount["claude-opus-4"]).toBe(1);
      expect(stats.averageResponseTime["claude-opus-4"]).toBe(1500);
    });

    test("recordPerformance does not store metrics when disabled", () => {
      const noTrackManager = new ThinkModeManager(createTestConfig({ trackPerformance: false }));
      noTrackManager.recordPerformance({
        sessionId: testSessionId,
        model: "claude-opus-4",
        responseTime: 1500,
        timestamp: Date.now(),
      });

      const stats = noTrackManager.getPerformanceStats();
      expect(stats.sampleCount["claude-opus-4"]).toBeUndefined();
    });

    test("getPerformanceStats calculates correct averages", () => {
      manager.recordPerformance({
        sessionId: testSessionId,
        model: "claude-sonnet-4",
        responseTime: 1000,
        timestamp: Date.now(),
      });
      manager.recordPerformance({
        sessionId: testSessionId,
        model: "claude-sonnet-4",
        responseTime: 2000,
        timestamp: Date.now(),
      });

      const stats = manager.getPerformanceStats();
      expect(stats.sampleCount["claude-sonnet-4"]).toBe(2);
      expect(stats.averageResponseTime["claude-sonnet-4"]).toBe(1500);
    });
  });

  describe("Chat Params Handler", () => {
    test("createChatParamsHandler returns handler function", () => {
      const handler = manager.createChatParamsHandler();
      expect(typeof handler).toBe("function");
    });

    test("handler modifies model based on state", () => {
      manager.activate(testSessionId);
      const handler = manager.createChatParamsHandler();
      
      const result = handler({
        sessionId: testSessionId,
        params: { model: "original-model" },
      });

      expect(result.params.model).toBe("claude-opus-4");
    });

    test("handler preserves other params", () => {
      const handler = manager.createChatParamsHandler();
      
      const result = handler({
        sessionId: testSessionId,
        params: {
          model: "original-model",
          maxTokens: 4096,
          temperature: 0.7,
        },
      });

      expect(result.params.maxTokens).toBe(4096);
      expect(result.params.temperature).toBe(0.7);
    });

    test("handler returns unmodified params when disabled", () => {
      const disabledManager = new ThinkModeManager(createTestConfig({ enabled: false }));
      const handler = disabledManager.createChatParamsHandler();
      
      const result = handler({
        sessionId: testSessionId,
        params: { model: "original-model" },
      });

      expect(result.params.model).toBe("original-model");
    });
  });
});
