import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquareIcon } from 'lucide-react';
import type { RecordingAnalysis } from '@stitch/shared/recordings/types';

interface TranscriptSidebarProps {
  analysis: RecordingAnalysis | null | undefined;
  isRunning: boolean;
}

export function TranscriptSidebar({ analysis, isRunning }: TranscriptSidebarProps) {
  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-muted/20 shadow-inner">
      {/* Sidebar Header */}
      <div className="shrink-0 border-b border-border/50 bg-muted/30 px-5 py-4">
        <h2 className="flex items-center text-sm font-semibold tracking-wide text-foreground">
          <MessageSquareIcon className="mr-2 size-4 text-muted-foreground" />
          Full Transcript
        </h2>
      </div>

      {/* Sidebar Content (Scrollable) */}
      <ScrollArea className="flex-1" style={{ height: 0 }}>
        <div className="space-y-4 p-5">
          {analysis?.transcript?.length ? (
            analysis.transcript.map((entry, index) => (
              <div 
                key={`${index}-${entry.speaker}`} 
                className="group rounded-xl border border-border/40 bg-background px-4 py-3.5 shadow-sm transition-colors hover:border-border/80"
              >
                <div className="mb-1.5 flex items-center justify-between">
                   <p className="text-xs font-bold tracking-wide text-primary/80 uppercase">{entry.speaker}</p>
                </div>
                <p className="text-sm leading-relaxed text-foreground/90">{entry.content}</p>
              </div>
            ))
          ) : (
            <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border/60 text-sm text-muted-foreground">
              {isRunning ? 'Analyzing recording...' : 'No transcript generated yet.'}
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
