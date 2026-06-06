import { eq } from 'drizzle-orm';

import type { PrefixedString } from '@stitch/shared/id';

import { getDb, isDbInitialized } from '@/db/client.js';
import { sessions } from '@/db/schema.js';

export type SessionToolsetScope = 'current_run' | 'ttl_turns' | 'until_deactivated';

export type SessionActiveToolset = {
  id: string;
  scope: SessionToolsetScope;
};

export type SessionExpiredToolset = {
  id: string;
  expiredAtTurn: number;
  toolNames: string[];
};

export type SessionToolsetState = {
  turnCounter: number;
  active: SessionActiveToolset[];
  expired: SessionExpiredToolset[];
};

const EMPTY_SESSION_TOOLSET_STATE: SessionToolsetState = {
  turnCounter: 0,
  active: [],
  expired: [],
};

// Fallback used only when DB is not initialized (e.g. unit tests).
const inMemoryFallback = new Map<string, SessionToolsetState>();

function cloneState(state: SessionToolsetState): SessionToolsetState {
  return {
    turnCounter: state.turnCounter,
    active: state.active.map((entry) => ({ ...entry })),
    expired: state.expired.map((entry) => ({ ...entry, toolNames: [...entry.toolNames] })),
  };
}

function normalizeState(
  state: SessionToolsetState | null | undefined,
  legacyActiveIds: string[] = [],
): SessionToolsetState {
  if (state) {
    return {
      turnCounter: Number.isFinite(state.turnCounter) ? state.turnCounter : 0,
      active: Array.isArray(state.active)
        ? state.active.map((entry) => ({ id: entry.id, scope: entry.scope }))
        : [],
      expired: Array.isArray(state.expired)
        ? state.expired.map((entry) => ({
            id: entry.id,
            expiredAtTurn: Number.isFinite(entry.expiredAtTurn) ? entry.expiredAtTurn : 0,
            toolNames: Array.isArray(entry.toolNames) ? entry.toolNames : [],
          }))
        : [],
    };
  }

  return {
    ...EMPTY_SESSION_TOOLSET_STATE,
    active: legacyActiveIds.map((id) => ({ id, scope: 'until_deactivated' })),
  };
}

export function getSessionToolsetState(sessionId: PrefixedString<'ses'>): SessionToolsetState {
  if (!isDbInitialized()) {
    return cloneState(inMemoryFallback.get(sessionId) ?? EMPTY_SESSION_TOOLSET_STATE);
  }
  const row = getDb()
    .select({ activeToolsetIds: sessions.activeToolsetIds, toolsetState: sessions.toolsetState })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();

  return normalizeState(row?.toolsetState, row?.activeToolsetIds ?? []);
}

export function setSessionToolsetState(
  sessionId: PrefixedString<'ses'>,
  state: SessionToolsetState,
): void {
  const nextState = normalizeState(state);
  const activeIds = nextState.active.map((entry) => entry.id);
  if (!isDbInitialized()) {
    if (
      nextState.active.length === 0 &&
      nextState.expired.length === 0 &&
      nextState.turnCounter === 0
    ) {
      inMemoryFallback.delete(sessionId);
    } else {
      inMemoryFallback.set(sessionId, cloneState(nextState));
    }
    return;
  }
  getDb()
    .update(sessions)
    .set({ activeToolsetIds: activeIds, toolsetState: nextState, updatedAt: Date.now() })
    .where(eq(sessions.id, sessionId))
    .run();
}
