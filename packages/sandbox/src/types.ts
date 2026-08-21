export type ToolBinding = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  validateInput: (input: unknown) => void | Promise<void>;
  execute: (input: unknown, abortSignal?: AbortSignal) => Promise<unknown>;
};

export type IsolateExecuteResult =
  | { ok: true; result: unknown; logs: string[] }
  | { ok: false; error: string; logs: string[] };

export type IsolateContext = { execute(code: string): Promise<IsolateExecuteResult>; dispose(): void };

export type SandboxLibrary = { specifier: string; globalName?: string; inject?: boolean };

export type SandboxProcessDriverOptions = {
  /** Path to the compiled sandbox process binary. */
  execPath: string;
};

export type IsolateOptions = {
  /** Memory limit in MB (default: driver limit or 512) */
  memoryLimit?: number;
  /** Execution timeout in ms, excluding time spent waiting for tool calls (default: 30_000) */
  timeout?: number;
  /** AbortSignal to cancel execution and all in-flight tool calls */
  abortSignal?: AbortSignal;
  /** Maximum host tool calls allowed during one execution (default: 100) */
  maxToolCalls?: number;
  /** Host-approved libraries injected into sandbox code by variable name. */
  libraries?: Record<string, SandboxLibrary>;
};

export type IsolateDriver = {
  createContext(bindings: Record<string, ToolBinding>, options?: IsolateOptions): Promise<IsolateContext>;
};
