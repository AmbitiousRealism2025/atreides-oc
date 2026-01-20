declare module "@opencode-ai/plugin" {
  export interface PluginContext {
    sessionId: string;
    projectPath: string;
    config: Record<string, unknown>;
  }

  export interface HookResult {
    allow?: boolean;
    message?: string;
    modified?: unknown;
  }

  export interface Plugin {
    name: string;
    version: string;
    event?: (event: { type: string; sessionId: string }) => void | Promise<void>;
    stop?: (context: { sessionId: string }) => HookResult | Promise<HookResult>;
    "tool.execute.before"?: (context: {
      tool: string;
      input: unknown;
      sessionId: string;
    }) => HookResult | Promise<HookResult>;
    "tool.execute.after"?: (context: {
      tool: string;
      input: unknown;
      output: unknown;
      sessionId: string;
    }) => void | Promise<void>;
    "experimental.chat.system.transform"?: (context: {
      system: string;
      sessionId: string;
    }) => { system: string } | Promise<{ system: string }>;
    "experimental.session.compacting"?: (context: {
      sessionId: string;
      summary: string;
    }) => { summary: string } | Promise<{ summary: string }>;
  }
}
