import { MessageSquareIcon } from 'lucide-react';
import * as React from 'react';

import { useVirtualizer } from '@tanstack/react-virtual';

import type { RecordingAnalysis } from '@stitch/shared/recordings/types';

import { Icon } from '@/components/primitives/icon';
import { Text } from '@/components/primitives/text';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { StatusDot } from '@/components/ui/status-dot';
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

export function TranscriptSidebar({ analysis, isRunning, recordingId, isRecording }: TranscriptSidebarProps) {
  const liveEntries = useLiveTranscript(recordingId, isRecording);
  const scrollParentRef = React.useRef<HTMLDivElement>(null);

  const staticTranscript = analysis?.transcript;
  const hasStaticTranscript = staticTranscript && staticTranscript.length > 0;
  const showLive = liveEntries.length > 0 && !hasStaticTranscript;
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
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-sunken shadow-inner">
      <div className="shrink-0 border-b border-border-subtle bg-surface-sunken px-space-xl py-space-xl">
        <h2 className="flex items-center text-sm font-semibold tracking-wide text-foreground">
          <span className="mr-space-m">
            <Icon as={MessageSquareIcon} size="m" color="var(--muted-foreground)" />
          </span>
          {isRecording ? 'Live Transcript' : 'Full Transcript'}
          {showLive ? <StatusDot color="destructive" pulse className="ml-space-m" /> : null}
        </h2>
      </div>

      <div ref={scrollParentRef} className="thin-scrollbar h-0 flex-1 overflow-y-auto">
        {hasTranscript ? (
          <div className="relative px-space-xl" style={{ height: `${rowVirtualizer.getTotalSize() + 40}px` }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const entry = entries[virtualRow.index];

              return entry ? (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  className="pb-space-xl"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: '1.25rem',
                    right: '1.25rem',
                    transform: `translateY(${virtualRow.start + 20}px)`,
                  }}>
                  <div
                    className={`group rounded-xl border border-border-subtle bg-background px-space-xl py-space-l shadow-sm transition-colors hover:border-border-subtle ${
                      entry.source === 'mic' ? 'ml-space-m' : entry.source === 'speaker' ? 'mr-space-m' : ''
                    }`}>
                    <div className="mb-space-s flex items-center justify-between">
                      <div className="tracking-wide uppercase">
                        <Text variant="label" tone="primary">
                          {entry.speaker}
                        </Text>
                      </div>
                    </div>
                    {entry.isPartial ? (
                      <div className="italic">
                        <Text variant="body" tone="muted">
                          {entry.content}
                        </Text>
                      </div>
                    ) : (
                      <Text variant="body">{entry.content}</Text>
                    )}
                  </div>
                </div>
              ) : null;
            })}
          </div>
        ) : (
          <div className="p-space-xl">
            <Empty surface="bordered" size="compact" className="h-32">
              <EmptyDescription>
                {isRecording
                  ? 'Waiting for transcription...'
                  : isRunning
                    ? 'Analyzing recording...'
                    : 'No transcript generated yet.'}
              </EmptyDescription>
            </Empty>
          </div>
        )}
      </div>
    </aside>
  );
}
