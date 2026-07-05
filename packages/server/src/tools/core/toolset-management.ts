import { tool } from 'ai';
import { z } from 'zod';

import type { PrefixedString } from '@stitch/shared/id';
import { humanizeToolName } from '@stitch/shared/tools/display';

import {
  getToolsetExpiresAtTurn,
  getSessionToolsetState,
  setSessionToolsetState,
  type SessionToolsetScope,
} from '@/llm/stream/session-toolsets.js';
import { isToolEnabled } from '@/tools/enabled-service.js';
import type { ToolsetManager } from '@/tools/toolsets/manager.js';
import { getToolset } from '@/tools/toolsets/registry.js';
import { getToolsetSettings } from '@/tools/toolsets/settings.js';
import { toToolsetView } from '@/tools/toolsets/view.js';

/**
 * Create the three toolset management meta-tools bound to a specific ToolsetManager instance.
 * These are always-active tools that let the LLM discover, activate, and deactivate toolsets.
 */
export function createToolsetTools(manager: ToolsetManager, sessionId: PrefixedString<'ses'>) {
  const persistManagerState = () => {
    const current = getSessionToolsetState(sessionId);
    setSessionToolsetState(sessionId, {
      ...current,
      active: manager.getPersistableActivationState(),
      expired: current.expired.filter((entry) => !manager.isActive(entry.id)),
    });
  };

  const resolveActivationState = async (input: { persist?: boolean; scope?: SessionToolsetScope }) => {
    if (input.persist === true) {
      return { scope: 'until_deactivated' as const };
    }

    const settings = await getToolsetSettings();
    const scope = input.scope ?? settings.defaultScope;
    return scope === 'ttl_turns'
      ? {
          scope,
          expiresAtTurn: getToolsetExpiresAtTurn(getSessionToolsetState(sessionId).turnCounter, settings.ttlTurns),
        }
      : { scope };
  };

  const buildActivationMessage = (input: {
    toolsetName: string;
    toolsetId: string;
    toolNames: string[];
    scope: SessionToolsetScope;
    expiresAtTurn?: number;
  }) => {
    const tools = `${input.toolNames.length} tool(s) now available: ${input.toolNames.map(humanizeToolName).join(', ')}.`;
    const deactivate = `Call deactivate_toolset("${input.toolsetId}") when you no longer need it to keep context clean.`;
    if (input.scope === 'until_deactivated') {
      return `Toolset "${input.toolsetName}" activated and will persist until explicitly deactivated. ${tools} ${deactivate}`;
    }
    if (input.scope === 'ttl_turns') {
      return `Toolset "${input.toolsetName}" activated with a multi-turn TTL and will expire after turn ${input.expiresAtTurn}. ${tools} ${deactivate}`;
    }
    return `Toolset "${input.toolsetName}" activated for this run only. ${tools} ${deactivate} Use scope="ttl_turns" or persist=true when you expect to need it again in future turns.`;
  };

  const list_toolsets = tool({
    description: `List toolsets and inspect toolset contents. Prefer a query string when you already know the domain (for example "gmail", "browser", or "calendar"). Call with no arguments only for broad discovery. Pass a toolsetId only when you need to inspect prompts or instructions before activation — activate_toolset already returns the full tool list, so do not call list_toolsets with a toolsetId just to preview tools you are about to activate.`,
    inputSchema: z.object({
      toolsetId: z.string().optional().describe('Optional toolset ID to inspect in detail (e.g. "browser")'),
      query: z.string().optional().describe('Keyword to filter the catalog (e.g. "database", "browser", "email")'),
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

      if (manager.isExcluded(toolsetId)) {
        throw new Error(
          `Toolset "${toolsetId}" is not in the catalog. Use list_toolsets with no arguments to see available IDs.`,
        );
      }

      const toolset = getToolset(toolsetId);
      if (!toolset) {
        throw new Error(`Unknown toolset: "${toolsetId}". Use list_toolsets with no arguments to see available IDs.`);
      }

      const enabled = await isToolEnabled({ scope: 'toolset', identifier: toolsetId });
      if (!enabled) {
        throw new Error(
          `Toolset "${toolsetId}" is not in the catalog. Use list_toolsets with no arguments to see available IDs.`,
        );
      }

      return {
        toolsetId: toolset.id,
        ...toToolsetView(toolset, {
          active: manager.isActive(toolsetId),
          persisted: manager.isPersisted(toolsetId),
          includePrompts: true,
          includeTools: true,
        }),
      };
    },
  });

  const activate_toolset = tool({
    description: `Activate a toolset to make its tools callable. Use the exact toolset ID returned by list_toolsets. Activation applies to the current run by default. Set persist=true only when the toolset should stay active for future turns in this session. By default this returns a compact response; set verbose=true only when you need full toolset instructions and prompt metadata.`,
    inputSchema: z.object({
      toolsetId: z.string().describe('The toolset ID to activate (e.g. "browser")'),
      persist: z.boolean().optional().describe('Keep this toolset active for future turns in the same session.'),
      scope: z
        .enum(['current_run', 'ttl_turns', 'until_deactivated'])
        .optional()
        .describe('Activation lifetime. persist=true is equivalent to scope="until_deactivated".'),
      verbose: z
        .boolean()
        .optional()
        .describe('Include full toolset instructions and prompt metadata in the response.'),
    }),
    execute: async ({ toolsetId, persist, scope, verbose }) => {
      const activationState = await resolveActivationState({ persist, scope });
      if (manager.isActive(toolsetId)) {
        const wasPersisted = manager.isPersisted(toolsetId);
        const toolsetName = getToolset(toolsetId)?.name ?? toolsetId;
        manager.setActivationState(toolsetId, activationState);
        persistManagerState();

        return {
          toolsetId,
          toolsetName,
          status: 'already_active',
          icon: getToolset(toolsetId)?.icon ?? null,
          persisted: manager.isPersisted(toolsetId),
          message:
            manager.isPersisted(toolsetId) && !wasPersisted
              ? `Toolset "${toolsetName}" is already active and will now persist for future turns.`
              : `Toolset "${toolsetName}" is already active.`,
        };
      }

      const result = await manager.activate(toolsetId, activationState);
      if (result.status === 'not_found') {
        throw new Error(`Unknown toolset: "${toolsetId}". Use list_toolsets with no arguments to see available IDs.`);
      }
      if (result.status === 'disabled') {
        throw new Error(
          `Toolset "${toolsetId}" has been disabled by the user. Do not attempt to activate it or search for alternatives.`,
        );
      }

      persistManagerState();

      const { toolNames, collisions } = result;
      const toolset = getToolset(toolsetId);
      const toolsetName = toolset?.name ?? toolsetId;
      const shouldIncludeVerbose = verbose === true;
      const persisted = manager.isPersisted(toolsetId);

      return {
        toolsetId,
        toolsetName,
        status: 'activated',
        persisted,
        tools: toolNames,
        toolDisplayNames: toolNames.map(humanizeToolName),
        icon: toolset?.icon ?? null,
        message: buildActivationMessage({
          toolsetName,
          toolsetId,
          toolNames,
          scope: activationState.scope,
          expiresAtTurn: activationState.expiresAtTurn,
        }),
        hasInstructions: !!toolset?.instructions,
        promptCount: toolset?.prompts?.length ?? 0,
        instructions: shouldIncludeVerbose ? (toolset?.instructions ?? null) : null,
        prompts: shouldIncludeVerbose
          ? (toolset?.prompts?.map((p) => ({ name: p.name, description: p.description, arguments: p.arguments })) ??
            null)
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
    inputSchema: z.object({ toolsetId: z.string().describe('The toolset ID to deactivate') }),
    execute: async ({ toolsetId }) => {
      const toolset = getToolset(toolsetId);
      const toolsetName = toolset?.name ?? toolsetId;
      const removed = manager.deactivate(toolsetId);
      if (!removed) {
        return {
          toolsetId,
          toolsetName,
          status: 'not_active',
          icon: toolset?.icon ?? null,
          message: `Toolset "${toolsetName}" was not active.`,
        };
      }

      persistManagerState();

      return {
        toolsetId,
        toolsetName,
        status: 'deactivated',
        icon: toolset?.icon ?? null,
        message: `Toolset "${toolsetName}" deactivated. Its tools are no longer available.`,
      };
    },
  });

  return { list_toolsets, activate_toolset, deactivate_toolset };
}
