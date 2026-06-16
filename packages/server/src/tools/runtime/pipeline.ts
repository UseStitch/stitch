import type { PermissionSuggestion } from '@stitch/shared/permissions/types';
import type { Tool } from 'ai';

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
} from '@/tools/runtime/runtime.js';

/**
 * Declarative tool definition — pure data describing a tool.
 * Tools declare what they need (permission, truncation, source).
 * The pipeline applies middleware uniformly at assembly time.
 */
export type ToolDefinition = {
  name: string;
  displayName: string;
  tool: Tool;
  source?: RuntimeToolSource;
  permission?: {
    getPatternTargets: (input: unknown) => string[];
    getSuggestion: (input: unknown) => PermissionSuggestion | null;
  };
  truncation?: { maxLines?: number; maxBytes?: number };
  /** Extra middleware applied after the standard stack for this tool. */
  extraMiddleware?: ToolMiddleware[];
};

/**
 * A single pipeline that applies the standard middleware stack to tool definitions.
 * Replaces the repeated `createToolRuntime(ctx).use(...).wrapTool(...)` ceremony.
 */
export class ToolPipeline {
  private constructor(private readonly context: ToolContext) {}

  static create(context: ToolContext): ToolPipeline {
    return new ToolPipeline(context);
  }

  /**
   * Register a single ToolDefinition, applying the standard middleware stack.
   * Returns a wrapped Tool ready for the AI SDK.
   */
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

  /**
   * Register multiple ToolDefinitions at once.
   * Returns a Record<name, Tool> ready for the AI SDK.
   */
  registerAll(defs: ToolDefinition[]): Record<string, Tool> {
    return Object.fromEntries(defs.map((def) => [def.name, this.register(def)]));
  }

  private buildMiddlewareStack(def: ToolDefinition): ToolMiddleware[] {
    const stack: ToolMiddleware[] = [resultNormalizationMiddleware()];

    if (def.permission) {
      stack.push(permissionMiddleware());
    }

    stack.push(truncationMiddleware(def.truncation));

    if (def.extraMiddleware) {
      stack.push(...def.extraMiddleware);
    }

    return stack;
  }
}
