import { describe, expect, test } from 'bun:test';

import { QueryClient } from '@tanstack/react-query';

import type { Session } from '@stitch/shared/chat/messages';
import type { PrefixedString } from '@stitch/shared/id';

import { findSessionInListCache, sessionKeys } from './chat.js';

function createSession(id: string): Session {
  return {
    id: id as PrefixedString<'ses'>,
    title: 'Test session',
    type: 'chat',
    automationId: null,
    parentSessionId: null,
    isUnread: false,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('findSessionInListCache', () => {
  test('finds sessions in infinite list cache data', () => {
    const queryClient = new QueryClient();
    const session = createSession('ses_found');

    queryClient.setQueryData(sessionKeys.infiniteList(''), {
      pages: [{ sessions: [session], hasMore: false }],
      pageParams: [undefined],
    });

    expect(findSessionInListCache(queryClient, session.id)).toEqual(session);
  });

  test('does not scan the broad list cache key', () => {
    const queryClient = new QueryClient();
    const session = createSession('ses_split');

    queryClient.setQueryData(sessionKeys.list(), [session]);

    expect(findSessionInListCache(queryClient, session.id)).toBeUndefined();
  });
});
