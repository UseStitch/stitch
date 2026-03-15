import { useQueryClient } from '@tanstack/react-query';

import { useSSE } from '@/hooks/sse/sse-context';
import { questionKeys } from '@/lib/queries/questions';

export function useQuestionSync(sessionId: string): void {
  const queryClient = useQueryClient();

  const invalidate = (incomingSessionId: string) => {
    if (incomingSessionId !== sessionId) return;
    void queryClient.invalidateQueries({ queryKey: questionKeys.list(sessionId) });
  };

  useSSE({
    'question-asked': (data) => {
      const payload = data as { question: { sessionId: string } };
      invalidate(payload.question?.sessionId);
    },
    'question-replied': (data) => {
      const payload = data as { sessionId: string };
      invalidate(payload.sessionId);
    },
    'question-rejected': (data) => {
      const payload = data as { sessionId: string };
      invalidate(payload.sessionId);
    },
  });
}
