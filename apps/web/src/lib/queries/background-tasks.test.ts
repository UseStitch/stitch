import { describe, expect, test } from 'bun:test';

import { QueryClient } from '@tanstack/react-query';

import type { BackgroundTask } from '@stitch/shared/background-tasks/types';

import { backgroundTaskKeys, updateBackgroundTaskCache } from './background-tasks.js';

function task(id: string, startedAt: number, status: BackgroundTask['status'] = 'running'): BackgroundTask {
  return {
    id: id as BackgroundTask['id'],
    parentSessionId: 'ses_parent',
    childSessionId: id as BackgroundTask['childSessionId'],
    originMessageId: 'msg_origin',
    originToolCallId: `call-${id}`,
    title: id,
    status,
    deliveryStatus: 'pending',
    result: null,
    error: null,
    providerId: 'provider',
    modelId: 'model',
    activeToolsetIds: [],
    startedAt,
    completedAt: null,
    deliveredAt: null,
  };
}

describe('background task cache', () => {
  test('upserts events while preserving newest-first order and returns prior state', () => {
    const queryClient = new QueryClient();
    const older = task('ses_older', 1);
    queryClient.setQueryData(backgroundTaskKeys.list('ses_parent'), [older]);

    expect(updateBackgroundTaskCache(queryClient, task('ses_newer', 2))).toBeUndefined();
    const completed = { ...older, status: 'completed' as const };
    expect(updateBackgroundTaskCache(queryClient, completed)?.status).toBe('running');
    expect(queryClient.getQueryData<BackgroundTask[]>(backgroundTaskKeys.list('ses_parent'))).toEqual([
      task('ses_newer', 2),
      completed,
    ]);
  });
});
