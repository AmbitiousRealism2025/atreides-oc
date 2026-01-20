export { createLogger, type Logger } from "./logger.js";
export { loadConfig, createDefaultConfig, type Config, type LoggingConfig } from "./config.js";
export { FileManager } from "./file-manager.js";
export * from "./constants.js";
export * from "./manifest.js";
export * from "./version.js";
export * from "./backup.js";
export * from "./merge.js";

// Session logging and state persistence
export {
  SessionLogger,
  getSessionLogger,
  resetSessionLogger,
  filterPii,
  filterPiiFromObject,
  DEFAULT_LOGGER_CONFIG,
  type SessionLogLevel,
  type SessionLogEvent,
  type SessionLogEntry,
  type SessionLoggerConfig,
} from "./session-logger.js";

export {
  StatePersistence,
  getStatePersistence,
  resetStatePersistence,
  DEFAULT_PERSISTENCE_CONFIG,
  type PersistedSessionState,
  type StatePersistenceConfig,
} from "./state-persistence.js";
