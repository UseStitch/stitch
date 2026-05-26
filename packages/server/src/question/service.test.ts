import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import type { SseEventName, SseEventPayloadMap } from '@stitch/shared/chat/realtime';
import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { questions, sessions } from '@/db/schema.js';
import { setupTestDb } from '@/db/test-helpers.js';
import { interactionBroker } from '@/interactions/broker.js';
import * as Events from '@/lib/events.js';

setupTestDb();

type EmittedEvent = [SseEventName, SseEventPayloadMap[SseEventName]];
let emittedEvents: EmittedEvent[] = [];
let cleanups: Array<() => void> = [];

function captureEvents(...names: SseEventName[]): void {
  for (const name of names) {
    cleanups.push(Events.on(name, (data) => emittedEvents.push([name, data])));
  }
}

const sessionId = 'ses_question' as PrefixedString<'ses'>;
const otherSessionId = 'ses_other' as PrefixedString<'ses'>;
const messageId = 'msg_question' as PrefixedString<'msg'>;

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

describe('question service interactions', () => {
  beforeEach(async () => {
    emittedEvents = [];
    for (const cleanup of cleanups) cleanup();
    cleanups = [];
    captureEvents('question-asked', 'question-replied', 'question-rejected');
    await seedSessions();
  });

  afterEach(() => {
    interactionBroker.clear();
  });

  test('askQuestion broadcasts and resolves through replyQuestion', async () => {
    const { askQuestion, replyQuestion } = await import('@/question/service.js');

    const promise = askQuestion({
      sessionId,
      messageId,
      streamRunId: 'run_question',
      toolCallId: 'call_question',
      questions: [{ question: 'Pick one', header: 'Choice', options: [], multiple: false }],
    });

    await waitForEvents(1);

    const askedEvent = emittedEvents.find(([name]) => name === 'question-asked');
    expect(askedEvent).toBeDefined();
    const askedData = askedEvent![1] as SseEventPayloadMap['question-asked'];
    expect(askedData.question).toMatchObject({
      sessionId,
      messageId,
      toolCallId: 'call_question',
      status: 'pending',
    });

    const questionId = askedData.question.id;

    const replyResult = await replyQuestion(questionId, [['A']]);
    expect(replyResult).toEqual({ data: null });

    expect(promise).resolves.toEqual([['A']]);

    const repliedEvent = emittedEvents.find(([name]) => name === 'question-replied');
    expect(repliedEvent).toBeDefined();
    expect(repliedEvent![1]).toEqual({
      questionId,
      sessionId,
      answers: [['A']],
    });

    const db = getDb();
    const [row] = await db.select().from(questions).where(eq(questions.id, questionId));
    expect(row?.status).toBe('answered');
    expect(row?.answers).toEqual([['A']]);
  });

  test('rejectQuestion rejects a pending askQuestion promise', async () => {
    const { askQuestion, rejectQuestion } = await import('@/question/service.js');

    const promise = askQuestion({
      sessionId,
      messageId,
      toolCallId: 'call_question',
      questions: [{ question: 'Continue?', header: 'Confirm', options: [], multiple: false }],
    });

    await waitForEvents(1);

    const askedData = emittedEvents.find(
      ([name]) => name === 'question-asked',
    )![1] as SseEventPayloadMap['question-asked'];
    const questionId = askedData.question.id;

    const rejectResult = await rejectQuestion(questionId);
    expect(rejectResult).toEqual({ data: null });

    expect(promise).rejects.toThrow('Question rejected by user');

    const rejectedEvent = emittedEvents.find(([name]) => name === 'question-rejected');
    expect(rejectedEvent).toBeDefined();
    expect(rejectedEvent![1]).toEqual({
      questionId,
      sessionId,
    });

    const db = getDb();
    const [row] = await db.select().from(questions).where(eq(questions.id, questionId));
    expect(row?.status).toBe('rejected');
  });

  test('abortQuestions rejects pending questions for the session', async () => {
    const { askQuestion, abortQuestions, replyQuestion } = await import('@/question/service.js');

    const first = askQuestion({
      sessionId,
      messageId,
      streamRunId: 'run_first',
      toolCallId: 'call_1',
      questions: [{ question: 'First?', header: 'First', options: [], multiple: false }],
    });
    const second = askQuestion({
      sessionId: otherSessionId,
      messageId,
      streamRunId: 'run_second',
      toolCallId: 'call_2',
      questions: [{ question: 'Second?', header: 'Second', options: [], multiple: false }],
    });

    // Wait for both askQuestion broadcasts to fire
    await waitForEvents(2);

    const askedEvents = emittedEvents.filter(([name]) => name === 'question-asked') as Array<
      [string, SseEventPayloadMap['question-asked']]
    >;

    const firstId = askedEvents.find(([, data]) => data.question.sessionId === sessionId)?.[1]
      .question.id;
    const secondId = askedEvents.find(([, data]) => data.question.sessionId === otherSessionId)?.[1]
      .question.id;

    await abortQuestions(sessionId);

    expect(first).rejects.toThrow('Question aborted by session abort');

    const rejectedEvents = emittedEvents.filter(([name]) => name === 'question-rejected');
    expect(
      rejectedEvents.some(([, data]) => {
        const d = data as SseEventPayloadMap['question-rejected'];
        return d.questionId === firstId && d.sessionId === sessionId;
      }),
    ).toBe(true);

    // Second question (different session) is unaffected - still resolvable
    await replyQuestion(secondId!, [['ok']]);
    expect(second).resolves.toEqual([['ok']]);
  });
});
