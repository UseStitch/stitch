import { and, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import type { PrefixedString } from '@stitch/shared/id';
import { createQuestionId } from '@stitch/shared/id';
import type { QuestionInfo, QuestionRequest } from '@stitch/shared/questions/types';

import { getDb } from '@/db/client.js';
import { questions } from '@/db/schema/questions.js';
import { interactionBroker } from '@/lib/interactions/broker.js';
import { internalBus } from '@/lib/internal-bus.js';
import * as Log from '@/lib/log.js';
import { QuestionAbortedError } from '@/llm/stream/errors.js';
import { QuestionNotFoundAfterCreateError } from '@/question/errors.js';

const log = Log.create({ service: 'question-service' });

type QuestionRow = typeof questions.$inferSelect;

function toQuestionRequest(row: QuestionRow): QuestionRequest {
  return { ...row, answers: row.answers ?? undefined, answeredAt: row.answeredAt ?? undefined };
}

function validateQuestionAnswers(question: QuestionRow, answers: string[][]): void {
  if (question.status !== 'pending') {
    throw new HTTPException(409, { message: 'Question has already been resolved' });
  }

  if (answers.length !== question.questions.length) {
    throw new HTTPException(400, { message: 'Answer count does not match question count' });
  }

  for (const [index, questionInfo] of question.questions.entries()) {
    const answer = answers[index] ?? [];
    const normalized = answer.map((value) => value.trim()).filter(Boolean);

    if (normalized.length === 0) {
      throw new HTTPException(400, { message: `Question ${index + 1} requires an answer` });
    }

    if (!questionInfo.multiple && normalized.length > 1) {
      throw new HTTPException(400, { message: `Question ${index + 1} only accepts one answer` });
    }

    if (questionInfo.custom === false) {
      const labels = new Set(questionInfo.options.map((option) => option.label));
      const invalid = normalized.find((value) => !labels.has(value));
      if (invalid) throw new HTTPException(400, { message: `Question ${index + 1} received an invalid answer` });
    }
  }
}

export async function createQuestion(opts: {
  sessionId: PrefixedString<'ses'>;
  questions: QuestionInfo[];
  toolCallId: string;
  messageId: PrefixedString<'msg'>;
}): Promise<QuestionRequest> {
  const db = getDb();
  const id = createQuestionId();
  const now = Date.now();

  const [row] = await db
    .insert(questions)
    .values({
      id,
      sessionId: opts.sessionId,
      questions: opts.questions,
      status: 'pending',
      toolCallId: opts.toolCallId,
      messageId: opts.messageId,
      createdAt: now,
    })
    .returning();

  return toQuestionRequest(row);
}

export async function askQuestion(opts: {
  sessionId: PrefixedString<'ses'>;
  questions: QuestionInfo[];
  toolCallId: string;
  messageId: PrefixedString<'msg'>;
  streamRunId?: string;
  abortSignal?: AbortSignal;
}): Promise<string[][]> {
  const db = getDb();
  const id = createQuestionId();
  const now = Date.now();

  log.info(
    {
      event: 'stream.question.requested',
      id,
      streamRunId: opts.streamRunId,
      sessionId: opts.sessionId,
      messageId: opts.messageId,
      toolCallId: opts.toolCallId,
      count: opts.questions.length,
    },
    'asking question',
  );

  const row = (
    await db
      .insert(questions)
      .values({
        id,
        sessionId: opts.sessionId,
        questions: opts.questions,
        status: 'pending',
        toolCallId: opts.toolCallId,
        messageId: opts.messageId,
        createdAt: now,
      })
      .returning()
  ).at(0);

  if (!row) {
    throw new QuestionNotFoundAfterCreateError(id);
  }

  internalBus.emit('question.asked', { question: toQuestionRequest(row) });

  return interactionBroker.wait<string[][]>({
    id,
    kind: 'question',
    sessionId: opts.sessionId,
    streamRunId: opts.streamRunId,
    abortSignal: opts.abortSignal,
    abortError: () => new QuestionAbortedError(),
  });
}

export async function replyQuestion(questionId: PrefixedString<'quest'>, answers: string[][]): Promise<void> {
  const db = getDb();
  const now = Date.now();

  const existingQuestion = (await db.select().from(questions).where(eq(questions.id, questionId))).at(0);
  if (!existingQuestion) {
    throw new HTTPException(404, { message: `Question not found: ${questionId}` });
  }

  validateQuestionAnswers(existingQuestion, answers);

  const [question] = await db
    .update(questions)
    .set({ answers, status: 'answered', answeredAt: now })
    .where(eq(questions.id, questionId))
    .returning();

  internalBus.emit('question.replied', { questionId, sessionId: question.sessionId, answers });

  const pending = interactionBroker.get(questionId);
  log.info(
    {
      event: 'stream.question.resolved',
      questionId,
      streamRunId: pending?.streamRunId,
      sessionId: question.sessionId,
      decision: 'answered',
    },
    'question resolved',
  );

  interactionBroker.resolve(questionId, answers);

  log.info({ questionId }, 'question replied');
}

export async function rejectQuestion(questionId: PrefixedString<'quest'>): Promise<void> {
  const db = getDb();
  const now = Date.now();

  const question = (await db.select().from(questions).where(eq(questions.id, questionId))).at(0);
  if (!question) {
    throw new HTTPException(404, { message: `Question not found: ${questionId}` });
  }

  await db.update(questions).set({ status: 'rejected', answeredAt: now }).where(eq(questions.id, questionId));

  internalBus.emit('question.rejected', { questionId, sessionId: question.sessionId });

  const pending = interactionBroker.get(questionId);
  log.info(
    {
      event: 'stream.question.resolved',
      questionId,
      streamRunId: pending?.streamRunId,
      sessionId: question.sessionId,
      decision: 'rejected',
    },
    'question resolved',
  );

  interactionBroker.reject(questionId, new Error('Question rejected by user'));

  log.info({ questionId }, 'question rejected');
}

export async function getPendingQuestions(sessionId: PrefixedString<'ses'>): Promise<QuestionRequest[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(questions)
    .where(and(eq(questions.sessionId, sessionId), eq(questions.status, 'pending')));

  return rows.map(toQuestionRequest);
}

/**
 * Reject all pending questions for a session.
 * Called when the session is aborted so tool execution is unblocked.
 */
export async function abortQuestions(sessionId: PrefixedString<'ses'>): Promise<void> {
  const db = getDb();
  const now = Date.now();

  const pendingRows = await db
    .select()
    .from(questions)
    .where(and(eq(questions.sessionId, sessionId), eq(questions.status, 'pending')));

  if (pendingRows.length === 0) return;

  await db
    .update(questions)
    .set({ status: 'rejected', answeredAt: now })
    .where(and(eq(questions.sessionId, sessionId), eq(questions.status, 'pending')));

  const aborted = interactionBroker.abortSession({
    sessionId,
    kind: 'question',
    error: new QuestionAbortedError('Question aborted by session abort'),
  });
  const streamRunIds = new Map(aborted.map((entry) => [entry.id, entry.streamRunId]));

  await Promise.all(
    pendingRows.map(async (q) => {
      const streamRunId = streamRunIds.get(q.id);
      internalBus.emit('question.rejected', { questionId: q.id, sessionId });

      log.info({ event: 'stream.question.aborted', streamRunId, sessionId, questionId: q.id }, 'question aborted');
    }),
  );

  log.info({ sessionId, count: pendingRows.length }, 'aborted pending questions');
}
