export type ToolBinding = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: unknown, abortSignal?: AbortSignal) => Promise<unknown>;
};

export type IsolateExecuteResult = {
  result: unknown;
  logs: string[];
};

export type IsolateContext = {
  execute(code: string): Promise<IsolateExecuteResult>;
  dispose(): void;
};

export type SandboxLibrary = {
  specifier: string;
};

export type IsolateOptions = {
  /** Memory limit in MB (default: 128) */
  memoryLimit?: number;
  /** Execution timeout in ms, excluding time spent waiting for tool calls (default: 30_000) */
  timeout?: number;
  /** AbortSignal to cancel execution and all in-flight tool calls */
  abortSignal?: AbortSignal;
  /** Maximum host tool calls allowed during one execution (default: 100) */
  maxToolCalls?: number;
  /** Maximum postMessage payload size in bytes (default: 512 KiB) */
  maxMessageBytes?: number;
  /** Host-approved libraries injected into sandbox code by variable name. */
  libraries?: Record<string, SandboxLibrary>;
};

export type IsolateDriver = {
  createContext(
    bindings: Record<string, ToolBinding>,
    options?: IsolateOptions,
  ): Promise<IsolateContext>;
};

export const ERROR_KEYS = {
  TOOL_ERROR: '__error',
  CODE_ERROR: '__codeError',
} as const;
