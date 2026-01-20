export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

export function createLogger(name: string): Logger {
  const format = (level: LogLevel, message: string, meta?: Record<string, unknown>): string => {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
    return `[${timestamp}] [${level.toUpperCase()}] [${name}] ${message}${metaStr}`;
  };

  return {
    debug: (message, meta) => console.debug(format("debug", message, meta)),
    info: (message, meta) => console.info(format("info", message, meta)),
    warn: (message, meta) => console.warn(format("warn", message, meta)),
    error: (message, meta) => console.error(format("error", message, meta)),
  };
}
