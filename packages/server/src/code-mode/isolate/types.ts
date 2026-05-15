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
