/**
 * Shared structured logger interface.
 * All packages that accept or produce loggers should use this type
 * to ensure consistent signatures across the codebase.
 */
export type StitchLogger = {
  debug(extra: Record<string, unknown>, message: string): void;
  debug(message: string): void;
  info(extra: Record<string, unknown>, message: string): void;
  info(message: string): void;
  warn(extra: Record<string, unknown>, message: string): void;
  warn(message: string): void;
  error(extra: Record<string, unknown>, message: string): void;
  error(message: string): void;
};

/** A logger that silently discards all output. */
export const noopLogger: StitchLogger = { debug() {}, info() {}, warn() {}, error() {} };
