import type { PrefixedString } from '../id/index.js';

export type QuestionOption = {
  label: string;
  description: string;
};

export type QuestionInfo = {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
};

export const QUESTION_REQUEST_STATUSES = ['pending', 'answered', 'rejected'] as const;

export type QuestionRequestStatus = (typeof QUESTION_REQUEST_STATUSES)[number];

export type QuestionRequest = {
  id: PrefixedString<'quest'>;
  sessionId: PrefixedString<'ses'>;
  questions: QuestionInfo[];
  toolCallId: string;
  messageId: PrefixedString<'msg'>;
  status: QuestionRequestStatus;
  answers?: string[][];
  subAgentId?: PrefixedString<'agt'>;
  createdAt: number;
  answeredAt?: number;
};

export type QuestionReply = {
  answers: string[][];
};

export type QuestionReject = Record<string, never>;
