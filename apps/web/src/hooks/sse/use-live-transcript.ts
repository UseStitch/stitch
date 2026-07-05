import * as React from 'react';

import { useRecordingEvents } from '@/hooks/sse/sse-context';

type LiveTranscriptEntry = {
  id: number;
  source: 'mic' | 'speaker';
  speaker: string;
  content: string;
  offsetMs: number;
  kind: 'partial' | 'final';
};

const FLUSH_GRACE_MS = 2000;

export function useLiveTranscript(recordingId: string, isRecording: boolean) {
  const [entries, setEntries] = React.useState<LiveTranscriptEntry[]>([]);
  const counterRef = React.useRef(0);
  const prevRecordingIdRef = React.useRef(recordingId);

  // Clear entries when switching to a different recording
  React.useEffect(() => {
    const prev = prevRecordingIdRef.current;
    prevRecordingIdRef.current = recordingId;

    if (recordingId !== prev) {
      setEntries([]);
      counterRef.current = 0;
    }
  }, [recordingId]);

  // After recording stops, wait for flush then promote remaining partials
  React.useEffect(() => {
    if (isRecording) return;

    const timer = setTimeout(() => {
      setEntries((current) => {
        if (!current.some((e) => e.kind === 'partial')) return current;
        return current.map((e) => (e.kind === 'partial' ? { ...e, kind: 'final' as const } : e));
      });
    }, FLUSH_GRACE_MS);

    return () => clearTimeout(timer);
  }, [isRecording]);

  // Keep subscribing with the recordingId so we receive post-stop flush events
  useRecordingEvents(recordingId, {
    'recording-transcript-entry': (data) => {
      setEntries((prev) => {
        // Find existing partial from same source to replace
        const partialIdx = prev.findLastIndex((e) => e.source === data.source && e.kind === 'partial');

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

        // Final: replace the partial in-place to preserve chronological order,
        // or append if there was no partial for this source.
        counterRef.current += 1;
        const finalEntry: LiveTranscriptEntry = {
          id: counterRef.current,
          source: data.source,
          speaker: data.speaker,
          content: data.content,
          offsetMs: data.offsetMs,
          kind: 'final',
        };

        if (partialIdx >= 0) {
          const next = [...prev];
          next[partialIdx] = finalEntry;
          return next;
        }

        return [...prev, finalEntry];
      });
    },
  });

  return entries;
}
