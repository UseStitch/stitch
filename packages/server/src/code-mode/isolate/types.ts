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

export type IsolateOptions = {
  /** Memory limit in MB (default: 128) */
  memoryLimit?: number;
  /** Execution timeout in ms, excluding time spent waiting for permissions (default: 120_000) */
  timeout?: number;
  /** AbortSignal to cancel execution and all in-flight tool calls */
  abortSignal?: AbortSignal;
};

export type IsolateDriver = {
  createContext(
    bindings: Record<string, ToolBinding>,
    options?: IsolateOptions,
  ): Promise<IsolateContext>;
};

/**
 * Magic property names used to signal errors across the WASM boundary.
 * These form the protocol between the host and sandbox environments.
 */
export const ERROR_KEYS = {
  /** Returned by tool bindings when a tool call fails */
  TOOL_ERROR: '__error',
  /** Returned by the sandbox wrapper when user code throws */
  CODE_ERROR: '__codeError',
} as const;
