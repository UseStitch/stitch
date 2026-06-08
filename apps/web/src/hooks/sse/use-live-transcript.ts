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

      setEntries((prev) => {
        // Find existing partial from same source to replace
        const partialIdx = prev.findLastIndex(
          (e) => e.source === data.source && e.kind === 'partial',
        );

        if (data.kind === 'partial') {
          const entry: LiveTranscriptEntry = {
            id: partialIdx >= 0 ? prev[partialIdx].id : ++counterRef.current,
            source: data.source,
            speaker: data.speaker,
            content: data.content,
            timestamp: Date.now(),
            kind: 'partial',
          };
          if (partialIdx >= 0) {
            const next = [...prev];
            next[partialIdx] = entry;
            return next;
          }
          // No existing partial — merge into last entry if same speaker
          const lastEntry = prev[prev.length - 1];
          if (lastEntry && lastEntry.speaker === data.speaker) {
            const next = [...prev];
            next[next.length - 1] = {
              ...entry,
              id: lastEntry.id,
              content: lastEntry.content + ' ' + data.content,
            };
            return next;
          }
          return [...prev, entry];
        }

        // Final: remove the partial being replaced (if any)
        const withoutPartial = partialIdx >= 0 ? prev.filter((_, i) => i !== partialIdx) : prev;

        // Merge with the last entry if same speaker
        const lastEntry = withoutPartial[withoutPartial.length - 1];
        if (lastEntry && lastEntry.speaker === data.speaker) {
          const next = [...withoutPartial];
          next[next.length - 1] = {
            ...lastEntry,
            content: lastEntry.content + ' ' + data.content,
            timestamp: Date.now(),
            kind: 'final',
          };
          return next;
        }

        counterRef.current += 1;
        return [
          ...withoutPartial,
          {
            id: counterRef.current,
            source: data.source,
            speaker: data.speaker,
            content: data.content,
            timestamp: Date.now(),
            kind: 'final',
          },
        ];
      });
    },
  });

  return entries;
}
