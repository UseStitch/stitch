import {
  permissionMiddleware,
  resultNormalizationMiddleware,
  truncationMiddleware,
} from '@/tools/runtime/middleware.js';
import type {
  RuntimeToolMetadata,
  RuntimeToolSource,
  ToolContext,
  ToolExecuteOptions,
  ToolExecutionInput,
  ToolInput,
  ToolPermissionBehavior,
  ToolTruncationLimits,
} from '@/tools/runtime/runtime.js';
import type { Tool } from 'ai';

export type ToolDefinition = {
  name: string;
  displayName: string;
  tool: Tool;
  source?: RuntimeToolSource;
  permission?: ToolPermissionBehavior;
  truncation?: ToolTruncationLimits;
};

export function wrapTool(context: ToolContext, def: ToolDefinition): Tool {
  const originalExecute = def.tool.execute;
  if (!originalExecute) return def.tool;

  const metadata: RuntimeToolMetadata = {
    displayName: def.displayName,
    source: def.source ?? 'core',
    permission: def.permission,
    truncation: def.truncation,
  };

  let executor = (input: ToolExecutionInput) => originalExecute(input.args, input.executeOptions);
  executor = truncationMiddleware(def.truncation)(executor);
  if (def.permission) {
    executor = permissionMiddleware()(executor);
  }
  executor = resultNormalizationMiddleware()(executor);

  return {
    ...def.tool,
    execute: async (args: ToolInput, executeOptions: ToolExecuteOptions) =>
      executor({ toolName: def.name, args, executeOptions, tool: def.tool, context, metadata }),
  };
}
