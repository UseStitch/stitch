import { useQueryClient } from '@tanstack/react-query';

import { useSSE } from '@/hooks/sse/sse-context';

function useRecordingAnalysisSync(): void {
  const queryClient = useQueryClient();

  useSSE({
    'recording-analysis-updated': () => {
      void queryClient.invalidateQueries({ queryKey: ['recordings'] });
    },
  });
}

/** Render-less component that refreshes recording queries on analysis status changes. */
export function RecordingAnalysisSync() {
  useRecordingAnalysisSync();
  return null;
}
