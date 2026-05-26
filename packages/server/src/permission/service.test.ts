import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

import type { PrefixedString } from '@stitch/shared/id';

const broadcastMock = mock(async () => {});

mock.module('@/lib/sse.js', () => ({
  broadcast: broadcastMock,
}));

import { and, eq, isNull } from 'drizzle-orm';

import { getDb } from '@/db/client.js';
import { permissionResponses, sessions, toolPermissions } from '@/db/schema.js';
import { setupTestDb } from '@/db/test-helpers.js';
import { interactionBroker } from '@/interactions/broker.js';

setupTestDb();

const sessionId = 'ses_permission' as PrefixedString<'ses'>;
const otherSessionId = 'ses_other' as PrefixedString<'ses'>;
const messageId = 'msg_permission' as PrefixedString<'msg'>;

async function seedSessions(): Promise<void> {
  const db = getDb();
  await db.insert(sessions).values([
    { id: sessionId, title: 'Test session', activeToolsetIds: [] },
    { id: otherSessionId, title: 'Other session', activeToolsetIds: [] },
  ]);
}

async function waitForBroadcasts(count: number): Promise<void> {
  while (broadcastMock.mock.calls.length < count) {
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('permission service interactions', () => {
  beforeEach(async () => {
    broadcastMock.mockReset();
    broadcastMock.mockResolvedValue(undefined);
    await seedSessions();
  });

  afterEach(() => {
    interactionBroker.clear();
  });

  afterAll(() => {
    mock.restore();
  });

  test('requestPermissionResponse broadcasts and resolves through allowPermissionResponse', async () => {
    const { requestPermissionResponse, allowPermissionResponse } =
      await import('@/permission/service.js');

    const promise = requestPermissionResponse({
      sessionId,
      messageId,
      streamRunId: 'run_permission',
      toolCallId: 'call_permission',
      toolName: 'bash',
      toolInput: { command: 'pwd' },
      systemReminder: 'Tool execution requires user approval',
    });

    await waitForBroadcasts(1);

    expect(broadcastMock).toHaveBeenCalledWith(
      'permission-response-requested',
      expect.objectContaining({
        permissionResponse: expect.objectContaining({
          sessionId,
          messageId,
          toolCallId: 'call_permission',
          toolName: 'bash',
          status: 'pending',
        }),
      }),
    );

    type RequestedCall = [string, { permissionResponse: { id: PrefixedString<'permres'> } }];
    const [[, { permissionResponse }]] = broadcastMock.mock.calls as unknown as RequestedCall[];
    const permissionResponseId = permissionResponse.id;

    await expect(allowPermissionResponse(permissionResponseId)).resolves.toEqual({ data: null });
    await expect(promise).resolves.toEqual({ decision: 'allow' });

    expect(broadcastMock).toHaveBeenCalledWith('permission-response-resolved', {
      permissionResponseId,
      sessionId,
    });

    const db = getDb();
    const [row] = await db
      .select()
      .from(permissionResponses)
      .where(eq(permissionResponses.id, permissionResponseId));
    expect(row?.status).toBe('allowed');
  });

  test('alternativePermissionResponse resolves with alternative entry', async () => {
    const { requestPermissionResponse, alternativePermissionResponse } =
      await import('@/permission/service.js');

    const promise = requestPermissionResponse({
      sessionId,
      messageId,
      toolCallId: 'call_permission',
      toolName: 'write',
      toolInput: { path: 'a.txt' },
      systemReminder: 'Tool execution requires user approval',
    });

    await waitForBroadcasts(1);

    type RequestedCall = [string, { permissionResponse: { id: PrefixedString<'permres'> } }];
    const [[, { permissionResponse }]] = broadcastMock.mock.calls as unknown as RequestedCall[];
    const permissionResponseId = permissionResponse.id;

    await expect(
      alternativePermissionResponse(permissionResponseId, 'Use read instead'),
    ).resolves.toEqual({ data: null });
    await expect(promise).resolves.toEqual({
      decision: 'alternative',
      entry: 'Use read instead',
    });

    const db = getDb();
    const [row] = await db
      .select()
      .from(permissionResponses)
      .where(eq(permissionResponses.id, permissionResponseId));
    expect(row?.status).toBe('alternative');
    expect(row?.entry).toBe('Use read instead');
  });

  test('abortPermissionResponses rejects pending permissions for the session', async () => {
    const { requestPermissionResponse, abortPermissionResponses, rejectPermissionResponse } =
      await import('@/permission/service.js');

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

    await waitForBroadcasts(2);

    type RequestedCall = [string, { permissionResponse: { id: PrefixedString<'permres'>; sessionId: string } }];
    const calls = broadcastMock.mock.calls as unknown as RequestedCall[];

    const firstId = calls.find(
      (c) => c[0] === 'permission-response-requested' && c[1].permissionResponse.sessionId === sessionId,
    )?.[1].permissionResponse.id;
    const secondId = calls.find(
      (c) => c[0] === 'permission-response-requested' && c[1].permissionResponse.sessionId === otherSessionId,
    )?.[1].permissionResponse.id;

    await abortPermissionResponses(sessionId);

    await expect(first).rejects.toThrow('Permission response aborted by session abort');

    expect(broadcastMock).toHaveBeenCalledWith('permission-response-resolved', {
      permissionResponseId: firstId,
      sessionId,
    });

    // Second permission (different session) is unaffected - still resolvable
    await rejectPermissionResponse(secondId!);
    await expect(second).resolves.toEqual({ decision: 'reject' });
  });
});

describe('upsertPerm', () => {
  beforeEach(async () => {
    broadcastMock.mockReset();
  });

  test('deletes existing global rule before inserting when pattern is null', async () => {
    const { upsertPerm } = await import('@/permission/service.js');
    const db = getDb();

    await upsertPerm({ toolName: 'bash', permission: 'allow', pattern: null });

    const rows = await db
      .select()
      .from(toolPermissions)
      .where(and(eq(toolPermissions.toolName, 'bash'), isNull(toolPermissions.pattern)));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.permission).toBe('allow');
  });

  test('does not delete when pattern is a non-null string', async () => {
    const { upsertPerm } = await import('@/permission/service.js');
    const db = getDb();

    await upsertPerm({ toolName: 'bash', permission: 'allow', pattern: '/home/*' });

    const rows = await db
      .select()
      .from(toolPermissions)
      .where(eq(toolPermissions.toolName, 'bash'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.pattern).toBe('/home/*');
  });

  test('calling upsertPerm twice with null pattern replaces the global rule', async () => {
    const { upsertPerm } = await import('@/permission/service.js');
    const db = getDb();

    await upsertPerm({ toolName: 'bash', permission: 'ask', pattern: null });
    await upsertPerm({ toolName: 'bash', permission: 'allow', pattern: null });

    const rows = await db
      .select()
      .from(toolPermissions)
      .where(and(eq(toolPermissions.toolName, 'bash'), isNull(toolPermissions.pattern)));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.permission).toBe('allow');
  });
});
