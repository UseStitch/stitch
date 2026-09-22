export type SandboxValue =
  | boolean
  | null
  | number
  | string
  | undefined
  | SandboxValue[]
  | { [key: string]: SandboxValue };

type JsonSchemaValue = boolean | null | number | string | JsonSchemaValue[] | { [key: string]: JsonSchemaValue };

type JsonSchema = { [keyword: string]: JsonSchemaValue };

export type ToolBinding<Input extends SandboxValue = SandboxValue, Output extends SandboxValue = SandboxValue> = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  validateInput: (input: Input) => void | Promise<void>;
  execute: (input: Input, abortSignal?: AbortSignal) => Promise<Output>;
};

export type IsolateExecuteResult =
  | { ok: true; result: SandboxValue; logs: string[] }
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
