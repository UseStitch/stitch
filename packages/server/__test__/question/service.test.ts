import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { PrefixedString } from '@stitch/shared/id';

const mocks = vi.hoisted(() => {
  const insertReturning: unknown[][] = [];
  const updateReturning: unknown[][] = [];
  const selectWhere: unknown[][] = [];
  const broadcastMock = vi.fn();
  const createQuestionIdMock = vi.fn();

  const db = {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => insertReturning.shift() ?? []),
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
    createQuestionIdMock,
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
  createQuestionId: mocks.createQuestionIdMock,
}));

vi.mock('@/lib/sse.js', () => ({
  broadcast: mocks.broadcastMock,
}));

describe('question service interactions', () => {
  const sessionId = 'ses_question' as PrefixedString<'ses'>;
  const messageId = 'msg_question' as PrefixedString<'msg'>;

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

  test('askQuestion broadcasts and resolves through replyQuestion', async () => {
    const { askQuestion, replyQuestion } = await import('@/question/service.js');
    const questionId = 'quest_ask' as PrefixedString<'quest'>;
    mocks.createQuestionIdMock.mockReturnValueOnce(questionId);
    const row = {
      id: questionId,
      sessionId,
      messageId,
      toolCallId: 'call_question',
      questions: [{ question: 'Pick one', header: 'Choice', options: [], multiple: false }],
      answers: null,
      status: 'pending',
      createdAt: 1,
      answeredAt: null,
    };
    mocks.insertReturning.push([row]);
    mocks.updateReturning.push([{ ...row, status: 'answered', answers: [['A']], answeredAt: 2 }]);

    const promise = askQuestion({
      sessionId,
      messageId,
      streamRunId: 'run_question',
      toolCallId: 'call_question',
      questions: row.questions,
    });

    await Promise.resolve();
    expect(mocks.broadcastMock).toHaveBeenCalledWith('question-asked', {
      question: { ...row, answers: undefined, answeredAt: undefined },
    });

    await expect(replyQuestion(questionId, [['A']])).resolves.toEqual({ data: null });
    await expect(promise).resolves.toEqual([['A']]);
    expect(mocks.broadcastMock).toHaveBeenCalledWith('question-replied', {
      questionId,
      sessionId,
      answers: [['A']],
    });
  });

  test('rejectQuestion rejects a pending askQuestion promise', async () => {
    const { askQuestion, rejectQuestion } = await import('@/question/service.js');
    const questionId = 'quest_reject' as PrefixedString<'quest'>;
    mocks.createQuestionIdMock.mockReturnValueOnce(questionId);
    const row = {
      id: questionId,
      sessionId,
      messageId,
      toolCallId: 'call_question',
      questions: [{ question: 'Continue?', header: 'Confirm', options: [], multiple: false }],
      answers: null,
      status: 'pending',
      createdAt: 1,
      answeredAt: null,
    };
    mocks.insertReturning.push([row]);
    mocks.selectWhere.push([row]);

    const promise = askQuestion({
      sessionId,
      messageId,
      toolCallId: 'call_question',
      questions: row.questions,
    });

    await Promise.resolve();
    await expect(rejectQuestion(questionId)).resolves.toEqual({ data: null });
    await expect(promise).rejects.toThrow('Question rejected by user');
    expect(mocks.broadcastMock).toHaveBeenCalledWith('question-rejected', {
      questionId,
      sessionId,
    });
  });

  test('abortQuestions rejects pending questions for the session', async () => {
    const { askQuestion, abortQuestions } = await import('@/question/service.js');
    const firstId = 'quest_abort_1' as PrefixedString<'quest'>;
    const secondId = 'quest_abort_2' as PrefixedString<'quest'>;
    mocks.createQuestionIdMock.mockReturnValueOnce(firstId).mockReturnValueOnce(secondId);
    const otherSessionId = 'ses_other' as PrefixedString<'ses'>;
    const firstRow = {
      id: firstId,
      sessionId,
      messageId,
      toolCallId: 'call_1',
      questions: [{ question: 'First?', header: 'First', options: [], multiple: false }],
      answers: null,
      status: 'pending',
      createdAt: 1,
      answeredAt: null,
    };
    const secondRow = {
      ...firstRow,
      id: secondId,
      sessionId: otherSessionId,
      toolCallId: 'call_2',
    };
    mocks.insertReturning.push([firstRow], [secondRow]);
    mocks.selectWhere.push([firstRow]);

    const first = askQuestion({
      sessionId,
      messageId,
      streamRunId: 'run_first',
      toolCallId: 'call_1',
      questions: firstRow.questions,
    });
    const second = askQuestion({
      sessionId: otherSessionId,
      messageId,
      streamRunId: 'run_second',
      toolCallId: 'call_2',
      questions: secondRow.questions,
    });

    await Promise.resolve();
    await abortQuestions(sessionId);

    await expect(first).rejects.toThrow('Question aborted by session abort');
    expect(mocks.broadcastMock).toHaveBeenCalledWith('question-rejected', {
      questionId: firstId,
      sessionId,
    });

    const { replyQuestion } = await import('@/question/service.js');
    mocks.updateReturning.push([{ ...secondRow, status: 'answered', answers: [['ok']] }]);
    await replyQuestion(secondId, [['ok']]);
    await expect(second).resolves.toEqual([['ok']]);
  });
});
