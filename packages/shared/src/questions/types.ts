import { z } from 'zod';

import type { PrefixedString } from '../id/index.js';

const QuestionOptionSchema = z
  .object({
    label: z.string().describe('Display text (1-5 words, concise)'),
    description: z.string().describe('Explanation of choice'),
  })
  .describe('A single answer option for a question');

export const QuestionInfoSchema = z
  .object({
    question: z.string().describe('Complete question'),
    header: z.string().describe('Very short label (max 30 chars)'),
    options: z.array(QuestionOptionSchema).describe('Available choices'),
    multiple: z.boolean().optional().describe('Allow selecting multiple choices'),
    custom: z.boolean().optional().describe('Allow typing a custom answer (default: true)'),
  })
  .describe('Information about a question to ask the user');

export type QuestionInfo = z.infer<typeof QuestionInfoSchema>;

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
