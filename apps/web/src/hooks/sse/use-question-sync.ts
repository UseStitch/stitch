import { useQueryClient } from '@tanstack/react-query';

import { useSSE } from '@/hooks/sse/sse-context';
import { questionKeys } from '@/lib/queries/questions';

export function useQuestionSync(sessionId: string): void {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: questionKeys.list(sessionId) });
  };

  useSSE({
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
