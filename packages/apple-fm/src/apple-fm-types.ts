/** Shared types for the Apple FM native bridge layer. */

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
};

export type ModelAvailability = {
  available: boolean;
  reason: string;
};

export type NativeBindings = {
  checkAvailability: () => ModelAvailability;
  getSupportedLanguages: () => string[];
  generateUnified: (
    messagesJson: string,
    toolsJson?: string | null,
    schemaJson?: string | null,
    temperature?: number,
    maxTokens?: number,
    stopAfterToolCalls?: boolean,
  ) => Promise<string>;
  generateUnifiedStream: (
    messagesJson: string,
    toolsJson: string | null | undefined,
    schemaJson: string | null | undefined,
    temperature: number | undefined,
    maxTokens: number | undefined,
    stopAfterToolCalls: boolean | undefined,
    cb: (err: unknown, chunk?: string | null) => void,
  ) => void;
  setToolCallback: (
    callback: (err: Error | null, toolId: number, argsJson: string) => void,
  ) => void;
  clearToolCallback: () => void;
  toolResult: (toolId: number, resultJson: string) => void;
};

export type EphemeralTool = {
  name: string;
  description?: string;
  jsonSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => PromiseLike<unknown>;
};
