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

type LiveTranscriptState = { entries: LiveTranscriptEntry[]; counter: number };

const FLUSH_GRACE_MS = 2000;

export function useLiveTranscript(recordingId: string, isRecording: boolean) {
  const [transcript, setTranscript] = React.useState<LiveTranscriptState>({ entries: [], counter: 0 });

  // After recording stops, wait for flush then promote remaining partials
  React.useEffect(() => {
    if (isRecording) return;

    const timer = setTimeout(() => {
      setTranscript((current) => {
        if (!current.entries.some((entry) => entry.kind === 'partial')) return current;
        return {
          ...current,
          entries: current.entries.map((entry) =>
            entry.kind === 'partial' ? { ...entry, kind: 'final' as const } : entry,
          ),
        };
      });
    }, FLUSH_GRACE_MS);

    return () => clearTimeout(timer);
  }, [isRecording]);

  // Keep subscribing with the recordingId so we receive post-stop flush events
  useRecordingEvents(recordingId, {
    'recording.transcript.entry': (data) => {
      setTranscript((current) => {
        const { entries } = current;
        // Find existing partial from same source to replace
        const partialIdx = entries.findLastIndex((entry) => entry.source === data.source && entry.kind === 'partial');

        if (data.kind === 'partial') {
          const counter = partialIdx >= 0 ? current.counter : current.counter + 1;
          const entry: LiveTranscriptEntry = {
            id: partialIdx >= 0 ? entries[partialIdx].id : counter,
            source: data.source,
            speaker: data.speaker,
            content: data.content,
            offsetMs: data.offsetMs,
            kind: 'partial',
          };
          if (partialIdx >= 0) {
            const next = [...entries];
            next[partialIdx] = entry;
            return { entries: next, counter };
          }
          return { entries: [...entries, entry], counter };
        }

        // Final: replace the partial in-place to preserve chronological order,
        // or append if there was no partial for this source.
        const counter = current.counter + 1;
        const finalEntry: LiveTranscriptEntry = {
          id: counter,
          source: data.source,
          speaker: data.speaker,
          content: data.content,
          offsetMs: data.offsetMs,
          kind: 'final',
        };

        if (partialIdx >= 0) {
          const next = [...entries];
          next[partialIdx] = finalEntry;
          return { entries: next, counter };
        }

        return { entries: [...entries, finalEntry], counter };
      });
    },
  });

  return transcript.entries;
}
