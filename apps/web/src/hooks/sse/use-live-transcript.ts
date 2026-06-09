import * as React from 'react';

import type { RecordingTranscriptEntryPayload } from '@stitch/shared/chat/realtime';

import { useSSE } from '@/hooks/sse/sse-context';

type LiveTranscriptEntry = {
  id: number;
  source: 'mic' | 'speaker';
  speaker: string;
  content: string;
  offsetMs: number;
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
            offsetMs: data.offsetMs,
            kind: 'partial',
          };
          if (partialIdx >= 0) {
            const next = [...prev];
            next[partialIdx] = entry;
            return next;
          }
          return [...prev, entry];
        }

        // Final: remove the partial being replaced (if any)
        const withoutPartial = partialIdx >= 0 ? prev.filter((_, i) => i !== partialIdx) : prev;

        // Each final from the STT provider is a distinct committed utterance.
        // Never merge across commit boundaries — append as a new entry.
        counterRef.current += 1;
        return [
          ...withoutPartial,
          {
            id: counterRef.current,
            source: data.source,
            speaker: data.speaker,
            content: data.content,
            offsetMs: data.offsetMs,
            kind: 'final',
          },
        ];
      });
    },
  });

  return entries;
}
