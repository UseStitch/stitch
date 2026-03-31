import { tool } from 'ai';
import { z } from 'zod';

import type { ToolsetManager } from '@/tools/toolsets/manager.js';
import { getToolset } from '@/tools/toolsets/registry.js';

/**
 * Create the three toolset management meta-tools bound to a specific ToolsetManager instance.
 * These are always-active tools that let the LLM discover, activate, and deactivate toolsets.
 */
export function createToolsetTools(manager: ToolsetManager) {
  const list_toolsets = tool({
    description: `List toolsets and inspect toolset contents. Call with no arguments for a compact catalog, or pass a toolset ID for detailed tools and prompts.`,
    inputSchema: z.object({
      toolsetId: z
        .string()
        .optional()
        .describe('Optional toolset ID to inspect in detail (e.g. "browser", "meetings")'),
    }),
    execute: async ({ toolsetId }) => {
      if (!toolsetId) {
        return {
          toolsets: manager.getCatalogWithState(),
        };
      }

      const toolset = getToolset(toolsetId);
      if (!toolset) {
        return {
          error: `Unknown toolset: "${toolsetId}". Use list_toolsets with no arguments to see available IDs.`,
        };
      }

      const tools = toolset.tools();
      return {
        toolsetId: toolset.id,
        name: toolset.name,
        description: toolset.description,
        icon: toolset.icon ?? null,
        active: manager.isActive(toolsetId),
        hasInstructions: !!toolset.instructions,
        promptCount: toolset.prompts?.length ?? 0,
        prompts:
          toolset.prompts?.map((p) => ({
            name: p.name,
            description: p.description,
            arguments: p.arguments,
          })) ?? [],
        tools: tools.map((t) => ({ name: t.name, description: t.description })),
      };
    },
  });

  const activate_toolset = tool({
    description: `Activate a toolset to make its tools callable. Activate only what you need. By default this returns a compact response; set verbose=true only when you need full toolset instructions and prompt metadata.`,
    inputSchema: z.object({
      toolsetId: z.string().describe('The toolset ID to activate (e.g. "browser", "meetings")'),
      verbose: z
        .boolean()
        .optional()
        .describe('Include full toolset instructions and prompt metadata in the response.'),
    }),
    execute: async ({ toolsetId, verbose }) => {
      if (manager.isActive(toolsetId)) {
        return {
          toolsetId,
          status: 'already_active',
          icon: getToolset(toolsetId)?.icon ?? null,
          message: `Toolset "${toolsetId}" is already active.`,
        };
      }

      const toolNames = await manager.activate(toolsetId);
      if (toolNames === null) {
        return {
          error: `Unknown toolset: "${toolsetId}". Use list_toolsets with no arguments to see available IDs.`,
        };
      }

      const toolset = getToolset(toolsetId);
      const shouldIncludeVerbose = verbose === true;

      return {
        toolsetId,
        status: 'activated',
        tools: toolNames,
        icon: toolset?.icon ?? null,
        message: `Toolset "${toolsetId}" activated. ${toolNames.length} tool(s) now available: ${toolNames.join(', ')}`,
        hasInstructions: !!toolset?.instructions,
        promptCount: toolset?.prompts?.length ?? 0,
        instructions: shouldIncludeVerbose ? (toolset?.instructions ?? null) : null,
        prompts: shouldIncludeVerbose
          ? (toolset?.prompts?.map((p) => ({
              name: p.name,
              description: p.description,
              arguments: p.arguments,
            })) ?? null)
          : null,
      };
    },
  });

  const deactivate_toolset = tool({
    description: `Deactivate a toolset to remove its tools and free up context. Use when you are done with a toolset's capabilities for the current task.`,
    inputSchema: z.object({
      toolsetId: z.string().describe('The toolset ID to deactivate'),
    }),
    execute: async ({ toolsetId }) => {
      const removed = manager.deactivate(toolsetId);
      if (!removed) {
        return {
          toolsetId,
          status: 'not_active',
          icon: getToolset(toolsetId)?.icon ?? null,
          message: `Toolset "${toolsetId}" was not active.`,
        };
      }

      return {
        toolsetId,
        status: 'deactivated',
        icon: getToolset(toolsetId)?.icon ?? null,
        message: `Toolset "${toolsetId}" deactivated. Its tools are no longer available.`,
      };
    },
  });

  return { list_toolsets, activate_toolset, deactivate_toolset };
}
