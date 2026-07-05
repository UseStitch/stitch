import type { PrefixedString } from '../id/index.js';
import type { QuestionRequest } from './types.js';

export type QuestionAskedPayload = { question: QuestionRequest };

export type QuestionRepliedPayload = {
  questionId: PrefixedString<'quest'>;
  sessionId: PrefixedString<'ses'>;
  answers: string[][];
};

export type QuestionRejectedPayload = { questionId: PrefixedString<'quest'>; sessionId: PrefixedString<'ses'> };

export const QUESTION_EVENT_NAMES = ['question-asked', 'question-replied', 'question-rejected'] as const;

export type QuestionEvents = {
  'question-asked': QuestionAskedPayload;
  'question-replied': QuestionRepliedPayload;
  'question-rejected': QuestionRejectedPayload;
};
