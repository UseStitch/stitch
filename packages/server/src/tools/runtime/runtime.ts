import type { PrefixedString } from '@stitch/shared/id';
import type { PermissionSuggestion } from '@stitch/shared/permissions/types';

import type { Tool } from 'ai';

export type ToolRuntimeContext = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  streamRunId: string;
};

export type ToolContext = ToolRuntimeContext;

export type RuntimeToolSource = 'core' | 'toolset' | 'mcp' | 'meta' | 'task' | 'code-mode';

export type ToolPermissionBehavior = {
  getPatternTargets: (input: unknown) => string[];
  getSuggestion: (input: unknown) => PermissionSuggestion | null;
};

export type RuntimeToolMetadata = {
  displayName?: string;
  source?: RuntimeToolSource;
  permission?: ToolPermissionBehavior;
  truncation?: { maxLines?: number; maxBytes?: number };
  data?: Record<string, unknown>;
};

type RuntimeTool = RuntimeToolMetadata & {
  name: string;
  description: string;
  tool: Tool;
};

export type ToolExecutionInput = {
  toolName: string;
  args: unknown;
  executeOptions: unknown;
  tool: Tool;
  context: ToolRuntimeContext;
  metadata: RuntimeToolMetadata;
};

export type ToolExecutor = (input: ToolExecutionInput) => Promise<unknown>;
export type ToolMiddleware = (next: ToolExecutor) => ToolExecutor;

type ToolRuntime = {
  use: (middleware: ToolMiddleware) => ToolRuntime;
  wrapTool: <T extends Tool>(name: string, tool: T, metadata?: RuntimeToolMetadata) => T;
  toAiToolRecord: (tools: RuntimeTool[]) => Record<string, Tool>;
};

function compose(middlewares: ToolMiddleware[], base: ToolExecutor): ToolExecutor {
  return middlewares.reduceRight((next, middleware) => middleware(next), base);
}

export function defineRuntimeTool(
  name: string,
  tool: Tool,
  metadata: RuntimeToolMetadata = {},
): RuntimeTool {
  return {
    ...metadata,
    name,
    description: tool.description ?? '',
    tool,
  };
}

export function createToolRuntime(context: ToolRuntimeContext): ToolRuntime {
  const middlewares: ToolMiddleware[] = [];

  const runtime: ToolRuntime = {
    use(middleware) {
      middlewares.push(middleware);
      return runtime;
    },

    wrapTool<T extends Tool>(name: string, tool: T, metadata: RuntimeToolMetadata = {}) {
      const originalExecute = tool.execute;
      if (!originalExecute) return tool;

      const executor = compose(middlewares, async (input) =>
        originalExecute(input.args as never, input.executeOptions as never),
      );

      return {
        ...tool,
        execute: async (...args: Parameters<typeof originalExecute>) =>
          executor({
            toolName: name,
            args: args[0],
            executeOptions: args[1],
            tool,
            context,
            metadata,
          }),
      } as T;
    },

    toAiToolRecord(tools) {
      return Object.fromEntries(
        tools.map((runtimeTool) => [
          runtimeTool.name,
          runtime.wrapTool(runtimeTool.name, runtimeTool.tool, runtimeTool),
        ]),
      );
    },
  };

  return runtime;
}
