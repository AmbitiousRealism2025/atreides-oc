import type { PluginContext, SessionState, WorkflowPhase } from "../../src/plugin/types.js";
import type { Config } from "../../src/lib/config.js";

export interface MockNotification {
  event: string;
  data?: unknown;
  timestamp: Date;
}

export interface MockLogEntry {
  level: string;
  message: string;
  meta?: Record<string, unknown>;
  timestamp: Date;
}

export interface MockShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface MockContextOptions {
  projectPath?: string;
  projectName?: string;
  directory?: string;
  worktree?: string;
  shellResults?: Map<string, MockShellResult>;
}

export function createMockContext(options: MockContextOptions = {}): PluginContext & {
  notifications: MockNotification[];
  logs: MockLogEntry[];
  shellCommands: string[];
} {
  const notifications: MockNotification[] = [];
  const logs: MockLogEntry[] = [];
  const shellCommands: string[] = [];
  const shellResults = options.shellResults ?? new Map<string, MockShellResult>();

  return {
    project: {
      path: options.projectPath ?? "/test/project",
      name: options.projectName ?? "test-project",
    },
    client: {
      notify: (event: string, data?: unknown) => {
        notifications.push({ event, data, timestamp: new Date() });
      },
      log: (level: string, message: string, meta?: Record<string, unknown>) => {
        logs.push({ level, message, meta, timestamp: new Date() });
      },
    },
    $: async (command: string, _options?: { cwd?: string; timeout?: number }) => {
      shellCommands.push(command);
      const result = shellResults.get(command);
      return result ?? { stdout: "", stderr: "", exitCode: 0 };
    },
    directory: options.directory ?? "/test/project",
    worktree: options.worktree,
    notifications,
    logs,
    shellCommands,
  };
}

export function createMockConfig(overrides: Partial<Config> = {}): Config {
  return {
    identity: {
      personaName: "TestPersona",
      responsePrefix: false,
      delegationAnnouncements: false,
      ...overrides.identity,
    },
    workflow: {
      enablePhaseTracking: true,
      strictTodoEnforcement: false,
      autoEscalateOnError: false,
      ...overrides.workflow,
    },
    security: {
      enableObfuscationDetection: false,
      blockedPatterns: [],
      warningPatterns: [],
      blockedFiles: [],
      ...overrides.security,
    },
  };
}

export function createMockSessionState(
  sessionId: string,
  overrides: Partial<SessionState> = {}
): SessionState {
  const now = new Date();
  return {
    sessionId,
    createdAt: now,
    lastActivityAt: now,
    phase: "idle" as WorkflowPhase,
    errorCount: 0,
    todosCreated: false,
    todoCount: 0,
    todosCompleted: 0,
    toolHistory: [],
    config: createMockConfig(),
    metadata: {},
    ...overrides,
  };
}

export function createMockToolInput(tool: string): unknown {
  const toolInputs: Record<string, unknown> = {
    read: { path: "/test/file.ts" },
    write: { path: "/test/file.ts", content: "test content" },
    bash: { command: "echo test" },
    edit: { path: "/test/file.ts", oldContent: "old", newContent: "new" },
    glob: { pattern: "**/*.ts" },
    grep: { pattern: "test", path: "/test" },
    todowrite: { todos: [] },
    todoread: { _placeholder: true },
  };
  return toolInputs[tool] ?? {};
}

export function createMockToolOutput(tool: string, success = true): unknown {
  if (!success) {
    return { error: "Mock error", exitCode: 1 };
  }

  const toolOutputs: Record<string, unknown> = {
    read: { content: "file content" },
    write: { success: true },
    bash: { stdout: "output", stderr: "", exitCode: 0 },
    edit: { success: true },
    glob: { files: ["/test/file.ts"] },
    grep: { matches: [] },
    todowrite: { todos: [] },
    todoread: { todos: [] },
  };
  return toolOutputs[tool] ?? {};
}

export interface MockEventPayload {
  type: string;
  sessionId: string;
  data?: Record<string, unknown>;
}

export function createSessionCreatedEvent(sessionId: string): MockEventPayload {
  return { type: "session.created", sessionId };
}

export function createSessionDeletedEvent(sessionId: string): MockEventPayload {
  return { type: "session.deleted", sessionId };
}

export function createSessionIdleEvent(sessionId: string): MockEventPayload {
  return { type: "session.idle", sessionId };
}
