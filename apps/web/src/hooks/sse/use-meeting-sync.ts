import { useSSE } from '@/hooks/sse/sse-context';
import { useMeetingStore } from '@/stores/meeting-store';

function useMeetingSync(): void {
  const { setDetected, setFinished, clear } = useMeetingStore();

  useSSE({
    'meeting-detected': (data) => {
      setDetected(data.meetingId, data.app, data.startedAt);
    },
    'meeting-recording-finished': (data) => {
      setFinished(data.durationSecs);
    },
    'meeting-ended': () => {
      clear();
    },
  });
}

/** Renderless component that syncs meeting SSE events to the Zustand store. */
export function MeetingSync() {
  useMeetingSync();
  return null;
}
