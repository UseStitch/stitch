import type { JsonValue } from './json.js';

/**
 * Shared structured logger interface.
 * All packages that accept or produce loggers should use this type
 * to ensure consistent signatures across the codebase.
 */
type LogValue = Error | JsonValue | undefined;
type LogContext = Record<string, LogValue>;

export type StitchLogger = {
  debug(extra: LogContext, message: string): void;
  debug(message: string): void;
  info(extra: LogContext, message: string): void;
  info(message: string): void;
  warn(extra: LogContext, message: string): void;
  warn(message: string): void;
  error(extra: LogContext, message: string): void;
  error(message: string): void;
};

/** A logger that silently discards all output. */
export const noopLogger: StitchLogger = { debug() {}, info() {}, warn() {}, error() {} };
