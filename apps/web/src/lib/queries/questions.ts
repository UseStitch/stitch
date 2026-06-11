import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type { QuestionRequest } from '@stitch/shared/questions/types';

import { serverRequest } from '@/lib/api';

export const questionKeys = {
  all: ['questions'] as const,
  list: (sessionId: string) => [...questionKeys.all, 'list', sessionId] as const,
};

export function questionsQueryOptions(sessionId: string) {
  return queryOptions({
    queryKey: questionKeys.list(sessionId),
    queryFn: () => serverRequest<QuestionRequest[]>(`/chat/sessions/${sessionId}/questions`),
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
    mutationFn: (input: ReplyQuestionInput) =>
      serverRequest<unknown>(
        `/chat/sessions/${input.sessionId}/questions/${input.questionId}/reply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: input.answers }),
        },
      ),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: questionKeys.list(input.sessionId) });
    },
  });
}

export function useRejectQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RejectQuestionInput) =>
      serverRequest<unknown>(
        `/chat/sessions/${input.sessionId}/questions/${input.questionId}/reject`,
        {
          method: 'POST',
        },
      ),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: questionKeys.list(input.sessionId) });
    },
  });
}
