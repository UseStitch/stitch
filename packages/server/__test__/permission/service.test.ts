import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { PrefixedString } from '@stitch/shared/id';

const mocks = vi.hoisted(() => {
  const insertReturning: unknown[][] = [];
  const updateReturning: unknown[][] = [];
  const selectWhere: unknown[][] = [];
  const broadcastMock = vi.fn();
  const createPermissionResponseIdMock = vi.fn();
  const createPermissionRuleIdMock = vi.fn(() => 'perm_rule');

  const db = {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => insertReturning.shift() ?? []),
        onConflictDoUpdate: vi.fn(async () => undefined),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => updateReturning.shift() ?? []),
        })),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => selectWhere.shift() ?? []),
      })),
    })),
  };

  return {
    broadcastMock,
    createPermissionResponseIdMock,
    createPermissionRuleIdMock,
    db,
    insertReturning,
    updateReturning,
    selectWhere,
  };
});

vi.mock('@/db/client.js', () => ({
  getDb: () => mocks.db,
}));

vi.mock('@stitch/shared/id', () => ({
  createPermissionResponseId: mocks.createPermissionResponseIdMock,
  createPermissionRuleId: mocks.createPermissionRuleIdMock,
}));

vi.mock('@/lib/sse.js', () => ({
  broadcast: mocks.broadcastMock,
}));

describe('permission service interactions', () => {
  const sessionId = 'ses_permission' as PrefixedString<'ses'>;
  const messageId = 'msg_permission' as PrefixedString<'msg'>;

  beforeEach(() => {
    mocks.broadcastMock.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    const { interactionBroker } = await import('@/interactions/broker.js');
    interactionBroker.clear();
    vi.clearAllMocks();
    mocks.insertReturning.length = 0;
    mocks.updateReturning.length = 0;
    mocks.selectWhere.length = 0;
  });

  test('requestPermissionResponse broadcasts and resolves through allowPermissionResponse', async () => {
    const { requestPermissionResponse, allowPermissionResponse } = await import(
      '@/permission/service.js'
    );
    const permissionResponseId = 'permres_allow' as PrefixedString<'permres'>;
    mocks.createPermissionResponseIdMock.mockReturnValueOnce(permissionResponseId);
    const row = {
      id: permissionResponseId,
      sessionId,
      messageId,
      toolCallId: 'call_permission',
      toolName: 'bash',
      toolInput: { command: 'pwd' },
      systemReminder: 'Tool execution requires user approval',
      suggestion: null,
      status: 'pending',
      createdAt: 1,
      resolvedAt: null,
      entry: null,
    };
    mocks.insertReturning.push([row]);
    mocks.selectWhere.push([row]);
    mocks.updateReturning.push([{ ...row, status: 'allowed', resolvedAt: 2 }]);

    const promise = requestPermissionResponse({
      sessionId,
      messageId,
      streamRunId: 'run_permission',
      toolCallId: 'call_permission',
      toolName: 'bash',
      toolInput: { command: 'pwd' },
      systemReminder: 'Tool execution requires user approval',
    });

    await Promise.resolve();
    expect(mocks.broadcastMock).toHaveBeenCalledWith('permission-response-requested', {
      permissionResponse: { ...row, resolvedAt: undefined },
    });

    await expect(allowPermissionResponse(permissionResponseId)).resolves.toEqual({ data: null });
    await expect(promise).resolves.toEqual({ decision: 'allow' });
    expect(mocks.broadcastMock).toHaveBeenCalledWith('permission-response-resolved', {
      permissionResponseId,
      sessionId,
    });
  });

  test('alternativePermissionResponse resolves with alternative entry', async () => {
    const { requestPermissionResponse, alternativePermissionResponse } = await import(
      '@/permission/service.js'
    );
    const permissionResponseId = 'permres_alt' as PrefixedString<'permres'>;
    mocks.createPermissionResponseIdMock.mockReturnValueOnce(permissionResponseId);
    const row = {
      id: permissionResponseId,
      sessionId,
      messageId,
      toolCallId: 'call_permission',
      toolName: 'write',
      toolInput: { path: 'a.txt' },
      systemReminder: 'Tool execution requires user approval',
      suggestion: null,
      status: 'pending',
      createdAt: 1,
      resolvedAt: null,
      entry: null,
    };
    mocks.insertReturning.push([row]);
    mocks.selectWhere.push([row]);
    mocks.updateReturning.push([{ ...row, status: 'alternative', entry: 'Use read instead' }]);

    const promise = requestPermissionResponse({
      sessionId,
      messageId,
      toolCallId: 'call_permission',
      toolName: 'write',
      toolInput: { path: 'a.txt' },
      systemReminder: 'Tool execution requires user approval',
    });

    await Promise.resolve();
    await expect(alternativePermissionResponse(permissionResponseId, 'Use read instead')).resolves.toEqual({
      data: null,
    });
    await expect(promise).resolves.toEqual({
      decision: 'alternative',
      entry: 'Use read instead',
    });
  });

  test('abortPermissionResponses rejects pending permissions for the session', async () => {
    const { requestPermissionResponse, abortPermissionResponses, rejectPermissionResponse } =
      await import('@/permission/service.js');
    const firstId = 'permres_abort_1' as PrefixedString<'permres'>;
    const secondId = 'permres_abort_2' as PrefixedString<'permres'>;
    mocks.createPermissionResponseIdMock.mockReturnValueOnce(firstId).mockReturnValueOnce(secondId);
    const otherSessionId = 'ses_other' as PrefixedString<'ses'>;
    const firstRow = {
      id: firstId,
      sessionId,
      messageId,
      toolCallId: 'call_1',
      toolName: 'bash',
      toolInput: {},
      systemReminder: 'Tool execution requires user approval',
      suggestion: null,
      status: 'pending',
      createdAt: 1,
      resolvedAt: null,
      entry: null,
    };
    const secondRow = {
      ...firstRow,
      id: secondId,
      sessionId: otherSessionId,
      toolCallId: 'call_2',
    };
    mocks.insertReturning.push([firstRow], [secondRow]);
    mocks.selectWhere.push([firstRow]);

    const first = requestPermissionResponse({
      sessionId,
      messageId,
      streamRunId: 'run_first',
      toolCallId: 'call_1',
      toolName: 'bash',
      toolInput: {},
      systemReminder: 'Tool execution requires user approval',
    });
    const second = requestPermissionResponse({
      sessionId: otherSessionId,
      messageId,
      streamRunId: 'run_second',
      toolCallId: 'call_2',
      toolName: 'bash',
      toolInput: {},
      systemReminder: 'Tool execution requires user approval',
    });

    await Promise.resolve();
    await abortPermissionResponses(sessionId);

    await expect(first).rejects.toThrow('Permission response aborted by session abort');
    expect(mocks.broadcastMock).toHaveBeenCalledWith('permission-response-resolved', {
      permissionResponseId: firstId,
      sessionId,
    });

    mocks.selectWhere.push([secondRow]);
    mocks.updateReturning.push([{ ...secondRow, status: 'rejected', resolvedAt: 2 }]);
    await rejectPermissionResponse(secondId);
    await expect(second).resolves.toEqual({ decision: 'reject' });
  });
});
