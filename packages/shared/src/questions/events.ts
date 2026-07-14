import type { PrefixedString } from '../id/index.js';
import type { QuestionRequest } from './types.js';

type QuestionAskedPayload = { question: QuestionRequest };

type QuestionRepliedPayload = {
  questionId: PrefixedString<'quest'>;
  sessionId: PrefixedString<'ses'>;
  answers: string[][];
};

type QuestionRejectedPayload = { questionId: PrefixedString<'quest'>; sessionId: PrefixedString<'ses'> };

export const QUESTION_EVENT_NAMES = ['question.asked', 'question.replied', 'question.rejected'] as const;

export type QuestionEvents = {
  'question.asked': QuestionAskedPayload;
  'question.replied': QuestionRepliedPayload;
  'question.rejected': QuestionRejectedPayload;
};
