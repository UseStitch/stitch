import { eq } from 'drizzle-orm';

import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { sessions } from '@/db/schema/sessions.js';

export type SessionToolsetScope = 'current_run' | 'ttl_turns' | 'until_deactivated';

export type SessionActiveToolset = { id: string; scope: SessionToolsetScope; expiresAtTurn?: number };

export type SessionExpiredToolset = { id: string; expiredAtTurn: number; toolNames: string[] };

export type SessionToolsetState = {
  turnCounter: number;
  active: SessionActiveToolset[];
  expired: SessionExpiredToolset[];
};

const EMPTY_SESSION_TOOLSET_STATE: SessionToolsetState = { turnCounter: 0, active: [], expired: [] };

type ExpiredToolsetInput = { id: string; toolNames: string[] };

function cloneState(state: SessionToolsetState): SessionToolsetState {
  return {
    turnCounter: state.turnCounter,
    active: state.active.map((entry) => ({ ...entry })),
    expired: state.expired.map((entry) => ({ ...entry, toolNames: [...entry.toolNames] })),
  };
}

export function getToolsetExpiresAtTurn(currentTurn: number, ttlTurns: number): number {
  return currentTurn + ttlTurns - 1;
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

export function getCurrentSessionToolsetState(
  state: SessionToolsetState,
  getToolNames: (toolsetId: string) => string[],
): SessionToolsetState {
  const partitioned = partitionActiveToolsets(state.active, state.turnCounter);
  return {
    turnCounter: state.turnCounter,
    active: partitioned.active,
    expired: [
      ...state.expired,
      ...partitioned.expired.map((entry) => ({
        id: entry.id,
        expiredAtTurn: state.turnCounter,
        toolNames: getToolNames(entry.id),
      })),
    ],
  };
}

export function buildNextSessionToolsetState(input: {
  currentState: SessionToolsetState;
  active: SessionActiveToolset[];
  expiredRunToolsets: ExpiredToolsetInput[];
  getToolNames: (toolsetId: string) => string[];
}): SessionToolsetState {
  const nextTurnCounter = input.currentState.turnCounter + 1;
  return getCurrentSessionToolsetState(
    {
      turnCounter: nextTurnCounter,
      active: input.active,
      expired: input.expiredRunToolsets.map((entry) => ({ ...entry, expiredAtTurn: nextTurnCounter })),
    },
    input.getToolNames,
  );
}

export function getSessionToolsetState(sessionId: PrefixedString<'ses'>): SessionToolsetState {
  const row = getDb()
    .select({ toolsetState: sessions.toolsetState })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();

  return cloneState(row?.toolsetState ?? EMPTY_SESSION_TOOLSET_STATE);
}

export function setSessionToolsetState(sessionId: PrefixedString<'ses'>, state: SessionToolsetState): void {
  getDb()
    .update(sessions)
    .set({ toolsetState: cloneState(state), updatedAt: Date.now() })
    .where(eq(sessions.id, sessionId))
    .run();
}
