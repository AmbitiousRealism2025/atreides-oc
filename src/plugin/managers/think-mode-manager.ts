import type { ThinkModeConfig } from "../../lib/config.js";
import type {
  ThinkModeState,
  ThinkModePerformanceMetrics,
  ChatParams,
  ChatParamsHookPayload,
  ChatParamsHookResult,
} from "../types.js";
import { createLogger } from "../../lib/logger.js";
import * as SessionManager from "./session-manager.js";

const logger = createLogger("atreides:think-mode");

const COMPLEXITY_INDICATORS: RegExp[] = [
  /architect/i,
  /design pattern/i,
  /refactor/i,
  /security/i,
  /performance/i,
  /multi-?step/i,
  /complex/i,
  /tradeoff/i,
  /debug.*fail/i,
];

const FAST_TASK_INDICATORS: RegExp[] = [
  /simple/i,
  /quick/i,
  /just\s+(add|remove|change)/i,
  /typo/i,
  /format/i,
  /lint/i,
  /rename/i,
];

export class ThinkModeManager {
  private config: ThinkModeConfig;
  private sessionStates: Map<string, ThinkModeState> = new Map();
  private performanceHistory: ThinkModePerformanceMetrics[] = [];
  private readonly maxHistorySize = 100;

  constructor(config: ThinkModeConfig) {
    this.config = config;
  }

  getState(sessionId: string): ThinkModeState {
    return this.sessionStates.get(sessionId) ?? "default";
  }

  activate(sessionId: string): void {
    if (!this.config.enabled) {
      logger.debug("Think mode disabled by config", { sessionId });
      return;
    }

    const previous = this.getState(sessionId);
    this.sessionStates.set(sessionId, "think");
    SessionManager.setMetadata(sessionId, "thinkModeState", "think");

    logger.info("Think mode activated", { sessionId, previous });
  }

  deactivate(sessionId: string): void {
    const previous = this.getState(sessionId);
    this.sessionStates.set(sessionId, "default");
    SessionManager.setMetadata(sessionId, "thinkModeState", "default");

    logger.info("Think mode deactivated", { sessionId, previous });
  }

  setFastMode(sessionId: string): void {
    if (!this.config.enabled) {
      logger.debug("Think mode disabled by config", { sessionId });
      return;
    }

    const previous = this.getState(sessionId);
    this.sessionStates.set(sessionId, "fast");
    SessionManager.setMetadata(sessionId, "thinkModeState", "fast");

    logger.info("Fast mode activated", { sessionId, previous });
  }

  getModelForState(state: ThinkModeState): string {
    switch (state) {
      case "think":
        return this.config.thinkModel;
      case "fast":
        return this.config.fastModel;
      default:
        return this.config.defaultModel;
    }
  }

  estimateComplexity(text: string): number {
    if (!text) return 0;

    let score = 0;
    const normalizedText = text.toLowerCase();

    for (const pattern of COMPLEXITY_INDICATORS) {
      if (pattern.test(normalizedText)) {
        score += 0.15;
      }
    }

    for (const pattern of FAST_TASK_INDICATORS) {
      if (pattern.test(normalizedText)) {
        score -= 0.1;
      }
    }

    if (normalizedText.length > 500) score += 0.1;
    if (normalizedText.length > 1000) score += 0.1;
    if ((normalizedText.match(/\n/g) || []).length > 10) score += 0.05;

    return Math.max(0, Math.min(1, score));
  }

  shouldAutoSwitch(sessionId: string, userMessage?: string): ThinkModeState | null {
    if (!this.config.enabled || !this.config.autoSwitch) {
      return null;
    }

    const currentState = this.getState(sessionId);
    if (currentState !== "default") {
      return null;
    }

    const state = SessionManager.getStateOrUndefined(sessionId);
    const errorCount = state?.errorCount ?? 0;

    if (errorCount >= 2) {
      logger.debug("Auto-switching to think mode due to errors", { sessionId, errorCount });
      return "think";
    }

    if (userMessage) {
      const complexity = this.estimateComplexity(userMessage);
      if (complexity >= this.config.complexityThreshold) {
        logger.debug("Auto-switching to think mode due to complexity", {
          sessionId,
          complexity,
          threshold: this.config.complexityThreshold,
        });
        return "think";
      }

      if (complexity < 0.2) {
        logger.debug("Auto-switching to fast mode for simple task", {
          sessionId,
          complexity,
        });
        return "fast";
      }
    }

    return null;
  }

  recordPerformance(metrics: ThinkModePerformanceMetrics): void {
    if (!this.config.trackPerformance) {
      return;
    }

    this.performanceHistory.push(metrics);

    if (this.performanceHistory.length > this.maxHistorySize) {
      this.performanceHistory.shift();
    }

    logger.debug("Performance recorded", {
      sessionId: metrics.sessionId,
      model: metrics.model,
      responseTime: metrics.responseTime,
    });
  }

  getPerformanceStats(): {
    averageResponseTime: Record<string, number>;
    sampleCount: Record<string, number>;
  } {
    const stats: Record<string, { total: number; count: number }> = {};

    for (const metric of this.performanceHistory) {
      const existing = stats[metric.model];
      if (existing) {
        existing.total += metric.responseTime;
        existing.count += 1;
      } else {
        stats[metric.model] = { total: metric.responseTime, count: 1 };
      }
    }

    const averageResponseTime: Record<string, number> = {};
    const sampleCount: Record<string, number> = {};

    for (const [model, data] of Object.entries(stats)) {
      averageResponseTime[model] = data.count > 0 ? data.total / data.count : 0;
      sampleCount[model] = data.count;
    }

    return { averageResponseTime, sampleCount };
  }

  createChatParamsHandler(): (
    payload: ChatParamsHookPayload
  ) => ChatParamsHookResult {
    return (payload: ChatParamsHookPayload): ChatParamsHookResult => {
      const { sessionId, params } = payload;

      if (!this.config.enabled) {
        return { params };
      }

      const autoSwitchState = this.shouldAutoSwitch(sessionId);
      if (autoSwitchState) {
        this.sessionStates.set(sessionId, autoSwitchState);
        SessionManager.setMetadata(sessionId, "thinkModeState", autoSwitchState);
      }

      const currentState = this.getState(sessionId);
      const model = this.getModelForState(currentState);

      const modifiedParams: ChatParams = {
        ...params,
        model,
      };

      logger.debug("Chat params modified", {
        sessionId,
        state: currentState,
        originalModel: params.model,
        newModel: model,
      });

      return { params: modifiedParams };
    };
  }

  cleanup(sessionId: string): void {
    this.sessionStates.delete(sessionId);
    logger.debug("Session state cleaned up", { sessionId });
  }
}

let instance: ThinkModeManager | null = null;

export function getThinkModeManager(config?: ThinkModeConfig): ThinkModeManager {
  if (!instance && config) {
    instance = new ThinkModeManager(config);
  }
  if (!instance) {
    throw new Error("ThinkModeManager not initialized. Call with config first.");
  }
  return instance;
}

export function resetThinkModeManager(): void {
  instance = null;
}
