import { describe, expect, test } from 'bun:test';

import { getDb } from '@/db/client.js';
import { sessions } from '@/db/schema.js';
import { setupTestDb } from '@/db/test-helpers.js';
import {
  buildNextSessionToolsetState,
  getCurrentSessionToolsetState,
  getSessionToolsetState,
  getToolsetExpiresAtTurn,
  setSessionToolsetState,
} from '@/llm/stream/session-toolsets.js';

setupTestDb();

describe('session toolset state persistence', () => {
  test('stores and clones structured active and expired state', () => {
    const sessionId = 'ses_toolset_state' as never;
    getDb().insert(sessions).values({ id: sessionId, title: 'Toolset state test' }).run();

    setSessionToolsetState(sessionId, {
      turnCounter: 2,
      active: [{ id: 'browser', scope: 'until_deactivated' }],
      expired: [{ id: 'agenda', expiredAtTurn: 2, toolNames: ['agenda_list'] }],
    });

    const state = getSessionToolsetState(sessionId);
    state.active.push({ id: 'mutated', scope: 'until_deactivated' });
    state.expired[0]?.toolNames.push('mutated_tool');

    expect(getSessionToolsetState(sessionId)).toEqual({
      turnCounter: 2,
      active: [{ id: 'browser', scope: 'until_deactivated' }],
      expired: [{ id: 'agenda', expiredAtTurn: 2, toolNames: ['agenda_list'] }],
    });
  });

  test('partitions expired ttl toolsets in one place', () => {
    expect(
      getCurrentSessionToolsetState(
        {
          turnCounter: 3,
          active: [
            { id: 'expired', scope: 'ttl_turns', expiresAtTurn: 2 },
            { id: 'active', scope: 'ttl_turns', expiresAtTurn: 3 },
            { id: 'persisted', scope: 'until_deactivated' },
          ],
          expired: [{ id: 'run-only', expiredAtTurn: 3, toolNames: ['run_tool'] }],
        },
        (id) => [`${id}_tool`],
      ),
    ).toEqual({
      turnCounter: 3,
      active: [
        { id: 'active', scope: 'ttl_turns', expiresAtTurn: 3 },
        { id: 'persisted', scope: 'until_deactivated' },
      ],
      expired: [
        { id: 'run-only', expiredAtTurn: 3, toolNames: ['run_tool'] },
        { id: 'expired', expiredAtTurn: 3, toolNames: ['expired_tool'] },
      ],
    });
  });

  test('builds the next turn state and expires ttl entries atomically', () => {
    const currentState = { turnCounter: 2, active: [], expired: [] };

    expect(
      buildNextSessionToolsetState({
        currentState,
        active: [
          { id: 'expired', scope: 'ttl_turns', expiresAtTurn: 2 },
          { id: 'active', scope: 'ttl_turns', expiresAtTurn: 3 },
        ],
        expiredRunToolsets: [{ id: 'run-only', toolNames: ['run_tool'] }],
        getToolNames: (id) => [`${id}_tool`],
      }),
    ).toEqual({
      turnCounter: 3,
      active: [{ id: 'active', scope: 'ttl_turns', expiresAtTurn: 3 }],
      expired: [
        { id: 'run-only', expiredAtTurn: 3, toolNames: ['run_tool'] },
        { id: 'expired', expiredAtTurn: 3, toolNames: ['expired_tool'] },
      ],
    });
  });

  test('computes ttl expiry turns consistently', () => {
    expect(getToolsetExpiresAtTurn(4, 3)).toBe(6);
  });
});
