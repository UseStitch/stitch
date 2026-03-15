import { eq } from 'drizzle-orm';
import type { PrefixedString } from '@openwork/shared';
import type { QuestionInfo, QuestionRequest } from '@openwork/shared';
import { getDb } from '../db/client.js';
import { questions } from '../db/schema.js';
import { broadcast } from '../lib/sse.js';
import * as Log from '../lib/log.js';
import { createQuestionId } from '@openwork/shared';

const log = Log.create({ service: 'question-service' });

type PendingQuestion = {
  resolve: (answers: string[][]) => void;
  reject: (error: Error) => void;
};

const pendingQuestions = new Map<PrefixedString<'quest'>, PendingQuestion>();

export async function askQuestion(opts: {
  sessionId: PrefixedString<'ses'>;
  questions: QuestionInfo[];
  toolCallId: string;
  messageId: PrefixedString<'msg'>;
}): Promise<string[][]> {
  const db = getDb();
  const id = createQuestionId();
  const now = new Date();

  log.info('asking question', { id, sessionId: opts.sessionId, count: opts.questions.length });

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
    pendingQuestions.set(id, { resolve, reject });

    const pollInterval = setInterval(async () => {
      const db = getDb();
      const [q] = await db.select().from(questions).where(eq(questions.id, id));

      if (!q) {
        clearInterval(pollInterval);
        pendingQuestions.delete(id);
        reject(new Error('Question not found'));
        return;
      }

      if (q.status === 'answered') {
        clearInterval(pollInterval);
        pendingQuestions.delete(id);
        resolve((q.answers as string[][] | undefined) ?? []);
        return;
      }

      if (q.status === 'rejected') {
        clearInterval(pollInterval);
        pendingQuestions.delete(id);
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
  if (pending) {
    pending.resolve(answers);
    pendingQuestions.delete(questionId);
  }

  log.info('question replied', { questionId });
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
  if (pending) {
    pending.reject(new Error('Question rejected by user'));
    pendingQuestions.delete(questionId);
  }

  log.info('question rejected', { questionId });
}

export async function getPendingQuestions(
  sessionId: PrefixedString<'ses'>,
): Promise<QuestionRequest[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(questions)
    .where(eq(questions.sessionId, sessionId));

  return rows.filter((q) => q.status === 'pending') as QuestionRequest[];
}
