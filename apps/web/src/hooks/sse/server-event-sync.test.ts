import { describe, expect, test } from 'bun:test';

import { QueryClient } from '@tanstack/react-query';

import type { BackgroundTask } from '@stitch/shared/background-tasks/types';
import type { Session, SessionsPage } from '@stitch/shared/chat/messages';

import { syncBackgroundTaskEvent } from './server-event-sync.js';

import { backgroundTaskKeys } from '@/lib/queries/background-tasks';
import { sessionKeys } from '@/lib/queries/chat';

function completedTask(): BackgroundTask {
  return {
    id: 'ses_child',
    parentSessionId: 'ses_parent',
    childSessionId: 'ses_child',
    originMessageId: 'msg_origin',
    originToolCallId: 'call-task',
    title: 'Task',
    status: 'completed',
    deliveryStatus: 'pending',
    result: 'done',
    error: null,
    providerId: 'provider',
    modelId: 'model',
    activeToolsetIds: [],
    startedAt: 1,
    completedAt: 2,
    deliveredAt: null,
  };
}

describe('background task SSE synchronization', () => {
  test('marks an inactive parent unread and only sounds for the first terminal event', () => {
    const queryClient = new QueryClient();
    const parent: Session = {
      id: 'ses_parent',
      title: 'Parent',
      type: 'chat',
      automationId: null,
      parentSessionId: null,
      isUnread: false,
      archivedAt: null,
      archivedReason: null,
      createdAt: 1,
      updatedAt: 1,
    };
    queryClient.setQueryData(backgroundTaskKeys.list('ses_parent'), [
      { ...completedTask(), status: 'running', completedAt: null },
    ]);
    queryClient.setQueryData(sessionKeys.infiniteList(''), {
      pages: [{ sessions: [parent], nextCursor: null }],
      pageParams: [undefined],
    });
    let sounds = 0;

    syncBackgroundTaskEvent(queryClient, completedTask(), 'ses_other', () => sounds++);
    syncBackgroundTaskEvent(queryClient, completedTask(), 'ses_other', () => sounds++);

    const sessions = queryClient.getQueryData<{ pages: SessionsPage[] }>(sessionKeys.infiniteList(''));
    expect(sessions?.pages[0].sessions[0].isUnread).toBe(true);
    expect(sounds).toBe(1);
  });

  test('respects disabled sound settings', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(backgroundTaskKeys.list('ses_parent'), []);
    queryClient.setQueryData(['settings', 'list'], { 'notifications.sound.enabled': 'false' });
    let sounds = 0;

    syncBackgroundTaskEvent(queryClient, completedTask(), 'ses_parent', () => sounds++);

    expect(sounds).toBe(0);
  });
});
