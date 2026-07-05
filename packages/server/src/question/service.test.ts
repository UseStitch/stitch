import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { questions } from '@/db/schema/questions.js';
import { sessions } from '@/db/schema/sessions.js';
import { setupTestDb } from '@/db/test-helpers.js';
import { interactionBroker } from '@/lib/interactions/broker.js';
import { internalBus } from '@/lib/internal-bus.js';
import type { InternalEventMap, InternalEventName } from '@/lib/internal-bus.js';

setupTestDb();

type EmittedEvent = [InternalEventName, InternalEventMap[InternalEventName]];
let emittedEvents: EmittedEvent[] = [];
let cleanups: Array<() => void> = [];

function captureEvents(...names: InternalEventName[]): void {
  for (const name of names) {
    cleanups.push(internalBus.onSync(name, (data) => emittedEvents.push([name, data])));
  }
}

const sessionId = 'ses_question' as PrefixedString<'ses'>;
const otherSessionId = 'ses_other' as PrefixedString<'ses'>;
const messageId = 'msg_question' as PrefixedString<'msg'>;

async function seedSessions(): Promise<void> {
  const db = getDb();
  await db.insert(sessions).values([
    { id: sessionId, title: 'Test session' },
    { id: otherSessionId, title: 'Other session' },
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
    captureEvents('question.asked', 'question.replied', 'question.rejected');
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

    const askedEvent = emittedEvents.find(([name]) => name === 'question.asked');
    expect(askedEvent).toBeDefined();
    const askedData = askedEvent![1] as InternalEventMap['question.asked'];
    expect(askedData.question).toMatchObject({ sessionId, messageId, toolCallId: 'call_question', status: 'pending' });

    const questionId = askedData.question.id;

    const replyResult = await replyQuestion(questionId, [['A']]);
    expect(replyResult).toEqual({ data: null, error: null });

    expect(promise).resolves.toEqual([['A']]);

    const repliedEvent = emittedEvents.find(([name]) => name === 'question.replied');
    expect(repliedEvent).toBeDefined();
    expect(repliedEvent![1]).toEqual({ questionId, sessionId, answers: [['A']] });

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
      ([name]) => name === 'question.asked',
    )![1] as InternalEventMap['question.asked'];
    const questionId = askedData.question.id;

    const rejectResult = await rejectQuestion(questionId);
    expect(rejectResult).toEqual({ data: null, error: null });

    expect(promise).rejects.toThrow('Question rejected by user');

    const rejectedEvent = emittedEvents.find(([name]) => name === 'question.rejected');
    expect(rejectedEvent).toBeDefined();
    expect(rejectedEvent![1]).toEqual({ questionId, sessionId });

    const db = getDb();
    const [row] = await db.select().from(questions).where(eq(questions.id, questionId));
    expect(row?.status).toBe('rejected');
  });

  test('replyQuestion accepts custom answers by default', async () => {
    const { createQuestion, replyQuestion } = await import('@/question/service.js');

    const questionResult = await createQuestion({
      sessionId,
      messageId,
      toolCallId: 'call_custom',
      questions: [
        { question: 'Pick one', header: 'Choice', options: [{ label: 'A', description: 'Option A' }], multiple: false },
      ],
    });
    expect(questionResult.error).toBeNull();
    if (questionResult.error) return;
    const question = questionResult.data;

    const result = await replyQuestion(question.id, [['Something else']]);
    expect(result).toEqual({ data: null, error: null });

    const db = getDb();
    const [row] = await db.select().from(questions).where(eq(questions.id, question.id));
    expect(row?.status).toBe('answered');
    expect(row?.answers).toEqual([['Something else']]);
  });

  test('replyQuestion rejects invalid answers without resolving the question', async () => {
    const { createQuestion, replyQuestion } = await import('@/question/service.js');

    const questionResult = await createQuestion({
      sessionId,
      messageId,
      toolCallId: 'call_invalid',
      questions: [
        {
          question: 'Pick one',
          header: 'Choice',
          options: [{ label: 'A', description: 'Option A' }],
          multiple: false,
          custom: false,
        },
      ],
    });
    expect(questionResult.error).toBeNull();
    if (questionResult.error) return;
    const question = questionResult.data;

    expect(replyQuestion(question.id, [[]])).resolves.toEqual({
      data: null,
      error: { message: 'Question 1 requires an answer', status: 400, details: undefined },
    });
    expect(replyQuestion(question.id, [['Something else']])).resolves.toEqual({
      data: null,
      error: { message: 'Question 1 received an invalid answer', status: 400, details: undefined },
    });
    expect(replyQuestion(question.id, [['A', 'Something else']])).resolves.toEqual({
      data: null,
      error: { message: 'Question 1 only accepts one answer', status: 400, details: undefined },
    });

    const db = getDb();
    const [row] = await db.select().from(questions).where(eq(questions.id, question.id));
    expect(row?.status).toBe('pending');
    expect(row?.answers).toBeNull();
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

    const askedEvents = emittedEvents.filter(([name]) => name === 'question.asked') as Array<
      [string, InternalEventMap['question.asked']]
    >;

    const firstId = askedEvents.find(([, data]) => data.question.sessionId === sessionId)?.[1].question.id;
    const secondId = askedEvents.find(([, data]) => data.question.sessionId === otherSessionId)?.[1].question.id;

    await abortQuestions(sessionId);

    expect(first).rejects.toThrow('Question aborted by session abort');

    const rejectedEvents = emittedEvents.filter(([name]) => name === 'question.rejected');
    expect(
      rejectedEvents.some(([, data]) => {
        const d = data as InternalEventMap['question.rejected'];
        return d.questionId === firstId && d.sessionId === sessionId;
      }),
    ).toBe(true);

    // Second question (different session) is unaffected - still resolvable
    await replyQuestion(secondId!, [['ok']]);
    expect(second).resolves.toEqual([['ok']]);
  });
});
