import type { ConnectorIconSource } from '@stitch/shared/connectors/types';

import * as Log from '@/lib/log.js';
import { getDisabledToolIdentifiers, isToolEnabled } from '@/tools/enabled-service.js';
import { resultNormalizationMiddleware } from '@/tools/runtime/middleware.js';
import { createToolRuntime, defineRuntimeTool } from '@/tools/runtime/runtime.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';
import { getToolset, listToolsets } from '@/tools/toolsets/registry.js';
import type { Tool } from 'ai';

const log = Log.create({ service: 'toolset-manager' });

/**
 * Per-session manager that tracks which toolsets are currently active.
 * Tools from active toolsets are merged with core tools each step.
 * This is mutable — toolsets can be activated/deactivated between LLM steps.
 */
export class ToolsetManager {
  /** Set of currently active toolset IDs */
  private readonly activeIds = new Set<string>();

  /** Subset of active toolsets that should persist across future turns. */
  private readonly persistedIds = new Set<string>();

  /** Cached tool instances for each active toolset (lazy-populated on activate) */
  private readonly activeToolCache = new Map<string, Record<string, Tool>>();

  private readonly context: ToolContext;

  constructor(context: ToolContext, persistedToolsetIds: Iterable<string> = []) {
    this.context = context;
    for (const id of persistedToolsetIds) {
      this.persistedIds.add(id);
    }
  }

  /**
   * Activate a toolset by ID.
   * Returns a discriminated result: activated with tool names, not_found, or disabled.
   */
  async activate(
    toolsetId: string,
  ): Promise<
    | { status: 'activated'; toolNames: string[]; collisions: string[] }
    | { status: 'not_found' }
    | { status: 'disabled' }
  > {
    if (this.activeIds.has(toolsetId)) {
      return {
        status: 'activated',
        toolNames: Object.keys(this.activeToolCache.get(toolsetId) ?? {}),
        collisions: [],
      };
    }

    const toolset = getToolset(toolsetId);
    if (!toolset) {
      log.warn(
        { event: 'toolset.activate.not_found', toolsetId },
        'attempted to activate unknown toolset',
      );
      return { status: 'not_found' };
    }

    const toolsetEnabled = await isToolEnabled({ scope: 'toolset', identifier: toolsetId });
    if (!toolsetEnabled) {
      log.info(
        { event: 'toolset.activate.disabled', toolsetId },
        'attempted to activate disabled toolset',
      );
      return { status: 'disabled' };
    }

    const runtime = createToolRuntime(this.context).use(resultNormalizationMiddleware());
    const toolsetTools = await toolset.activate(this.context);
    const allTools = runtime.toAiToolRecord(
      Object.entries(toolsetTools).map(([name, tool]) =>
        defineRuntimeTool(name, tool, { source: toolsetId.startsWith('mcp:') ? 'mcp' : 'toolset' }),
      ),
    );
    const disabledMcpTools = toolsetId.startsWith('mcp:')
      ? await getDisabledToolIdentifiers('mcp_tool')
      : new Set<string>();
    const tools =
      disabledMcpTools.size === 0
        ? allTools
        : Object.fromEntries(
            Object.entries(allTools).filter(([toolName]) => !disabledMcpTools.has(toolName)),
          );
    const currentToolNames = new Set(Object.keys(this.getActiveTools()));
    const collisions = Object.keys(tools).filter((name) => currentToolNames.has(name));

    if (collisions.length > 0) {
      log.warn(
        { event: 'toolset.activate.collision', toolsetId, collisions },
        'tool name collision detected on activation',
      );
    }

    this.activeIds.add(toolsetId);
    this.activeToolCache.set(toolsetId, tools);

    log.info(
      {
        event: 'toolset.activated',
        toolsetId,
        toolCount: Object.keys(tools).length,
        toolNames: Object.keys(tools),
      },
      'toolset activated',
    );

    return { status: 'activated', toolNames: Object.keys(tools), collisions };
  }

  /** Deactivate a toolset, removing its tools from the active set. */
  deactivate(toolsetId: string): boolean {
    if (!this.activeIds.has(toolsetId)) {
      return false;
    }

    this.activeIds.delete(toolsetId);
    this.persistedIds.delete(toolsetId);
    this.activeToolCache.delete(toolsetId);

    log.info({ event: 'toolset.deactivated', toolsetId }, 'toolset deactivated');
    return true;
  }

  /** Check if a toolset is currently active. */
  isActive(toolsetId: string): boolean {
    return this.activeIds.has(toolsetId);
  }

  /** Return the set of currently active toolset IDs. */
  getActiveIds(): Set<string> {
    return new Set(this.activeIds);
  }

  /** Return the set of active toolset IDs that should persist across future turns. */
  getPersistedIds(): Set<string> {
    return new Set(this.persistedIds);
  }

  getActivationState(): Array<{ id: string; scope: 'until_deactivated' }> {
    return [...this.persistedIds]
      .filter((id) => this.activeIds.has(id))
      .map((id) => ({ id, scope: 'until_deactivated' }));
  }

  getExpiredRunToolsets(): Array<{ id: string; toolNames: string[] }> {
    return [...this.activeIds]
      .filter((id) => !this.persistedIds.has(id))
      .map((id) => ({ id, toolNames: Object.keys(this.activeToolCache.get(id) ?? {}) }));
  }

  pin(toolsetId: string): boolean {
    if (!this.activeIds.has(toolsetId)) {
      return false;
    }

    this.persistedIds.add(toolsetId);
    return true;
  }

  unpin(toolsetId: string): boolean {
    return this.persistedIds.delete(toolsetId);
  }

  isPersisted(toolsetId: string): boolean {
    return this.persistedIds.has(toolsetId);
  }

  /**
   * Merge all active toolset tools into a single flat record.
   * Called each step to get the current dynamic tool map.
   */
  getActiveTools(): Record<string, Tool> {
    const merged: Record<string, Tool> = {};
    for (const tools of this.activeToolCache.values()) {
      Object.assign(merged, tools);
    }
    return Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
  }

  /**
   * Build a brief catalog of all available (registered) toolsets with their activation state.
   * Disabled toolsets are excluded so the LLM never sees or attempts to use them.
   * Used by the list_toolsets meta-tool.
   */
  async getCatalogWithState(): Promise<
    Array<{
      id: string;
      name: string;
      description: string;
      icon?: ConnectorIconSource;
      active: boolean;
      persisted: boolean;
      hasInstructions: boolean;
      promptCount: number;
    }>
  > {
    const disabledIds = await getDisabledToolIdentifiers('toolset');
    return listToolsets()
      .filter((ts) => !disabledIds.has(ts.id))
      .map((ts) => ({
        id: ts.id,
        name: ts.name,
        description: ts.description,
        icon: ts.icon,
        active: this.activeIds.has(ts.id),
        persisted: this.persistedIds.has(ts.id),
        hasInstructions: !!ts.instructions,
        promptCount: ts.prompts?.length ?? 0,
      }));
  }
}
