import type { PrefixedString } from '@stitch/shared/id';

import { ToolsetManager } from '@/tools/toolsets/manager.js';
import type { SessionActiveToolset, SessionToolsetState } from '@/tools/toolsets/types.js';

export { type SessionActiveToolset, type SessionToolsetState } from '@/tools/toolsets/types.js';

type ExpiredToolsetInput = { id: string; toolNames: string[] };

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

export function getToolsetExpiresAtTurn(currentTurn: number, ttlTurns: number): number {
  return ToolsetManager.getToolsetExpiresAtTurn(currentTurn, ttlTurns);
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
  return ToolsetManager.getSessionState(sessionId);
}

export function setSessionToolsetState(sessionId: PrefixedString<'ses'>, state: SessionToolsetState): void {
  ToolsetManager.setSessionState(sessionId, state);
}
