/**
 * Minimal logger interface for @stitch-connectors/google.
 * Matches a subset of the server's Logger type so the server can pass its
 * own logger in without the google package depending on the server.
 */
export type GoogleLogger = {
  debug(extra: Record<string, any>, message: string): void;
  debug(message: string): void;
  info(extra: Record<string, any>, message: string): void;
  info(message: string): void;
  warn(extra: Record<string, any>, message: string): void;
  warn(message: string): void;
  error(extra: Record<string, any>, message: string): void;
  error(message: string): void;
};

/** No-op logger used when no logger is provided. */
export const noopLogger: GoogleLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};
