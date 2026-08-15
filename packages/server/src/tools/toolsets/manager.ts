import { eq } from 'drizzle-orm';

import type { PrefixedString } from '@stitch/shared/id';

import { getDisabledAppToolsetIds, isToolsetEnabledByApp } from '@/apps/service.js';
import { getDb } from '@/db/client.js';
import { sessions } from '@/db/schema/sessions.js';
import * as Log from '@/lib/log.js';
import { getDisabledToolIdentifiers, isToolEnabled } from '@/tools/enabled-service.js';
import { ToolPipeline } from '@/tools/runtime/pipeline.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';
import { getToolset, listToolsets } from '@/tools/toolsets/registry.js';
import { getToolsetSettings } from '@/tools/toolsets/settings.js';
import {
  EMPTY_SESSION_TOOLSET_STATE,
  type SessionActiveToolset,
  type SessionExpiredToolset,
  type SessionToolsetScope,
  type SessionToolsetState,
} from '@/tools/toolsets/types.js';
import { toToolsetView, type ToolsetView } from '@/tools/toolsets/view.js';
import type { Tool } from 'ai';

const log = Log.create({ service: 'toolset-manager' });

type ToolsetActivationEntry = { state: SessionActiveToolset; tools?: Record<string, Tool> };

export type ToolsetManagerOptions = {
  excludedToolsetIds?: Iterable<string>;
  turnCounter?: number;
  expired?: SessionExpiredToolset[];
  autoPersist?: boolean;
};

function cloneState(state: SessionToolsetState): SessionToolsetState {
  return {
    turnCounter: state.turnCounter,
    active: state.active.map((entry) => ({ ...entry })),
    expired: state.expired.map((entry) => ({ ...entry, toolNames: [...entry.toolNames] })),
  };
}

function partitionActiveToolsets(
  active: SessionActiveToolset[],
  currentTurn: number,
): { active: SessionActiveToolset[]; expired: SessionActiveToolset[] } {
  const nextActive: SessionActiveToolset[] = [];
  const expired: SessionActiveToolset[] = [];

  for (const entry of active) {
    if (entry.scope === 'ttl_turns' && (entry.expiresAtTurn ?? -1) < currentTurn) {
      expired.push(entry);
    } else {
      nextActive.push(entry);
    }
  }

  return { active: nextActive, expired };
}

/**
 * Per-session manager that tracks which toolsets are currently active.
 * Tools from active toolsets are merged with core tools each step.
 * Owns toolset activations, turn lifecycles, TTL renewals, and persistence.
 */
export class ToolsetManager {
  private readonly activations = new Map<string, ToolsetActivationEntry>();

  private readonly context: ToolContext;

  private readonly excludedToolsetIds: Set<string>;

  private turnCounter: number;

  private expired: SessionExpiredToolset[];

  private readonly autoPersist: boolean;

  constructor(
    context: ToolContext,
    activationState: Iterable<string | SessionActiveToolset> = [],
    options: ToolsetManagerOptions = {},
  ) {
    this.context = context;
    this.excludedToolsetIds = new Set(options.excludedToolsetIds ?? []);
    this.turnCounter = options.turnCounter ?? 0;
    this.expired = options.expired ? options.expired.map((e) => ({ ...e, toolNames: [...e.toolNames] })) : [];
    this.autoPersist = options.autoPersist ?? true;

    for (const entry of activationState) {
      const state = typeof entry === 'string' ? { id: entry, scope: 'until_deactivated' as const } : entry;
      this.activations.set(state.id, { state });
    }
  }

  static getToolsetExpiresAtTurn(currentTurn: number, ttlTurns: number): number {
    return currentTurn + ttlTurns - 1;
  }

  static getToolNamesForToolset(toolsetId: string): string[] {
    return (
      getToolset(toolsetId)
        ?.tools()
        .map((tool) => tool.name) ?? []
    );
  }

  static getSessionState(sessionId: PrefixedString<'ses'>): SessionToolsetState {
    const row = getDb()
      .select({ toolsetState: sessions.toolsetState })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .get();

    return cloneState(row?.toolsetState ?? EMPTY_SESSION_TOOLSET_STATE);
  }

  static setSessionState(sessionId: PrefixedString<'ses'>, state: SessionToolsetState): void {
    getDb()
      .update(sessions)
      .set({ toolsetState: cloneState(state), updatedAt: Date.now() })
      .where(eq(sessions.id, sessionId))
      .run();
  }

  /**
   * Hydrate and initialize a ToolsetManager instance for a session.
   * Loads persisted session state, partitions expired toolsets, and restores active tools.
   */
  static async forSession(
    context: ToolContext,
    options: { initialActiveToolsetIds?: string[]; excludedToolsetIds?: Iterable<string> } = {},
  ): Promise<ToolsetManager> {
    const sessionState = ToolsetManager.getSessionState(context.sessionId);
    const partitioned = partitionActiveToolsets(sessionState.active, sessionState.turnCounter);

    const activeEntries = options.initialActiveToolsetIds
      ? options.initialActiveToolsetIds.map((id) => ({ id, scope: 'until_deactivated' as const }))
      : partitioned.active;

    const expiredEntries: SessionExpiredToolset[] = options.initialActiveToolsetIds
      ? []
      : [
          ...sessionState.expired,
          ...partitioned.expired.map((entry) => ({
            id: entry.id,
            expiredAtTurn: sessionState.turnCounter,
            toolNames: ToolsetManager.getToolNamesForToolset(entry.id),
          })),
        ];

    const manager = new ToolsetManager(context, activeEntries, {
      excludedToolsetIds: options.excludedToolsetIds,
      turnCounter: sessionState.turnCounter,
      expired: expiredEntries,
      autoPersist: true,
    });

    if (activeEntries.length > 0) {
      await Promise.all(
        activeEntries.map(async (entry) => {
          const result = await manager.activate(entry.id, entry);
          if (result.status === 'not_found' || result.status === 'disabled') {
            log.warn(
              { event: 'toolset.restore.failed', toolsetId: entry.id, reason: result.status },
              'failed to restore previously active toolset — skipping',
            );
          }
        }),
      );
    }

    if (partitioned.expired.length > 0 && !options.initialActiveToolsetIds) {
      manager.persistState();
    }

    return manager;
  }

  getTurnCounter(): number {
    return this.turnCounter;
  }

  getExpiredToolsets(): SessionExpiredToolset[] {
    return this.expired.map((entry) => ({ ...entry, toolNames: [...entry.toolNames] }));
  }

  /**
   * Activate a toolset by ID.
   * Returns a discriminated result: activated with tool names, not_found, or disabled.
   */
  async activate(
    toolsetId: string,
    state?: { scope?: SessionToolsetScope; expiresAtTurn?: number; persist?: boolean },
  ): Promise<
    | { status: 'activated'; toolNames: string[]; collisions: string[] }
    | { status: 'not_found' }
    | { status: 'disabled' }
  > {
    const existing = this.activations.get(toolsetId);
    if (existing?.tools) {
      if (state) {
        this.setActivationState(toolsetId, state);
      }
      return { status: 'activated', toolNames: Object.keys(existing.tools), collisions: [] };
    }

    const toolset = getToolset(toolsetId);
    if (!toolset) {
      log.warn({ event: 'toolset.activate.not_found', toolsetId }, 'attempted to activate unknown toolset');
      return { status: 'not_found' };
    }

    if (this.excludedToolsetIds.has(toolsetId)) {
      log.info({ event: 'toolset.activate.excluded', toolsetId }, 'attempted to activate excluded toolset');
      return { status: 'disabled' };
    }

    const [toolsetEnabled, appEnabled] = await Promise.all([
      isToolEnabled({ scope: 'toolset', identifier: toolsetId }),
      isToolsetEnabledByApp(toolsetId),
    ]);
    if (!toolsetEnabled || !appEnabled) {
      log.info({ event: 'toolset.activate.disabled', toolsetId }, 'attempted to activate disabled toolset');
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
        truncation: toolset.truncation,
      })),
    );
    const disabledMcpTools = toolset.kind === 'mcp' ? await getDisabledToolIdentifiers('mcp_tool') : new Set<string>();
    const tools =
      disabledMcpTools.size === 0
        ? allTools
        : Object.fromEntries(Object.entries(allTools).filter(([toolName]) => !disabledMcpTools.has(toolName)));
    const currentToolNames = new Set(Object.keys(this.getActiveTools()));
    const collisions = Object.keys(tools).filter((name) => currentToolNames.has(name));

    if (collisions.length > 0) {
      log.warn(
        { event: 'toolset.activate.collision', toolsetId, collisions },
        'tool name collision detected on activation',
      );
    }

    const resolvedScope: SessionToolsetScope =
      state?.persist === true ? 'until_deactivated' : (state?.scope ?? existing?.state.scope ?? 'current_run');
    let expiresAtTurn = state?.expiresAtTurn ?? existing?.state.expiresAtTurn;
    if (resolvedScope === 'ttl_turns' && expiresAtTurn === undefined) {
      const settings = await getToolsetSettings();
      expiresAtTurn = ToolsetManager.getToolsetExpiresAtTurn(this.turnCounter, settings.ttlTurns);
    }

    this.activations.set(toolsetId, {
      state: { id: toolsetId, scope: resolvedScope, ...(expiresAtTurn !== undefined && { expiresAtTurn }) },
      tools,
    });

    log.info(
      { event: 'toolset.activated', toolsetId, toolCount: Object.keys(tools).length, toolNames: Object.keys(tools) },
      'toolset activated',
    );

    if (this.autoPersist) {
      this.persistState();
    }

    return { status: 'activated', toolNames: Object.keys(tools), collisions };
  }

  /** Deactivate a toolset, removing its tools from the active set. */
  deactivate(toolsetId: string): boolean {
    if (!this.activations.get(toolsetId)?.tools) {
      return false;
    }

    this.activations.delete(toolsetId);

    log.info({ event: 'toolset.deactivated', toolsetId }, 'toolset deactivated');

    if (this.autoPersist) {
      this.persistState();
    }

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

  renewTtlForTool(toolName: string, ttlTurnsOrExpiresAtTurn: number): string | null {
    if (ttlTurnsOrExpiresAtTurn <= 0) return null;

    const expiresAtTurn =
      ttlTurnsOrExpiresAtTurn >= this.turnCounter
        ? ttlTurnsOrExpiresAtTurn
        : ToolsetManager.getToolsetExpiresAtTurn(this.turnCounter, ttlTurnsOrExpiresAtTurn);

    for (const [toolsetId, entry] of this.getActiveEntries()) {
      if (!(toolName in entry.tools)) continue;

      if (entry.state.scope !== 'ttl_turns') return null;

      this.activations.set(toolsetId, { ...entry, state: { ...entry.state, expiresAtTurn } });

      if (this.autoPersist) {
        this.persistState();
      }

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

  isExcluded(toolsetId: string): boolean {
    return this.excludedToolsetIds.has(toolsetId);
  }

  setActivationState(
    toolsetId: string,
    state: { scope?: SessionToolsetScope; expiresAtTurn?: number; persist?: boolean },
  ): void {
    const existing = this.activations.get(toolsetId);
    const resolvedScope: SessionToolsetScope =
      state.persist === true ? 'until_deactivated' : (state.scope ?? existing?.state.scope ?? 'current_run');
    const expiresAtTurn = state.expiresAtTurn ?? existing?.state.expiresAtTurn;

    this.activations.set(toolsetId, {
      state: { id: toolsetId, scope: resolvedScope, ...(expiresAtTurn !== undefined && { expiresAtTurn }) },
      tools: existing?.tools,
    });

    if (this.autoPersist) {
      this.persistState();
    }
  }

  /**
   * Advance the session turn counter, roll over single-turn and expired TTL toolsets into expired state,
   * and persist the resulting state.
   */
  advanceTurn(options: { persist?: boolean } = {}): SessionToolsetState {
    const nextTurnCounter = this.turnCounter + 1;
    this.turnCounter = nextTurnCounter;

    const nextExpired: SessionExpiredToolset[] = [];

    // Expire current-run toolsets
    for (const [id, entry] of this.activations.entries()) {
      const toolNames = entry.tools ? Object.keys(entry.tools) : ToolsetManager.getToolNamesForToolset(id);

      if (entry.state.scope === 'current_run') {
        nextExpired.push({ id, expiredAtTurn: nextTurnCounter, toolNames });
        this.activations.delete(id);
      } else if (entry.state.scope === 'ttl_turns' && (entry.state.expiresAtTurn ?? -1) < nextTurnCounter) {
        nextExpired.push({ id, expiredAtTurn: nextTurnCounter, toolNames });
        this.activations.delete(id);
      }
    }

    this.expired = [...this.expired, ...nextExpired];

    if (options.persist !== false && this.autoPersist) {
      this.persistState();
    }

    return { turnCounter: this.turnCounter, active: this.getPersistableActivationState(), expired: this.expired };
  }

  /**
   * Synchronize the current persistable toolset state to SQLite.
   */
  persistState(): void {
    try {
      const currentState = ToolsetManager.getSessionState(this.context.sessionId);
      ToolsetManager.setSessionState(this.context.sessionId, {
        turnCounter: this.turnCounter,
        active: this.getPersistableActivationState(),
        expired: [
          ...currentState.expired.filter((entry) => !this.isActive(entry.id)),
          ...this.expired.filter((entry) => !this.isActive(entry.id)),
        ].filter(
          (entry, index, self) =>
            index === self.findIndex((e) => e.id === entry.id && e.expiredAtTurn === entry.expiredAtTurn),
        ),
      });
    } catch (error) {
      log.warn(
        { event: 'toolset.persist.error', sessionId: this.context.sessionId, error },
        'failed to persist toolset state',
      );
    }
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
    return Object.fromEntries(Object.entries(merged).toSorted(([a], [b]) => a.localeCompare(b)));
  }

  /**
   * Build a brief catalog of all available (registered) toolsets with their activation state.
   * Disabled toolsets are excluded so the LLM never sees or attempts to use them.
   * Used by the list_toolsets meta-tool.
   */
  async getCatalogWithState(options?: { includeTools?: boolean }): Promise<ToolsetView[]> {
    const [disabledIds, disabledAppToolsetIds] = await Promise.all([
      getDisabledToolIdentifiers('toolset'),
      getDisabledAppToolsetIds(),
    ]);
    return listToolsets()
      .filter(
        (ts) => !this.excludedToolsetIds.has(ts.id) && !disabledIds.has(ts.id) && !disabledAppToolsetIds.has(ts.id),
      )
      .map((ts) =>
        toToolsetView(ts, {
          active: this.isActive(ts.id),
          persisted: this.isPersisted(ts.id),
          includeTools: options?.includeTools,
        }),
      );
  }

  private getActiveEntries(): Array<[string, ToolsetActivationEntry & { tools: Record<string, Tool> }]> {
    return [...this.activations.entries()].filter(
      (entry): entry is [string, ToolsetActivationEntry & { tools: Record<string, Tool> }] => !!entry[1].tools,
    );
  }
}
