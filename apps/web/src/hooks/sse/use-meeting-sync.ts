import { useQueryClient } from '@tanstack/react-query';

import { useSSE } from '@/hooks/sse/sse-context';
import { meetingKeys } from '@/lib/queries/meetings';
import { useMeetingStore } from '@/stores/meeting-store';

function useMeetingSync(): void {
  const { setDetected, setFinished, clear } = useMeetingStore();
  const queryClient = useQueryClient();

  useSSE({
    'meeting-detected': (data) => {
      setDetected(data.meetingId, data.app, data.startedAt);
      void queryClient.invalidateQueries({ queryKey: meetingKeys.list() });
    },
    'meeting-recording-finished': (data) => {
      setFinished(data.durationSecs);
      void queryClient.invalidateQueries({ queryKey: meetingKeys.list() });
    },
    'meeting-ended': () => {
      clear();
      void queryClient.invalidateQueries({ queryKey: meetingKeys.list() });
    },
  });
}

/** Renderless component that syncs meeting SSE events to the Zustand store. */
export function MeetingSync() {
  useMeetingSync();
  return null;
}
