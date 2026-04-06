import { and, eq } from 'drizzle-orm';

import type { PrefixedString } from '@stitch/shared/id';
import { createQuestionId } from '@stitch/shared/id';
import type { QuestionInfo, QuestionRequest } from '@stitch/shared/questions/types';

import { getDb } from '@/db/client.js';
import { questions } from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import { broadcast } from '@/lib/sse.js';
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

type PendingQuestion = {
  resolve: (answers: string[][]) => void;
  reject: (error: Error) => void;
  streamRunId?: string;
};

const pendingQuestions = new Map<PrefixedString<'quest'>, PendingQuestion>();

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

  await broadcast('question-asked', {
    question: toQuestionRequest(row),
  });

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      pendingQuestions.delete(id);
    };

    const abortHandler = () => {
      cleanup();
      reject(new QuestionAbortedError());
    };

    if (opts.abortSignal) {
      if (opts.abortSignal.aborted) {
        reject(new QuestionAbortedError());
        return;
      }
      opts.abortSignal.addEventListener('abort', abortHandler, { once: true });
    }

    pendingQuestions.set(id, { resolve, reject, streamRunId: opts.streamRunId });
  });
}

export async function replyQuestion(
  questionId: PrefixedString<'quest'>,
  answers: string[][],
): Promise<void> {
  const db = getDb();
  const now = Date.now();

  const [question] = await db
    .update(questions)
    .set({
      answers,
      status: 'answered',
      answeredAt: now,
    })
    .where(eq(questions.id, questionId))
    .returning();

  if (!question) {
    throw new Error(`Question not found: ${questionId}`);
  }

  await broadcast('question-replied', {
    questionId,
    sessionId: question.sessionId,
    answers,
  });

  const pending = pendingQuestions.get(questionId);
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

  if (pending) {
    pending.resolve(answers);
    pendingQuestions.delete(questionId);
  }

  log.info({ questionId }, 'question replied');
}

export async function rejectQuestion(questionId: PrefixedString<'quest'>): Promise<void> {
  const db = getDb();
  const now = Date.now();

  const [question] = await db.select().from(questions).where(eq(questions.id, questionId));
  if (!question) {
    throw new Error(`Question not found: ${questionId}`);
  }

  await db
    .update(questions)
    .set({
      status: 'rejected',
      answeredAt: now,
    })
    .where(eq(questions.id, questionId));

  await broadcast('question-rejected', {
    questionId,
    sessionId: question.sessionId,
  });

  const pending = pendingQuestions.get(questionId);
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

  if (pending) {
    pending.reject(new Error('Question rejected by user'));
    pendingQuestions.delete(questionId);
  }

  log.info({ questionId }, 'question rejected');
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

  await Promise.all(
    pendingRows.map(async (q) => {
      const entry = pendingQuestions.get(q.id);
      const streamRunId = entry?.streamRunId;
      if (entry) {
        entry.reject(new QuestionAbortedError('Question aborted by session abort'));
        pendingQuestions.delete(q.id);
      }
      await broadcast('question-rejected', { questionId: q.id, sessionId });

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
