import { eq } from 'drizzle-orm';

import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { sessions } from '@/db/schema.js';

export type SessionToolsetScope = 'current_run' | 'ttl_turns' | 'until_deactivated';

export type SessionActiveToolset = {
  id: string;
  scope: SessionToolsetScope;
  expiresAtTurn?: number;
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

function cloneState(state: SessionToolsetState): SessionToolsetState {
  return {
    turnCounter: state.turnCounter,
    active: state.active.map((entry) => ({ ...entry })),
    expired: state.expired.map((entry) => ({ ...entry, toolNames: [...entry.toolNames] })),
  };
}

function normalizeState(state: SessionToolsetState | null | undefined): SessionToolsetState {
  if (state) {
    return {
      turnCounter: Number.isFinite(state.turnCounter) ? state.turnCounter : 0,
      active: Array.isArray(state.active)
        ? state.active.map((entry) => ({
            id: entry.id,
            scope: entry.scope,
            expiresAtTurn: Number.isFinite(entry.expiresAtTurn) ? entry.expiresAtTurn : undefined,
          }))
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

  return EMPTY_SESSION_TOOLSET_STATE;
}

export function getSessionToolsetState(sessionId: PrefixedString<'ses'>): SessionToolsetState {
  const row = getDb()
    .select({ toolsetState: sessions.toolsetState })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();

  return normalizeState(row?.toolsetState);
}

export function setSessionToolsetState(
  sessionId: PrefixedString<'ses'>,
  state: SessionToolsetState,
): void {
  const nextState = normalizeState(state);
  getDb()
    .update(sessions)
    .set({ toolsetState: cloneState(nextState), updatedAt: Date.now() })
    .where(eq(sessions.id, sessionId))
    .run();
}
