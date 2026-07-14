import type { PrefixedString } from '../id/index.js';

type QuestionOption = { label: string; description: string };

export type QuestionInfo = {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
};

const QUESTION_REQUEST_STATUSES = ['pending', 'answered', 'rejected'] as const;

export type QuestionRequestStatus = (typeof QUESTION_REQUEST_STATUSES)[number];

export type QuestionRequest = {
  id: PrefixedString<'quest'>;
  sessionId: PrefixedString<'ses'>;
  questions: QuestionInfo[];
  toolCallId: string;
  messageId: PrefixedString<'msg'>;
  status: QuestionRequestStatus;
  answers?: string[][];
  createdAt: number;
  answeredAt?: number;
};
