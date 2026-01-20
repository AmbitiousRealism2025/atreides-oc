/**
 * Notification Manager - Session event notification system for Atreides
 *
 * Implements user-facing notifications for important orchestration events:
 * - Error strikes and escalations
 * - Workflow completion
 * - Security blocks/warnings
 * - Todo enforcement blocks
 *
 * Features:
 * - Rate limiting/throttling to prevent spam
 * - Severity filtering
 * - Event type filtering via user preferences
 * - Integration with OpenCode's notify API
 * - PII filtering for notification content
 */

import { randomUUID } from "node:crypto";
import type { NotificationConfig } from "../../lib/config.js";
import type {
  SessionNotification,
  NotificationEventType,
  NotificationSeverity,
  NotificationResult,
  OpenCodeClient,
} from "../types.js";
import { createLogger } from "../../lib/logger.js";
import { filterPii } from "../../lib/session-logger.js";

const logger = createLogger("atreides:notifications");

// =============================================================================
// Severity Ordering
// =============================================================================

/**
 * Severity levels in order of priority (lowest to highest).
 */
const SEVERITY_ORDER: Record<NotificationSeverity, number> = {
  info: 0,
  success: 1,
  warning: 2,
  error: 3,
};

/**
 * Check if a severity meets the minimum threshold.
 */
function meetsSeverityThreshold(
  severity: NotificationSeverity,
  minSeverity: NotificationSeverity
): boolean {
  return SEVERITY_ORDER[severity] >= SEVERITY_ORDER[minSeverity];
}

// =============================================================================
// Notification Formatting
// =============================================================================

/**
 * Default notification titles by event type.
 */
const DEFAULT_TITLES: Record<NotificationEventType, string> = {
  "session.started": "Session Started",
  "session.completed": "Workflow Complete",
  "phase.transition": "Phase Changed",
  "error.strike": "Error Detected",
  "error.escalation": "Escalation Required",
  "error.recovery": "Error Resolved",
  "security.blocked": "Security Block",
  "security.warning": "Security Warning",
  "todo.pending": "Pending Tasks",
  "compaction.completed": "Context Compacted",
  custom: "Notification",
};

/**
 * Default severity by event type.
 */
const DEFAULT_SEVERITY: Record<NotificationEventType, NotificationSeverity> = {
  "session.started": "info",
  "session.completed": "success",
  "phase.transition": "info",
  "error.strike": "warning",
  "error.escalation": "error",
  "error.recovery": "success",
  "security.blocked": "error",
  "security.warning": "warning",
  "todo.pending": "warning",
  "compaction.completed": "info",
  custom: "info",
};

// =============================================================================
// Notification Manager Class
// =============================================================================

/**
 * Manages session notifications with throttling and filtering.
 */
export class NotificationManager {
  private config: NotificationConfig;
  private client: OpenCodeClient | null = null;

  /** Throttle tracking: Map<sessionId:eventType, lastNotificationTime> */
  private lastNotificationTime: Map<string, number> = new Map();

  /** Notification history for debugging/analytics */
  private notificationHistory: SessionNotification[] = [];
  private maxHistorySize = 100;

  constructor(config: NotificationConfig) {
    this.config = config;
  }

  /**
   * Set the OpenCode client for notification delivery.
   * Must be called before notifications can be sent.
   */
  setClient(client: OpenCodeClient): void {
    this.client = client;
    logger.debug("OpenCode client configured for notifications");
  }

  /**
   * Update the notification configuration.
   */
  updateConfig(config: NotificationConfig): void {
    this.config = config;
    logger.debug("Notification config updated", { enabled: config.enabled });
  }

  /**
   * Send a notification for a session event.
   *
   * @param sessionId - Session identifier
   * @param type - Notification event type
   * @param message - Notification message
   * @param options - Additional options
   * @returns Notification result
   */
  async notify(
    sessionId: string,
    type: NotificationEventType,
    message: string,
    options: {
      title?: string;
      severity?: NotificationSeverity;
      data?: Record<string, unknown>;
    } = {}
  ): Promise<NotificationResult> {
    // Check if notifications are enabled
    if (!this.config.enabled) {
      return { delivered: false, reason: "disabled" };
    }

    // Check if client is available
    if (!this.client?.notify) {
      logger.debug("OpenCode client notify not available", { sessionId, type });
      return { delivered: false, reason: "error" };
    }

    // Determine severity
    const severity = options.severity ?? DEFAULT_SEVERITY[type];

    // Check severity threshold
    if (!meetsSeverityThreshold(severity, this.config.minSeverity)) {
      return { delivered: false, reason: "filtered" };
    }

    // Check if event type is enabled
    if (
      this.config.enabledEvents.length > 0 &&
      !this.config.enabledEvents.includes(type)
    ) {
      return { delivered: false, reason: "filtered" };
    }

    // Check throttling
    const throttleKey = `${sessionId}:${type}`;
    const lastTime = this.lastNotificationTime.get(throttleKey);
    const now = Date.now();

    if (lastTime && this.config.throttleMs > 0) {
      const elapsed = now - lastTime;
      if (elapsed < this.config.throttleMs) {
        logger.debug("Notification throttled", {
          sessionId,
          type,
          elapsed,
          throttleMs: this.config.throttleMs,
        });
        return { delivered: false, reason: "throttled" };
      }
    }

    // Create notification
    const notification: SessionNotification = {
      id: randomUUID(),
      type,
      severity,
      sessionId,
      title: options.title ?? DEFAULT_TITLES[type],
      message: filterPii(message), // Apply PII filtering
      timestamp: new Date().toISOString(),
      ...(options.data && { data: options.data }),
    };

    try {
      // Send via OpenCode client
      this.client.notify(`atreides.${type}`, notification);

      // Update throttle tracking
      this.lastNotificationTime.set(throttleKey, now);

      // Add to history
      this.addToHistory(notification);

      logger.info("Notification sent", {
        sessionId,
        type,
        severity,
        id: notification.id,
      });

      return { delivered: true, notification };
    } catch (error) {
      logger.error("Failed to send notification", {
        sessionId,
        type,
        error: error instanceof Error ? error.message : String(error),
      });
      return { delivered: false, reason: "error" };
    }
  }

  // ===========================================================================
  // Convenience Methods for Common Events
  // ===========================================================================

  /**
   * Notify about session start.
   */
  async notifySessionStarted(
    sessionId: string,
    personaName: string
  ): Promise<NotificationResult> {
    return this.notify(sessionId, "session.started", `${personaName} is ready to assist.`, {
      data: { personaName },
    });
  }

  /**
   * Notify about workflow completion.
   */
  async notifyWorkflowComplete(
    sessionId: string,
    data?: { todosCompleted?: number; phasesVisited?: number }
  ): Promise<NotificationResult> {
    let message = "Workflow completed successfully.";
    if (data?.todosCompleted) {
      message = `Workflow completed. ${data.todosCompleted} tasks finished.`;
    }
    return this.notify(sessionId, "session.completed", message, {
      severity: "success",
      ...(data && { data }),
    });
  }

  /**
   * Notify about error strike (strike 1-2).
   */
  async notifyErrorStrike(
    sessionId: string,
    strikeCount: number,
    tool: string,
    errorMessage: string
  ): Promise<NotificationResult> {
    // Check if we should notify on every strike
    if (!this.config.notifyOnEveryStrike && strikeCount < 3) {
      return { delivered: false, reason: "filtered" };
    }

    const message = `Error ${strikeCount}/3: ${tool} failed. ${errorMessage}`;
    return this.notify(sessionId, "error.strike", message, {
      title: `Error Strike ${strikeCount}/3`,
      severity: "warning",
      data: { strikeCount, tool, errorMessage },
    });
  }

  /**
   * Notify about error escalation (strike 3+).
   */
  async notifyErrorEscalation(
    sessionId: string,
    strikeCount: number,
    tool: string
  ): Promise<NotificationResult> {
    const message = `3 consecutive errors detected. Escalating to Stilgar (Oracle agent) for guidance.`;
    return this.notify(sessionId, "error.escalation", message, {
      title: "Stilgar Escalation",
      severity: "error",
      data: { strikeCount, tool },
    });
  }

  /**
   * Notify about error recovery.
   */
  async notifyErrorRecovery(sessionId: string): Promise<NotificationResult> {
    return this.notify(
      sessionId,
      "error.recovery",
      "Errors resolved. Resuming normal operation.",
      { severity: "success" }
    );
  }

  /**
   * Notify about security block.
   */
  async notifySecurityBlocked(
    sessionId: string,
    tool: string,
    reason: string
  ): Promise<NotificationResult> {
    const message = `Tool '${tool}' blocked: ${reason}`;
    return this.notify(sessionId, "security.blocked", message, {
      severity: "error",
      data: { tool, reason },
    });
  }

  /**
   * Notify about security warning.
   */
  async notifySecurityWarning(
    sessionId: string,
    tool: string,
    reason: string
  ): Promise<NotificationResult> {
    const message = `Security warning for '${tool}': ${reason}`;
    return this.notify(sessionId, "security.warning", message, {
      severity: "warning",
      data: { tool, reason },
    });
  }

  /**
   * Notify about pending todos blocking stop.
   */
  async notifyPendingTodos(
    sessionId: string,
    pendingCount: number,
    pendingTodos: string[]
  ): Promise<NotificationResult> {
    const message =
      pendingCount === 1
        ? `1 task remaining: ${pendingTodos[0]}`
        : `${pendingCount} tasks remaining before session can end.`;
    return this.notify(sessionId, "todo.pending", message, {
      severity: "warning",
      data: { pendingCount, pendingTodos: pendingTodos.slice(0, 5) }, // Limit to 5 items
    });
  }

  /**
   * Notify about phase transition.
   */
  async notifyPhaseTransition(
    sessionId: string,
    fromPhase: string,
    toPhase: string
  ): Promise<NotificationResult> {
    const message = `Workflow phase: ${fromPhase} → ${toPhase}`;
    return this.notify(sessionId, "phase.transition", message, {
      severity: "info",
      data: { fromPhase, toPhase },
    });
  }

  /**
   * Notify about context compaction.
   */
  async notifyCompactionCompleted(sessionId: string): Promise<NotificationResult> {
    return this.notify(
      sessionId,
      "compaction.completed",
      "Context compacted. State preserved.",
      { severity: "info" }
    );
  }

  /**
   * Send a custom notification.
   */
  async notifyCustom(
    sessionId: string,
    title: string,
    message: string,
    severity: NotificationSeverity = "info",
    data?: Record<string, unknown>
  ): Promise<NotificationResult> {
    return this.notify(sessionId, "custom", message, {
      title,
      severity,
      ...(data && { data }),
    });
  }

  // ===========================================================================
  // History & Analytics
  // ===========================================================================

  /**
   * Add a notification to the history.
   */
  private addToHistory(notification: SessionNotification): void {
    this.notificationHistory.push(notification);

    // Trim history if it exceeds max size
    if (this.notificationHistory.length > this.maxHistorySize) {
      this.notificationHistory = this.notificationHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get notification history for a session.
   */
  getSessionHistory(sessionId: string): SessionNotification[] {
    return this.notificationHistory.filter((n) => n.sessionId === sessionId);
  }

  /**
   * Get all notification history.
   */
  getAllHistory(): SessionNotification[] {
    return [...this.notificationHistory];
  }

  /**
   * Clear notification history.
   */
  clearHistory(): void {
    this.notificationHistory = [];
    logger.debug("Notification history cleared");
  }

  /**
   * Clear throttle tracking for a session.
   * Called when session ends.
   */
  clearSessionThrottles(sessionId: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.lastNotificationTime.keys()) {
      if (key.startsWith(`${sessionId}:`)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.lastNotificationTime.delete(key);
    }
    logger.debug("Session throttles cleared", { sessionId, count: keysToDelete.length });
  }

  /**
   * Get notification statistics.
   */
  getStats(): {
    totalSent: number;
    byType: Record<NotificationEventType, number>;
    bySeverity: Record<NotificationSeverity, number>;
  } {
    const byType: Record<NotificationEventType, number> = {
      "session.started": 0,
      "session.completed": 0,
      "phase.transition": 0,
      "error.strike": 0,
      "error.escalation": 0,
      "error.recovery": 0,
      "security.blocked": 0,
      "security.warning": 0,
      "todo.pending": 0,
      "compaction.completed": 0,
      custom: 0,
    };

    const bySeverity: Record<NotificationSeverity, number> = {
      info: 0,
      success: 0,
      warning: 0,
      error: 0,
    };

    for (const notification of this.notificationHistory) {
      byType[notification.type]++;
      bySeverity[notification.severity]++;
    }

    return {
      totalSent: this.notificationHistory.length,
      byType,
      bySeverity,
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let defaultManager: NotificationManager | null = null;

/**
 * Get or create the default notification manager instance.
 */
export function getNotificationManager(config?: NotificationConfig): NotificationManager {
  if (!defaultManager && config) {
    defaultManager = new NotificationManager(config);
  }
  if (!defaultManager) {
    throw new Error("NotificationManager not initialized. Provide config on first call.");
  }
  return defaultManager;
}

/**
 * Reset the default notification manager (primarily for testing).
 */
export function resetNotificationManager(): void {
  defaultManager = null;
}
