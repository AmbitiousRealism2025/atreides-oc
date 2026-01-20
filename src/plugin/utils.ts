import type {
  HookName,
  HookSafeDefaults,
  StopHookResult,
  ToolBeforeHookResult,
  SystemTransformHookResult,
  CompactionHookResult,
  SystemTransformHookPayload,
  CompactionHookPayload,
} from "./types.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("atreides:hooks");

const SAFE_DEFAULTS: HookSafeDefaults = {
  event: undefined,
  stop: { allow: true },
  "tool.execute.before": { allow: true },
  "tool.execute.after": undefined,
  "experimental.chat.system.transform": { system: "" },
  "experimental.session.compacting": { summary: "" },
};

function getSafeDefault<T extends HookName>(
  hookName: T,
  payload?: unknown
): HookSafeDefaults[T] {
  const baseDefault = SAFE_DEFAULTS[hookName];

  if (hookName === "experimental.chat.system.transform" && payload) {
    const p = payload as SystemTransformHookPayload;
    return { system: p.system } as HookSafeDefaults[T];
  }

  if (hookName === "experimental.session.compacting" && payload) {
    const p = payload as CompactionHookPayload;
    return { summary: p.summary } as HookSafeDefaults[T];
  }

  return baseDefault;
}

export function wrapHook<T extends (...args: never[]) => unknown>(
  hookName: HookName,
  handler: T
): T {
  const wrapped = async (
    ...args: Parameters<T>
  ): Promise<Awaited<ReturnType<T>>> => {
    try {
      const result = await handler(...args);
      return result as Awaited<ReturnType<T>>;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Hook '${hookName}' failed`, {
        hook: hookName,
        error: errorMessage,
      });
      return getSafeDefault(hookName, args[0]) as Awaited<ReturnType<T>>;
    }
  };

  Object.defineProperty(wrapped, "name", { value: `wrapped_${hookName}` });
  return wrapped as unknown as T;
}

export function createStopHookResult(
  allow: boolean,
  message?: string
): StopHookResult {
  return message ? { allow, message } : { allow };
}

export function createToolBeforeResult(
  allow: boolean,
  message?: string,
  modified?: unknown
): ToolBeforeHookResult {
  const result: ToolBeforeHookResult = { allow };
  if (message) result.message = message;
  if (modified !== undefined) result.modified = modified;
  return result;
}

export function createSystemTransformResult(
  system: string
): SystemTransformHookResult {
  return { system };
}

export function createCompactionResult(
  summary: string
): CompactionHookResult {
  return { summary };
}

export function isValidSessionId(sessionId: unknown): sessionId is string {
  return typeof sessionId === "string" && sessionId.length > 0;
}

export function sanitizeLogOutput(output: string, maxLength = 500): string {
  const sanitized = output.replace(/[\x00-\x1F\x7F]/g, "");
  return sanitized.length > maxLength
    ? sanitized.substring(0, maxLength) + "..."
    : sanitized;
}
