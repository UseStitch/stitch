import * as React from 'react';

import type { RecordingTranscriptEntryPayload } from '@stitch/shared/chat/realtime';

import { useSSE } from '@/hooks/sse/sse-context';

type LiveTranscriptEntry = {
  id: number;
  source: 'mic' | 'speaker';
  speaker: string;
  content: string;
  timestamp: number;
  kind: 'partial' | 'final';
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

      if (data.kind === 'partial') {
        setEntries((prev) => {
          // Replace the last partial from the same source, or append if none
          const lastIdx = prev.findLastIndex(
            (e) => e.source === data.source && e.kind === 'partial',
          );
          const entry: LiveTranscriptEntry = {
            id: lastIdx >= 0 ? prev[lastIdx].id : ++counterRef.current,
            source: data.source,
            speaker: data.speaker,
            content: data.content,
            timestamp: Date.now(),
            kind: 'partial',
          };
          if (lastIdx >= 0) {
            const next = [...prev];
            next[lastIdx] = entry;
            return next;
          }
          return [...prev, entry];
        });
      } else {
        // Final: replace the last partial from same source with the final version
        counterRef.current += 1;
        const entry: LiveTranscriptEntry = {
          id: counterRef.current,
          source: data.source,
          speaker: data.speaker,
          content: data.content,
          timestamp: Date.now(),
          kind: 'final',
        };
        setEntries((prev) => {
          const lastPartialIdx = prev.findLastIndex(
            (e) => e.source === data.source && e.kind === 'partial',
          );
          if (lastPartialIdx >= 0) {
            const next = [...prev];
            next[lastPartialIdx] = entry;
            return next;
          }
          return [...prev, entry];
        });
      }
    },
  });

  return entries;
}
