import { MessageSquareIcon } from 'lucide-react';
import * as React from 'react';

import { useVirtualizer } from '@tanstack/react-virtual';

import type { RecordingAnalysis } from '@stitch/shared/recordings/types';

import { useLiveTranscript } from '@/hooks/sse/use-live-transcript';

function occurrenceKey(value: string, counts: Map<string, number>): string {
  const count = counts.get(value) ?? 0;
  counts.set(value, count + 1);
  return count === 0 ? value : `${value}-${count}`;
}

type TranscriptEntryView = {
  key: string;
  source: 'mic' | 'speaker' | null;
  speaker: string;
  content: string;
  isPartial: boolean;
};

interface TranscriptSidebarProps {
  analysis: RecordingAnalysis | null | undefined;
  isRunning: boolean;
  recordingId: string;
  isRecording: boolean;
}

export function TranscriptSidebar({
  analysis,
  isRunning,
  recordingId,
  isRecording,
}: TranscriptSidebarProps) {
  const liveEntries = useLiveTranscript(isRecording ? recordingId : null);
  const scrollParentRef = React.useRef<HTMLDivElement>(null);

  const staticTranscript = analysis?.transcript;
  const showLive = isRecording && liveEntries.length > 0;
  const entries = React.useMemo<TranscriptEntryView[]>(() => {
    if (showLive) {
      return liveEntries.map((entry) => ({
        key: String(entry.id),
        source: entry.source,
        speaker: entry.speaker,
        content: entry.content,
        isPartial: entry.kind === 'partial',
      }));
    }

    const keyCounts = new Map<string, number>();
    return (staticTranscript ?? []).map((entry) => ({
      key: occurrenceKey(`${entry.speaker}:${entry.content}`, keyCounts),
      source: null,
      speaker: entry.speaker,
      content: entry.content,
      isPartial: false,
    }));
  }, [liveEntries, showLive, staticTranscript]);

  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 112,
    getItemKey: (index) => entries[index]?.key ?? index,
    overscan: 8,
  });

  React.useEffect(() => {
    if (showLive && entries.length > 0) {
      rowVirtualizer.scrollToIndex(entries.length - 1, { align: 'end' });
    }
  }, [entries.length, rowVirtualizer, showLive]);

  const hasTranscript = entries.length > 0;

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-muted/20 shadow-inner">
      <div className="shrink-0 border-b border-border/50 bg-muted/30 px-5 py-4">
        <h2 className="flex items-center text-sm font-semibold tracking-wide text-foreground">
          <MessageSquareIcon className="mr-2 size-4 text-muted-foreground" />
          {isRecording ? 'Live Transcript' : 'Full Transcript'}
          {showLive ? (
            <span className="ml-2 inline-flex size-2 animate-pulse rounded-full bg-destructive" />
          ) : null}
        </h2>
      </div>

      <div ref={scrollParentRef} className="thin-scrollbar h-0 flex-1 overflow-y-auto">
        {hasTranscript ? (
          <div
            className="relative px-5"
            style={{ height: `${rowVirtualizer.getTotalSize() + 40}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const entry = entries[virtualRow.index];

              return entry ? (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  className="pb-4"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: '1.25rem',
                    right: '1.25rem',
                    transform: `translateY(${virtualRow.start + 20}px)`,
                  }}
                >
                  <div
                    className={`group rounded-xl border border-border/40 bg-background px-4 py-3.5 shadow-sm transition-colors hover:border-border/80 ${
                      entry.source === 'mic' ? 'ml-2' : entry.source === 'speaker' ? 'mr-2' : ''
                    }`}
                  >
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-xs font-bold tracking-wide text-primary/80 uppercase">
                        {entry.speaker}
                      </p>
                    </div>
                    <p
                      className={`text-sm leading-relaxed ${entry.isPartial ? 'text-foreground/60 italic' : 'text-foreground/90'}`}
                    >
                      {entry.content}
                    </p>
                  </div>
                </div>
              ) : null;
            })}
          </div>
        ) : (
          <div className="p-5">
            <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border/60 text-sm text-muted-foreground">
              {isRecording
                ? 'Waiting for transcription...'
                : isRunning
                  ? 'Analyzing recording...'
                  : 'No transcript generated yet.'}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
