import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

import type { PrefixedString } from '@stitch/shared/id';

const broadcastMock = mock(async () => {});

void mock.module('@/lib/sse.js', () => ({
  broadcast: broadcastMock,
}));

import { eq } from 'drizzle-orm';

import { getDb } from '@/db/client.js';
import { questions, sessions } from '@/db/schema.js';
import { setupTestDb } from '@/db/test-helpers.js';
import { interactionBroker } from '@/interactions/broker.js';

setupTestDb();

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

// Poll until broadcast has been called at least `count` times, then yield
async function waitForBroadcasts(count: number): Promise<void> {
  while (broadcastMock.mock.calls.length < count) {
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('question service interactions', () => {
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

  test('askQuestion broadcasts and resolves through replyQuestion', async () => {
    const { askQuestion, replyQuestion } = await import('@/question/service.js');

    const promise = askQuestion({
      sessionId,
      messageId,
      streamRunId: 'run_question',
      toolCallId: 'call_question',
      questions: [{ question: 'Pick one', header: 'Choice', options: [], multiple: false }],
    });

    await waitForBroadcasts(1);

    expect(broadcastMock).toHaveBeenCalledWith(
      'question-asked',
      expect.objectContaining({
        question: expect.objectContaining({
          sessionId,
          messageId,
          toolCallId: 'call_question',
          status: 'pending',
        }),
      }),
    );

    type AskedCall = [string, { question: { id: PrefixedString<'quest'> } }];
    const [[, { question }]] = broadcastMock.mock.calls as unknown as AskedCall[];
    const questionId = question.id;

    const replyResult = await replyQuestion(questionId, [['A']]);
    expect(replyResult).toEqual({ data: null });

    expect(promise).resolves.toEqual([['A']]);

    expect(broadcastMock).toHaveBeenCalledWith('question-replied', {
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

    await waitForBroadcasts(1);

    type AskedCall = [string, { question: { id: PrefixedString<'quest'> } }];
    const [[, { question }]] = broadcastMock.mock.calls as unknown as AskedCall[];
    const questionId = question.id;

    const rejectResult = await rejectQuestion(questionId);
    expect(rejectResult).toEqual({ data: null });

    expect(promise).rejects.toThrow('Question rejected by user');

    expect(broadcastMock).toHaveBeenCalledWith('question-rejected', {
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
    await waitForBroadcasts(2);

    type AskedCall = [string, { question: { id: PrefixedString<'quest'>; sessionId: string } }];
    const calls = broadcastMock.mock.calls as unknown as AskedCall[];

    const firstId = calls.find(
      (c) => c[0] === 'question-asked' && c[1].question.sessionId === sessionId,
    )?.[1].question.id;
    const secondId = calls.find(
      (c) => c[0] === 'question-asked' && c[1].question.sessionId === otherSessionId,
    )?.[1].question.id;

    await abortQuestions(sessionId);

    expect(first).rejects.toThrow('Question aborted by session abort');

    expect(broadcastMock).toHaveBeenCalledWith('question-rejected', {
      questionId: firstId,
      sessionId,
    });

    // Second question (different session) is unaffected - still resolvable
    await replyQuestion(secondId!, [['ok']]);
    expect(second).resolves.toEqual([['ok']]);
  });
});
