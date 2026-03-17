import { eq } from 'drizzle-orm';

import type { PrefixedString } from '@openwork/shared';
import type { QuestionInfo, QuestionRequest } from '@openwork/shared';
import { createQuestionId } from '@openwork/shared';

import { getDb } from '@/db/client.js';
import { questions } from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import { broadcast } from '@/lib/sse.js';
import { QuestionAbortedError } from '@/lib/stream-errors.js';

const log = Log.create({ service: 'question-service' });

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
  const now = new Date();

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

  await db.insert(questions).values({
    id,
    sessionId: opts.sessionId,
    questions: opts.questions,
    status: 'pending',
    toolCallId: opts.toolCallId,
    messageId: opts.messageId,
    createdAt: now,
  });

  const [row] = await db.select().from(questions).where(eq(questions.id, id));

  await broadcast('question-asked', {
    question: row,
  });

  return new Promise((resolve, reject) => {
    let pollInterval: ReturnType<typeof setInterval>;

    const cleanup = () => {
      clearInterval(pollInterval);
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

    pollInterval = setInterval(async () => {
      const db = getDb();
      const [q] = await db.select().from(questions).where(eq(questions.id, id));

      if (!q) {
        opts.abortSignal?.removeEventListener('abort', abortHandler);
        cleanup();
        reject(new Error('Question not found'));
        return;
      }

      if (q.status === 'answered') {
        opts.abortSignal?.removeEventListener('abort', abortHandler);
        cleanup();
        resolve((q.answers as string[][] | undefined) ?? []);
        return;
      }

      if (q.status === 'rejected') {
        opts.abortSignal?.removeEventListener('abort', abortHandler);
        cleanup();
        reject(new Error('Question rejected by user'));
        return;
      }
    }, 1000);
  });
}

export async function replyQuestion(
  questionId: PrefixedString<'quest'>,
  answers: string[][],
): Promise<void> {
  const db = getDb();
  const now = new Date();

  await db
    .update(questions)
    .set({
      answers,
      status: 'answered',
      answeredAt: now,
    })
    .where(eq(questions.id, questionId));

  const [question] = await db.select().from(questions).where(eq(questions.id, questionId));

  await broadcast('question-replied', {
    questionId,
    sessionId: question?.sessionId ?? '',
    answers,
  });

  const pending = pendingQuestions.get(questionId);
  log.info(
    {
      event: 'stream.question.resolved',
      questionId,
      streamRunId: pending?.streamRunId,
      sessionId: question?.sessionId ?? '',
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
  const now = new Date();

  const [question] = await db.select().from(questions).where(eq(questions.id, questionId));

  await db
    .update(questions)
    .set({
      status: 'rejected',
      answeredAt: now,
    })
    .where(eq(questions.id, questionId));

  await broadcast('question-rejected', {
    questionId,
    sessionId: question?.sessionId ?? '',
  });

  const pending = pendingQuestions.get(questionId);
  log.info(
    {
      event: 'stream.question.resolved',
      questionId,
      streamRunId: pending?.streamRunId,
      sessionId: question?.sessionId ?? '',
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
  const rows = await db.select().from(questions).where(eq(questions.sessionId, sessionId));

  return rows.filter((q) => q.status === 'pending') as QuestionRequest[];
}

/**
 * Reject all pending questions for a session.
 * Called when the session is aborted so tool execution is unblocked.
 */
export async function abortQuestions(sessionId: PrefixedString<'ses'>): Promise<void> {
  const db = getDb();
  const now = new Date();

  const pending = await db.select().from(questions).where(eq(questions.sessionId, sessionId));

  const pendingRows = pending.filter((q) => q.status === 'pending');
  if (pendingRows.length === 0) return;

  await db
    .update(questions)
    .set({ status: 'rejected', answeredAt: now })
    .where(eq(questions.sessionId, sessionId));

  for (const q of pendingRows) {
    const entry = pendingQuestions.get(q.id as PrefixedString<'quest'>);
    const streamRunId = entry?.streamRunId;
    if (entry) {
      entry.reject(new QuestionAbortedError('Question aborted by session abort'));
      pendingQuestions.delete(q.id as PrefixedString<'quest'>);
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
  }

  log.info({ sessionId, count: pendingRows.length }, 'aborted pending questions');
}
