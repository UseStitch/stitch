import { and, eq } from 'drizzle-orm';

import type { PrefixedString } from '@stitch/shared/id';
import { createQuestionId } from '@stitch/shared/id';
import type { QuestionInfo, QuestionRequest } from '@stitch/shared/questions/types';

import { getDb } from '@/db/client.js';
import { questions } from '@/db/schema.js';
import * as Events from '@/lib/events.js';
import { interactionBroker } from '@/lib/interactions/broker.js';
import * as Log from '@/lib/log.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { QuestionAbortedError } from '@/llm/stream/errors.js';

const log = Log.create({ service: 'question-service' });

type QuestionRow = typeof questions.$inferSelect;

function toQuestionRequest(row: QuestionRow): QuestionRequest {
  return {
    ...row,
    answers: row.answers ?? undefined,
    answeredAt: row.answeredAt ?? undefined,
  };
}

function validateQuestionAnswers(question: QuestionRow, answers: string[][]): ServiceResult<null> {
  if (question.status !== 'pending') {
    return err('Question has already been resolved', 409);
  }

  if (answers.length !== question.questions.length) {
    return err('Answer count does not match question count', 400);
  }

  for (const [index, questionInfo] of question.questions.entries()) {
    const answer = answers[index] ?? [];
    const normalized = answer.map((value) => value.trim()).filter(Boolean);

    if (normalized.length === 0) {
      return err(`Question ${index + 1} requires an answer`, 400);
    }

    if (!questionInfo.multiple && normalized.length > 1) {
      return err(`Question ${index + 1} only accepts one answer`, 400);
    }

    if (questionInfo.custom === false) {
      const labels = new Set(questionInfo.options.map((option) => option.label));
      const invalid = normalized.find((value) => !labels.has(value));
      if (invalid) return err(`Question ${index + 1} received an invalid answer`, 400);
    }
  }

  return ok(null);
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

  if (!row) {
    throw new Error(`Question not found after create: ${id}`);
  }

  Events.emit('question-asked', {
    question: toQuestionRequest(row),
  });

  return interactionBroker.wait<string[][]>({
    id,
    kind: 'question',
    sessionId: opts.sessionId,
    streamRunId: opts.streamRunId,
    abortSignal: opts.abortSignal,
    abortError: () => new QuestionAbortedError(),
  });
}

export async function replyQuestion(
  questionId: PrefixedString<'quest'>,
  answers: string[][],
): Promise<ServiceResult<null>> {
  const db = getDb();
  const now = Date.now();

  const [existingQuestion] = await db.select().from(questions).where(eq(questions.id, questionId));
  if (!existingQuestion) {
    return err(`Question not found: ${questionId}`, 404);
  }

  const validation = validateQuestionAnswers(existingQuestion, answers);
  if ('error' in validation) return validation;

  const [question] = await db
    .update(questions)
    .set({
      answers,
      status: 'answered',
      answeredAt: now,
    })
    .where(eq(questions.id, questionId))
    .returning();

  Events.emit('question-replied', {
    questionId,
    sessionId: question.sessionId,
    answers,
  });

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
  return ok(null);
}

export async function rejectQuestion(
  questionId: PrefixedString<'quest'>,
): Promise<ServiceResult<null>> {
  const db = getDb();
  const now = Date.now();

  const [question] = await db.select().from(questions).where(eq(questions.id, questionId));
  if (!question) {
    return err(`Question not found: ${questionId}`, 404);
  }

  await db
    .update(questions)
    .set({
      status: 'rejected',
      answeredAt: now,
    })
    .where(eq(questions.id, questionId));

  Events.emit('question-rejected', {
    questionId,
    sessionId: question.sessionId,
  });

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
  return ok(null);
}

export async function getPendingQuestions(
  sessionId: PrefixedString<'ses'>,
): Promise<QuestionRequest[]> {
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
      Events.emit('question-rejected', { questionId: q.id, sessionId });

      log.info(
        {
          event: 'stream.question.aborted',
          streamRunId,
          sessionId,
          questionId: q.id,
        },
        'question aborted',
      );
    }),
  );

  log.info({ sessionId, count: pendingRows.length }, 'aborted pending questions');
}
