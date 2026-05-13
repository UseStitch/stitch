import { tool } from 'ai';
import { z } from 'zod';

import type { PrefixedString } from '@stitch/shared/id';

import { setSessionActiveToolsetIds } from '@/llm/stream/session-toolsets.js';
import { isToolEnabled } from '@/tools/enabled-service.js';
import type { ToolsetManager } from '@/tools/toolsets/manager.js';
import { getToolset } from '@/tools/toolsets/registry.js';

/**
 * Create the three toolset management meta-tools bound to a specific ToolsetManager instance.
 * These are always-active tools that let the LLM discover, activate, and deactivate toolsets.
 */
export function createToolsetTools(manager: ToolsetManager, sessionId: PrefixedString<'ses'>) {
  const humanizeToolName = (name: string) =>
    name
      .split(/[_-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

  const list_toolsets = tool({
    description: `List toolsets and inspect toolset contents. Call with no arguments for the full catalog, pass a query string to filter by keyword (e.g. "database"), or pass a toolsetId to inspect a specific toolset's tools and prompts in detail.`,
    inputSchema: z.object({
      toolsetId: z
        .string()
        .optional()
        .describe('Optional toolset ID to inspect in detail (e.g. "browser")'),
      query: z
        .string()
        .optional()
        .describe('Keyword to filter the catalog (e.g. "database", "browser", "email")'),
    }),
    execute: async ({ toolsetId, query }) => {
      if (!toolsetId) {
        const fullCatalog = await manager.getCatalogWithState();

        if (!query) {
          return { toolsets: fullCatalog };
        }

        const q = query.toLowerCase();
        const filtered = fullCatalog.filter(
          (ts) =>
            ts.name.toLowerCase().includes(q) ||
            ts.description.toLowerCase().includes(q) ||
            ts.id.toLowerCase().includes(q),
        );

        return { toolsets: filtered, totalAvailable: fullCatalog.length };
      }

      const toolset = getToolset(toolsetId);
      if (!toolset) {
        throw new Error(
          `Unknown toolset: "${toolsetId}". Use list_toolsets with no arguments to see available IDs.`,
        );
      }

      const enabled = await isToolEnabled({ scope: 'toolset', identifier: toolsetId });
      if (!enabled) {
        throw new Error(
          `Toolset "${toolsetId}" is not in the catalog. Use list_toolsets with no arguments to see available IDs.`,
        );
      }

      const tools = toolset.tools();
      return {
        toolsetId: toolset.id,
        name: toolset.name,
        description: toolset.description,
        icon: toolset.icon ?? null,
        active: manager.isActive(toolsetId),
        persisted: manager.isPersisted(toolsetId),
        hasInstructions: !!toolset.instructions,
        promptCount: toolset.prompts?.length ?? 0,
        prompts:
          toolset.prompts?.map((p) => ({
            name: p.name,
            description: p.description,
            arguments: p.arguments,
          })) ?? [],
        tools: tools.map((t) => ({
          name: t.name,
          displayName: humanizeToolName(t.name),
          description: t.description,
        })),
      };
    },
  });

  const activate_toolset = tool({
    description: `Activate a toolset to make its tools callable. Activation applies to the current run by default. Set persist=true only when the toolset should stay active for future turns in this session. By default this returns a compact response; set verbose=true only when you need full toolset instructions and prompt metadata.`,
    inputSchema: z.object({
      toolsetId: z.string().describe('The toolset ID to activate (e.g. "browser")'),
      persist: z
        .boolean()
        .optional()
        .describe('Keep this toolset active for future turns in the same session.'),
      verbose: z
        .boolean()
        .optional()
        .describe('Include full toolset instructions and prompt metadata in the response.'),
    }),
    execute: async ({ toolsetId, persist, verbose }) => {
      if (manager.isActive(toolsetId)) {
        const wasPersisted = manager.isPersisted(toolsetId);
        if (persist === true) {
          manager.pin(toolsetId);
          setSessionActiveToolsetIds(sessionId, manager.getPersistedIds());
        }

        return {
          toolsetId,
          status: 'already_active',
          icon: getToolset(toolsetId)?.icon ?? null,
          persisted: manager.isPersisted(toolsetId),
          message:
            persist === true && !wasPersisted
              ? `Toolset "${toolsetId}" is already active and will now persist for future turns.`
              : `Toolset "${toolsetId}" is already active.`,
        };
      }

      const result = await manager.activate(toolsetId);
      if (result.status === 'not_found') {
        throw new Error(
          `Unknown toolset: "${toolsetId}". Use list_toolsets with no arguments to see available IDs.`,
        );
      }
      if (result.status === 'disabled') {
        throw new Error(
          `Toolset "${toolsetId}" has been disabled by the user. Do not attempt to activate it or search for alternatives.`,
        );
      }

      if (persist === true) {
        manager.pin(toolsetId);
        setSessionActiveToolsetIds(sessionId, manager.getPersistedIds());
      }

      const { toolNames, collisions } = result;
      const toolset = getToolset(toolsetId);
      const shouldIncludeVerbose = verbose === true;
      const persisted = manager.isPersisted(toolsetId);

      return {
        toolsetId,
        status: 'activated',
        persisted,
        tools: toolNames,
        toolDisplayNames: toolNames.map(humanizeToolName),
        icon: toolset?.icon ?? null,
        message: persisted
          ? `Toolset "${toolsetId}" activated and will persist for future turns. ${toolNames.length} tool(s) now available: ${toolNames.map(humanizeToolName).join(', ')}. Call deactivate_toolset("${toolsetId}") when you no longer need it to keep context clean.`
          : `Toolset "${toolsetId}" activated for this run only. ${toolNames.length} tool(s) now available: ${toolNames.map(humanizeToolName).join(', ')}. Call deactivate_toolset("${toolsetId}") when you no longer need it to keep context clean. Set persist=true on activation only when you expect to need it again in future turns.`,
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
        ...(collisions.length > 0 && {
          warning: `Tool name collision: ${collisions.join(', ')} already exist in another active toolset. The new definitions have overwritten the previous ones.`,
          collisions,
        }),
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

      setSessionActiveToolsetIds(sessionId, manager.getPersistedIds());

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
