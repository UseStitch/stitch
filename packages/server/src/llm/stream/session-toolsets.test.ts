import { describe, expect, test } from 'bun:test';

import { getDb } from '@/db/client.js';
import { sessions } from '@/db/schema.js';
import { setupTestDb } from '@/db/test-helpers.js';
import { getSessionToolsetState, setSessionToolsetState } from '@/llm/stream/session-toolsets.js';

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
});
