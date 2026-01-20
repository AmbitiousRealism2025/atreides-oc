import { join } from "node:path";
import { AtreidesPlugin, clearSessions, type PluginHooks } from "../../src/plugin/index.js";
import { createMockContext, createMockConfig, type MockContextOptions } from "../mocks/index.js";
import type { Config } from "../../src/lib/config.js";

export interface TestHarnessOptions {
  projectPath?: string;
  config?: Partial<Config>;
  mockContext?: MockContextOptions;
}

export interface TestHarness {
  hooks: PluginHooks;
  context: ReturnType<typeof createMockContext>;
  sessionId: string;
  simulateSessionCreate: () => Promise<void>;
  simulateSessionDelete: () => Promise<void>;
  simulateToolExecution: (
    tool: string,
    input: unknown,
    output: unknown
  ) => Promise<void>;
  cleanup: () => void;
}

let harnessCounter = 0;

export async function createTestHarness(
  options: TestHarnessOptions = {}
): Promise<TestHarness> {
  const sessionId = `harness-session-${++harnessCounter}-${Date.now()}`;
  const context = createMockContext({
    projectPath: options.projectPath ?? join(__dirname, "../fixtures/sample-project"),
    ...options.mockContext,
  });

  const hooks = await AtreidesPlugin(context);

  const simulateSessionCreate = async () => {
    await hooks.event({ type: "session.created", sessionId });
  };

  const simulateSessionDelete = async () => {
    await hooks.event({ type: "session.deleted", sessionId });
  };

  const simulateToolExecution = async (
    tool: string,
    input: unknown,
    output: unknown
  ) => {
    await hooks["tool.execute.before"]({ tool, input, sessionId });
    await hooks["tool.execute.after"]({ tool, input, output, sessionId });
  };

  const cleanup = () => {
    clearSessions();
  };

  return {
    hooks,
    context,
    sessionId,
    simulateSessionCreate,
    simulateSessionDelete,
    simulateToolExecution,
    cleanup,
  };
}

export async function createInitializedHarness(
  options: TestHarnessOptions = {}
): Promise<TestHarness> {
  const harness = await createTestHarness(options);
  await harness.simulateSessionCreate();
  return harness;
}

export function getFixturePath(fixture: string): string {
  return join(__dirname, "../fixtures", fixture);
}

export function getSampleProjectPath(): string {
  return getFixturePath("sample-project");
}

export function getTemplatePath(template: string): string {
  return getFixturePath(`templates/${template}`);
}

export function getExpectedOutputPath(output: string): string {
  return getFixturePath(`expected-outputs/${output}`);
}
