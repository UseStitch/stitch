import * as React from 'react';

import type { RecordingTranscriptEntryPayload } from '@stitch/shared/chat/realtime';

import { useSSE } from '@/hooks/sse/sse-context';

type LiveTranscriptEntry = {
  id: number;
  source: 'mic' | 'speaker';
  speaker: string;
  content: string;
  timestamp: number;
};

export function useLiveTranscript(activeRecordingId: string | null) {
  const [entries, setEntries] = React.useState<LiveTranscriptEntry[]>([]);
  const counterRef = React.useRef(0);

  React.useEffect(() => {
    if (!activeRecordingId) {
      setEntries([]);
      counterRef.current = 0;
    }
  }, [activeRecordingId]);

  useSSE({
    'recording-transcript-entry': (data: RecordingTranscriptEntryPayload) => {
      if (!activeRecordingId || data.recordingId !== activeRecordingId) return;

      counterRef.current += 1;
      const entry: LiveTranscriptEntry = {
        id: counterRef.current,
        source: data.source,
        speaker: data.speaker,
        content: data.content,
        timestamp: Date.now(),
      };

      setEntries((prev) => [...prev, entry]);
    },
  });

  return entries;
}
