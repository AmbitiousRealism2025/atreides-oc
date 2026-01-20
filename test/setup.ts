import { afterEach, afterAll } from "bun:test";
import { clearSessions } from "../src/plugin/index.js";

process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "error";

afterEach(() => {
  clearSessions();
});

afterAll(() => {
  clearSessions();
});

export const TEST_TIMEOUT = {
  unit: 5000,
  integration: 10000,
  e2e: 30000,
} as const;

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let sessionCounter = 0;
export function createTestSessionId(prefix = "test"): string {
  return `${prefix}-session-${++sessionCounter}-${Date.now()}`;
}

export function resetSessionCounter(): void {
  sessionCounter = 0;
}

declare global {
  var testUtils: {
    wait: typeof wait;
    createTestSessionId: typeof createTestSessionId;
    resetSessionCounter: typeof resetSessionCounter;
    TEST_TIMEOUT: typeof TEST_TIMEOUT;
  };
}

globalThis.testUtils = {
  wait,
  createTestSessionId,
  resetSessionCounter,
  TEST_TIMEOUT,
};

const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

export { originalConsole };
