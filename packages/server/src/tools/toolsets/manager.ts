import * as Log from '@/lib/log.js';
import type { ToolContext } from '@/tools/runtime/wrappers.js';
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

  /** Cached tool instances for each active toolset (lazy-populated on activate) */
  private readonly activeToolCache = new Map<string, Record<string, Tool>>();

  private readonly context: ToolContext;

  constructor(context: ToolContext) {
    this.context = context;
  }

  /** Activate a toolset by ID. Returns the newly available tool names, or null if not found. */
  async activate(toolsetId: string): Promise<string[] | null> {
    if (this.activeIds.has(toolsetId)) {
      return Object.keys(this.activeToolCache.get(toolsetId) ?? {});
    }

    const toolset = getToolset(toolsetId);
    if (!toolset) {
      log.warn(
        { event: 'toolset.activate.not_found', toolsetId },
        'attempted to activate unknown toolset',
      );
      return null;
    }

    const tools = await toolset.activate(this.context);
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

    return Object.keys(tools);
  }

  /** Deactivate a toolset, removing its tools from the active set. */
  deactivate(toolsetId: string): boolean {
    if (!this.activeIds.has(toolsetId)) {
      return false;
    }

    this.activeIds.delete(toolsetId);
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
   * Used by the list_toolsets meta-tool.
   */
  getCatalogWithState(): Array<{
    id: string;
    name: string;
    description: string;
    icon?: string;
    active: boolean;
    hasInstructions: boolean;
    promptCount: number;
  }> {
    return listToolsets().map((ts) => ({
      id: ts.id,
      name: ts.name,
      description: ts.description,
      icon: ts.icon,
      active: this.activeIds.has(ts.id),
      hasInstructions: !!ts.instructions,
      promptCount: ts.prompts?.length ?? 0,
    }));
  }
}
