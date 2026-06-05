import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { and, eq, isNull } from 'drizzle-orm';

import type { SseEventName, SseEventPayloadMap } from '@stitch/shared/chat/realtime';
import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { permissionResponses, sessions, toolPermissions } from '@/db/schema.js';
import { setupTestDb } from '@/db/test-helpers.js';
import * as Events from '@/lib/events.js';
import { interactionBroker } from '@/lib/interactions/broker.js';
import {
  abortPermissionResponses,
  allowPermissionResponse,
  alternativePermissionResponse,
  rejectPermissionResponse,
  requestPermissionResponse,
  upsertPerm,
} from '@/permission/service.js';

setupTestDb();

type EmittedEvent = [SseEventName, SseEventPayloadMap[SseEventName]];
let emittedEvents: EmittedEvent[] = [];
let cleanups: Array<() => void> = [];

function captureEvents(...names: SseEventName[]): void {
  for (const name of names) {
    cleanups.push(Events.on(name, (data) => emittedEvents.push([name, data])));
  }
}

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

async function waitForEvents(count: number): Promise<void> {
  while (emittedEvents.length < count) {
    await new Promise((r) => setTimeout(r, 5));
  }
}

async function waitForRequestedEvents(count: number): Promise<void> {
  while (
    emittedEvents.filter(([name]) => name === 'permission-response-requested').length < count
  ) {
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('permission service interactions', () => {
  beforeEach(async () => {
    emittedEvents = [];
    for (const cleanup of cleanups) cleanup();
    cleanups = [];
    captureEvents('permission-response-requested', 'permission-response-resolved');
    await seedSessions();
  });

  afterEach(() => {
    interactionBroker.clear();
  });

  test('requestPermissionResponse broadcasts and resolves through allowPermissionResponse', async () => {
    const promise = requestPermissionResponse({
      sessionId,
      messageId,
      streamRunId: 'run_permission',
      toolCallId: 'call_permission',
      toolName: 'bash',
      toolInput: { command: 'pwd' },
      systemReminder: 'Tool execution requires user approval',
    });

    await waitForEvents(1);

    const requestedEvent = emittedEvents.find(([name]) => name === 'permission-response-requested');
    expect(requestedEvent).toBeDefined();
    const requestedData = requestedEvent![1] as SseEventPayloadMap['permission-response-requested'];
    expect(requestedData.permissionResponse).toMatchObject({
      sessionId,
      messageId,
      toolCallId: 'call_permission',
      toolName: 'bash',
      status: 'pending',
    });

    const permissionResponseId = requestedData.permissionResponse.id;

    expect(allowPermissionResponse(permissionResponseId)).resolves.toEqual({ data: null });
    expect(promise).resolves.toEqual({ decision: 'allow' });

    const resolvedEvent = emittedEvents.find(([name]) => name === 'permission-response-resolved');
    expect(resolvedEvent).toBeDefined();
    expect(resolvedEvent![1]).toEqual({
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

  test('deduplicates concurrent permission requests with the same key', async () => {
    const dedupeKey = 'permission:dedupe:same';

    const first = requestPermissionResponse({
      sessionId,
      messageId,
      streamRunId: 'run_permission',
      toolCallId: 'call_1',
      toolName: 'bash',
      toolInput: { command: 'pwd' },
      systemReminder: 'Tool execution requires user approval',
      dedupeKey,
    });
    const second = requestPermissionResponse({
      sessionId,
      messageId,
      streamRunId: 'run_permission',
      toolCallId: 'call_2',
      toolName: 'bash',
      toolInput: { command: 'pwd' },
      systemReminder: 'Tool execution requires user approval',
      dedupeKey,
    });

    await waitForRequestedEvents(1);

    const requestedEvents = emittedEvents.filter(
      ([name]) => name === 'permission-response-requested',
    ) as Array<[string, SseEventPayloadMap['permission-response-requested']]>;
    expect(requestedEvents).toHaveLength(1);

    const db = getDb();
    const rows = await db
      .select()
      .from(permissionResponses)
      .where(
        and(
          eq(permissionResponses.sessionId, sessionId),
          eq(permissionResponses.status, 'pending'),
        ),
      );
    expect(rows).toHaveLength(1);

    await allowPermissionResponse(requestedEvents[0][1].permissionResponse.id);

    expect(first).resolves.toEqual({ decision: 'allow' });
    expect(second).resolves.toEqual({ decision: 'allow' });
  });

  test('does not deduplicate permission requests with different keys', async () => {
    const first = requestPermissionResponse({
      sessionId,
      messageId,
      toolCallId: 'call_1',
      toolName: 'bash',
      toolInput: { command: 'pwd' },
      systemReminder: 'Tool execution requires user approval',
      dedupeKey: 'permission:dedupe:first',
    });
    const second = requestPermissionResponse({
      sessionId,
      messageId,
      toolCallId: 'call_2',
      toolName: 'bash',
      toolInput: { command: 'ls' },
      systemReminder: 'Tool execution requires user approval',
      dedupeKey: 'permission:dedupe:second',
    });

    await waitForRequestedEvents(2);

    const requestedEvents = emittedEvents.filter(
      ([name]) => name === 'permission-response-requested',
    ) as Array<[string, SseEventPayloadMap['permission-response-requested']]>;
    expect(requestedEvents).toHaveLength(2);

    await rejectPermissionResponse(requestedEvents[0][1].permissionResponse.id);
    await rejectPermissionResponse(requestedEvents[1][1].permissionResponse.id);

    expect(first).resolves.toEqual({ decision: 'reject' });
    expect(second).resolves.toEqual({ decision: 'reject' });
  });

  test('clears dedupe key after permission resolution', async () => {
    const dedupeKey = 'permission:dedupe:reusable';

    const first = requestPermissionResponse({
      sessionId,
      messageId,
      toolCallId: 'call_1',
      toolName: 'bash',
      toolInput: { command: 'pwd' },
      systemReminder: 'Tool execution requires user approval',
      dedupeKey,
    });

    await waitForRequestedEvents(1);
    const firstRequested = emittedEvents.find(
      ([name]) => name === 'permission-response-requested',
    )![1] as SseEventPayloadMap['permission-response-requested'];

    await allowPermissionResponse(firstRequested.permissionResponse.id);
    expect(first).resolves.toEqual({ decision: 'allow' });

    const second = requestPermissionResponse({
      sessionId,
      messageId,
      toolCallId: 'call_2',
      toolName: 'bash',
      toolInput: { command: 'pwd' },
      systemReminder: 'Tool execution requires user approval',
      dedupeKey,
    });

    await waitForRequestedEvents(2);

    const requestedEvents = emittedEvents.filter(
      ([name]) => name === 'permission-response-requested',
    ) as Array<[string, SseEventPayloadMap['permission-response-requested']]>;
    expect(requestedEvents).toHaveLength(2);

    await rejectPermissionResponse(requestedEvents[1][1].permissionResponse.id);
    expect(second).resolves.toEqual({ decision: 'reject' });
  });

  test('deduplicated permission requests reject together on abort', async () => {
    const dedupeKey = 'permission:dedupe:abort';

    const first = requestPermissionResponse({
      sessionId,
      messageId,
      streamRunId: 'run_permission',
      toolCallId: 'call_1',
      toolName: 'bash',
      toolInput: { command: 'pwd' },
      systemReminder: 'Tool execution requires user approval',
      dedupeKey,
    });
    const second = requestPermissionResponse({
      sessionId,
      messageId,
      streamRunId: 'run_permission',
      toolCallId: 'call_2',
      toolName: 'bash',
      toolInput: { command: 'pwd' },
      systemReminder: 'Tool execution requires user approval',
      dedupeKey,
    });

    await waitForRequestedEvents(1);
    await abortPermissionResponses(sessionId);

    const requestedEvents = emittedEvents.filter(
      ([name]) => name === 'permission-response-requested',
    );
    expect(requestedEvents).toHaveLength(1);
    expect(first).rejects.toThrow('Permission response aborted by session abort');
    expect(second).rejects.toThrow('Permission response aborted by session abort');
  });

  test('alternativePermissionResponse resolves with alternative entry', async () => {
    const promise = requestPermissionResponse({
      sessionId,
      messageId,
      toolCallId: 'call_permission',
      toolName: 'write',
      toolInput: { path: 'a.txt' },
      systemReminder: 'Tool execution requires user approval',
    });

    await waitForEvents(1);

    const requestedData = emittedEvents.find(
      ([name]) => name === 'permission-response-requested',
    )![1] as SseEventPayloadMap['permission-response-requested'];
    const permissionResponseId = requestedData.permissionResponse.id;

    expect(
      alternativePermissionResponse(permissionResponseId, 'Use read instead'),
    ).resolves.toEqual({ data: null });
    expect(promise).resolves.toEqual({
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

    await waitForEvents(2);

    const requestedEvents = emittedEvents.filter(
      ([name]) => name === 'permission-response-requested',
    ) as Array<[string, SseEventPayloadMap['permission-response-requested']]>;

    const firstId = requestedEvents.find(
      ([, data]) => data.permissionResponse.sessionId === sessionId,
    )?.[1].permissionResponse.id;
    const secondId = requestedEvents.find(
      ([, data]) => data.permissionResponse.sessionId === otherSessionId,
    )?.[1].permissionResponse.id;

    await abortPermissionResponses(sessionId);

    expect(first).rejects.toThrow('Permission response aborted by session abort');

    const resolvedEvents = emittedEvents.filter(
      ([name]) => name === 'permission-response-resolved',
    );
    expect(
      resolvedEvents.some(([, data]) => {
        const d = data as SseEventPayloadMap['permission-response-resolved'];
        return d.permissionResponseId === firstId && d.sessionId === sessionId;
      }),
    ).toBe(true);

    // Second permission (different session) is unaffected - still resolvable
    await rejectPermissionResponse(secondId!);
    expect(second).resolves.toEqual({ decision: 'reject' });
  });
});

describe('upsertPerm', () => {
  test('deletes existing global rule before inserting when pattern is null', async () => {
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
