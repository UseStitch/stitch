import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type { QuestionRequest } from '@openwork/shared';

import { serverFetch } from '@/lib/api';

export const questionKeys = {
  all: ['questions'] as const,
  list: (sessionId: string) => [...questionKeys.all, 'list', sessionId] as const,
};

export function questionsQueryOptions(sessionId: string) {
  return queryOptions({
    queryKey: questionKeys.list(sessionId),
    queryFn: async (): Promise<QuestionRequest[]> => {
      const res = await serverFetch(`/chat/sessions/${sessionId}/questions`);
      if (!res.ok) throw new Error('Failed to fetch questions');
      return res.json() as Promise<QuestionRequest[]>;
    },
  });
}

type ReplyQuestionInput = {
  sessionId: string;
  questionId: string;
  answers: string[][];
};

type RejectQuestionInput = {
  sessionId: string;
  questionId: string;
};

export function useReplyQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ReplyQuestionInput) => {
      const res = await serverFetch(
        `/chat/sessions/${input.sessionId}/questions/${input.questionId}/reply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: input.answers }),
        },
      );
      if (!res.ok) throw new Error('Failed to reply to question');
      return res.json();
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: questionKeys.list(input.sessionId) });
    },
  });
}

export function useRejectQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RejectQuestionInput) => {
      const res = await serverFetch(
        `/chat/sessions/${input.sessionId}/questions/${input.questionId}/reject`,
        {
          method: 'POST',
        },
      );
      if (!res.ok) throw new Error('Failed to reject question');
      return res.json();
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: questionKeys.list(input.sessionId) });
    },
  });
}
