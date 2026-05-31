import { MessageSquareIcon } from 'lucide-react';
import * as React from 'react';

import type { RecordingAnalysis } from '@stitch/shared/recordings/types';

import { ScrollArea } from '@/components/ui/scroll-area';
import { useLiveTranscript } from '@/hooks/sse/use-live-transcript';

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
  const scrollEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isRecording && liveEntries.length > 0) {
      scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isRecording, liveEntries.length]);

  const hasStaticTranscript = Boolean(analysis?.transcript?.length);
  const showLive = isRecording && liveEntries.length > 0;

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

      <ScrollArea className="h-0 flex-1">
        <div className="space-y-4 p-5">
          {showLive ? (
            <>
              {liveEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={`group rounded-xl border border-border/40 bg-background px-4 py-3.5 shadow-sm transition-colors hover:border-border/80 ${
                    entry.source === 'mic' ? 'ml-2' : 'mr-2'
                  }`}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-xs font-bold tracking-wide text-primary/80 uppercase">
                      {entry.source === 'mic' ? 'You' : 'Them'}
                    </p>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/90">{entry.content}</p>
                </div>
              ))}
              <div ref={scrollEndRef} />
            </>
          ) : hasStaticTranscript ? (
            analysis!.transcript.map((entry, index) => (
              <div
                key={`${index}-${entry.speaker}`}
                className="group rounded-xl border border-border/40 bg-background px-4 py-3.5 shadow-sm transition-colors hover:border-border/80"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-xs font-bold tracking-wide text-primary/80 uppercase">
                    {entry.speaker}
                  </p>
                </div>
                <p className="text-sm leading-relaxed text-foreground/90">{entry.content}</p>
              </div>
            ))
          ) : (
            <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border/60 text-sm text-muted-foreground">
              {isRecording
                ? 'Waiting for transcription...'
                : isRunning
                  ? 'Analyzing recording...'
                  : 'No transcript generated yet.'}
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
