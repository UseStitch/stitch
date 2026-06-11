import { useQueryClient } from '@tanstack/react-query';

import { useSSE } from '@/hooks/sse/sse-context';

function useRecordingSync(): void {
  const queryClient = useQueryClient();

  useSSE({
    'recording-started': () => {
      void queryClient.invalidateQueries({ queryKey: ['recordings', 'list'] });
    },
    'recording-stopped': () => {
      void queryClient.invalidateQueries({ queryKey: ['recordings', 'list'] });
    },
    'recording-analysis-updated': ({ recordingId }) => {
      void queryClient.invalidateQueries({ queryKey: ['recordings', 'analysis', recordingId] });
    },
  });
}

/** Render-less component that keeps recording queries fresh via SSE push events. */
export function RecordingSync() {
  useRecordingSync();
  return null;
}
