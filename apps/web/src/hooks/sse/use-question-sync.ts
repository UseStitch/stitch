import { useQueryClient } from '@tanstack/react-query';

import { useSessionEvents } from '@/hooks/sse/sse-context';
import { questionKeys } from '@/lib/queries/questions';

export function useQuestionSync(sessionId: string): void {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: questionKeys.list(sessionId) });
  };

  useSessionEvents(sessionId, {
    'question-asked': () => {
      invalidate();
    },
    'question-replied': () => {
      invalidate();
    },
    'question-rejected': () => {
      invalidate();
    },
  });
}
