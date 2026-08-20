import {
  permissionMiddleware,
  resultNormalizationMiddleware,
  truncationMiddleware,
} from '@/tools/runtime/middleware.js';
import { createToolRuntime } from '@/tools/runtime/runtime.js';
import type {
  RuntimeToolMetadata,
  RuntimeToolSource,
  ToolContext,
  ToolMiddleware,
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
export class ToolPipeline {
  private constructor(private readonly context: ToolContext) {}

  static create(context: ToolContext): ToolPipeline {
    return new ToolPipeline(context);
  }

  register(def: ToolDefinition): Tool {
    const middlewares = this.buildMiddlewareStack(def);
    const runtime = createToolRuntime(this.context);
    for (const mw of middlewares) {
      runtime.use(mw);
    }
    const metadata: RuntimeToolMetadata = {
      displayName: def.displayName,
      source: def.source ?? 'core',
      permission: def.permission,
      truncation: def.truncation,
    };
    return runtime.wrapTool(def.name, def.tool, metadata);
  }

  registerAll(defs: ToolDefinition[]): Record<string, Tool> {
    return Object.fromEntries(defs.map((def) => [def.name, this.register(def)]));
  }

  private buildMiddlewareStack(def: ToolDefinition): ToolMiddleware[] {
    const stack: ToolMiddleware[] = [resultNormalizationMiddleware()];

    if (def.permission) {
      stack.push(permissionMiddleware());
    }

    stack.push(truncationMiddleware(def.truncation));

    return stack;
  }
}
