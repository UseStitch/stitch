import * as Log from '@/lib/log.js';
import type { SessionActiveToolset, SessionToolsetScope } from '@/llm/stream/session-toolsets.js';
import { getDisabledToolIdentifiers, isToolEnabled } from '@/tools/enabled-service.js';
import { ToolPipeline } from '@/tools/runtime/pipeline.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';
import { getToolset, listToolsets } from '@/tools/toolsets/registry.js';
import { toToolsetView, type ToolsetView } from '@/tools/toolsets/view.js';
import type { Tool } from 'ai';

const log = Log.create({ service: 'toolset-manager' });

type ToolsetActivationEntry = {
  state: SessionActiveToolset;
  tools?: Record<string, Tool>;
};

/**
 * Per-session manager that tracks which toolsets are currently active.
 * Tools from active toolsets are merged with core tools each step.
 * This is mutable — toolsets can be activated/deactivated between LLM steps.
 */
export class ToolsetManager {
  private readonly activations = new Map<string, ToolsetActivationEntry>();

  private readonly context: ToolContext;

  constructor(context: ToolContext, activationState: Iterable<string | SessionActiveToolset> = []) {
    this.context = context;
    for (const entry of activationState) {
      const state =
        typeof entry === 'string' ? { id: entry, scope: 'until_deactivated' as const } : entry;
      this.activations.set(state.id, { state });
    }
  }

  /**
   * Activate a toolset by ID.
   * Returns a discriminated result: activated with tool names, not_found, or disabled.
   */
  async activate(
    toolsetId: string,
    state?: { scope: SessionToolsetScope; expiresAtTurn?: number },
  ): Promise<
    | { status: 'activated'; toolNames: string[]; collisions: string[] }
    | { status: 'not_found' }
    | { status: 'disabled' }
  > {
    const existing = this.activations.get(toolsetId);
    if (existing?.tools) {
      return {
        status: 'activated',
        toolNames: Object.keys(existing.tools),
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

    const pipeline = ToolPipeline.create(this.context);
    const toolsetTools = await toolset.activate(this.context);
    const toolSource = toolset.kind === 'mcp' ? 'mcp' : 'toolset';
    const allTools = pipeline.registerAll(
      Object.entries(toolsetTools).map(([name, tool]) => ({
        name,
        displayName: name,
        tool,
        source: toolSource,
      })),
    );
    const disabledMcpTools =
      toolset.kind === 'mcp' ? await getDisabledToolIdentifiers('mcp_tool') : new Set<string>();
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

    this.activations.set(toolsetId, {
      state: this.buildActivationState(
        toolsetId,
        state ?? existing?.state ?? { scope: 'current_run' },
      ),
      tools,
    });

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
    if (!this.activations.get(toolsetId)?.tools) {
      return false;
    }

    this.activations.delete(toolsetId);

    log.info({ event: 'toolset.deactivated', toolsetId }, 'toolset deactivated');
    return true;
  }

  /** Check if a toolset is currently active. */
  isActive(toolsetId: string): boolean {
    return !!this.activations.get(toolsetId)?.tools;
  }

  /** Return the set of currently active toolset IDs. */
  getActiveIds(): Set<string> {
    return new Set(this.getActiveEntries().map(([id]) => id));
  }

  /** Return the set of toolset IDs that should persist across future turns. */
  getPersistedIds(): Set<string> {
    return new Set(
      [...this.activations.values()]
        .filter((entry) => entry.state.scope === 'until_deactivated')
        .map((entry) => entry.state.id),
    );
  }

  getPersistableActivationState(): SessionActiveToolset[] {
    return this.getActiveEntries()
      .map(([, entry]) => entry.state)
      .filter((state) => state.scope !== 'current_run')
      .map((state) => ({ ...state }));
  }

  getExpiredRunToolsets(): Array<{ id: string; toolNames: string[] }> {
    return this.getActiveEntries()
      .filter(([, entry]) => entry.state.scope === 'current_run')
      .map(([id, entry]) => ({ id, toolNames: Object.keys(entry.tools) }));
  }

  renewTtlForTool(toolName: string, expiresAtTurn: number): string | null {
    for (const [toolsetId, entry] of this.getActiveEntries()) {
      if (!(toolName in entry.tools)) continue;

      if (entry.state.scope !== 'ttl_turns') return null;

      this.activations.set(toolsetId, {
        ...entry,
        state: { ...entry.state, expiresAtTurn },
      });
      return toolsetId;
    }

    return null;
  }

  pin(toolsetId: string): boolean {
    if (!this.isActive(toolsetId)) {
      return false;
    }

    this.setActivationState(toolsetId, { scope: 'until_deactivated' });
    return true;
  }

  unpin(toolsetId: string): boolean {
    if (!this.isPersisted(toolsetId)) {
      return false;
    }

    this.setActivationState(toolsetId, { scope: 'current_run' });
    return true;
  }

  isPersisted(toolsetId: string): boolean {
    return this.activations.get(toolsetId)?.state.scope === 'until_deactivated';
  }

  setActivationState(
    toolsetId: string,
    state: { scope: SessionToolsetScope; expiresAtTurn?: number },
  ): void {
    const existing = this.activations.get(toolsetId);
    this.activations.set(toolsetId, {
      state: this.buildActivationState(toolsetId, state),
      tools: existing?.tools,
    });
  }

  /**
   * Merge all active toolset tools into a single flat record.
   * Called each step to get the current dynamic tool map.
   */
  getActiveTools(): Record<string, Tool> {
    const merged: Record<string, Tool> = {};
    for (const [, entry] of this.getActiveEntries()) {
      Object.assign(merged, entry.tools);
    }
    return Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
  }

  /**
   * Build a brief catalog of all available (registered) toolsets with their activation state.
   * Disabled toolsets are excluded so the LLM never sees or attempts to use them.
   * Used by the list_toolsets meta-tool.
   */
  async getCatalogWithState(options?: { includeTools?: boolean }): Promise<ToolsetView[]> {
    const disabledIds = await getDisabledToolIdentifiers('toolset');
    return listToolsets()
      .filter((ts) => !disabledIds.has(ts.id))
      .map((ts) =>
        toToolsetView(ts, {
          active: this.isActive(ts.id),
          persisted: this.isPersisted(ts.id),
          includeTools: options?.includeTools,
        }),
      );
  }

  private buildActivationState(
    toolsetId: string,
    state: { scope: SessionToolsetScope; expiresAtTurn?: number },
  ): SessionActiveToolset {
    return { id: toolsetId, ...state };
  }

  private getActiveEntries(): Array<
    [string, ToolsetActivationEntry & { tools: Record<string, Tool> }]
  > {
    return [...this.activations.entries()].filter(
      (entry): entry is [string, ToolsetActivationEntry & { tools: Record<string, Tool> }] =>
        !!entry[1].tools,
    );
  }
}
