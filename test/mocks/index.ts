/**
 * Mock exports for Atreides tests.
 *
 * This module re-exports mock factories from the utils/test-helpers module
 * for convenient import in test files.
 */

export * from "./opencode-context.js";

// Re-export commonly used mock factories from test-helpers
export {
  createMockClient,
  createMockShell,
  createMockContext,
  createMockProject,
  createMockConfig,
  createMinimalConfig,
  createMockSession,
  createMockWorkflowState,
  createSessionInPhase,
  createMockErrorRecoveryState,
  createMockTodos,
  createMixedTodos,
  createMockToolExecution,
  createWorkflowToolHistory,
  createMockSecurityPatterns,
  createMockBlockedFiles,
  createMockErrorOutputs,
} from "../utils/test-helpers.js";

// Re-export test project helpers
export {
  createTestProject,
  cleanupTestProject,
  type TestProject,
  type TestProjectOptions,
} from "../utils/test-helpers.js";
