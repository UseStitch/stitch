import type { PrefixedString } from '@stitch/shared/id';
import type { PermissionSuggestion } from '@stitch/shared/permissions/types';

import type { Tool, ToolExecutionOptions } from 'ai';

export type ToolContext = { sessionId: PrefixedString<'ses'>; messageId: PrefixedString<'msg'>; streamRunId: string };

export type RuntimeToolSource = 'core' | 'toolset' | 'mcp' | 'meta' | 'task' | 'code-mode';

export type ToolInput = Record<string, unknown>;
export type ToolExecuteOptions = ToolExecutionOptions & { skipTruncation?: boolean };
export type ToolTruncationLimits = { maxLines?: number; maxBytes?: number };

export type ToolPermissionBehavior = {
  getPatternTargets: (input: ToolInput) => string[];
  getSuggestion: (input: ToolInput) => PermissionSuggestion | null;
};

export type RuntimeToolMetadata = {
  displayName?: string;
  source?: RuntimeToolSource;
  permission?: ToolPermissionBehavior;
  truncation?: ToolTruncationLimits;
};

export type ToolExecutionInput = {
  toolName: string;
  args: ToolInput;
  executeOptions: ToolExecuteOptions;
  tool: Tool;
  context: ToolContext;
  metadata: RuntimeToolMetadata;
};

type ToolExecutor = (input: ToolExecutionInput) => Promise<unknown>;
export type ToolMiddleware = (next: ToolExecutor) => ToolExecutor;

type ToolRuntime = {
  use: (middleware: ToolMiddleware) => ToolRuntime;
  wrapTool: <T extends Tool>(name: string, tool: T, metadata?: RuntimeToolMetadata) => T;
};

function compose(middlewares: ToolMiddleware[], base: ToolExecutor): ToolExecutor {
  return middlewares.reduceRight((next, middleware) => middleware(next), base);
}

export function createToolRuntime(context: ToolContext): ToolRuntime {
  const middlewares: ToolMiddleware[] = [];

  const runtime: ToolRuntime = {
    use(middleware) {
      middlewares.push(middleware);
      return runtime;
    },

    wrapTool<T extends Tool>(name: string, tool: T, metadata: RuntimeToolMetadata = {}) {
      const originalExecute: Tool['execute'] = tool.execute;
      if (!originalExecute) return tool;

      const executor = compose(middlewares, async (input) => originalExecute(input.args, input.executeOptions));

      return {
        ...tool,
        execute: async (args: ToolInput, executeOptions: ToolExecuteOptions) =>
          executor({ toolName: name, args, executeOptions, tool, context, metadata }),
      } as T;
    },
  };

  return runtime;
}
