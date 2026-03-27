import { CheckIcon, CopyIcon, FileTextIcon, Loader2Icon, SparklesIcon } from 'lucide-react';
import * as React from 'react';
import ReactMarkdown from 'react-markdown';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { formatCost } from '@/components/recordings/recording-detail/formatting';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSSE } from '@/hooks/sse/sse-context';
import { meetingKeys, transcriptionQueryOptions } from '@/lib/queries/meetings';

export function TranscriptionSection({ meetingId }: { meetingId: string }) {
  const queryClient = useQueryClient();
  const { data: transcription, isLoading } = useQuery(transcriptionQueryOptions(meetingId));
  const [copiedSummary, setCopiedSummary] = React.useState(false);
  const [copiedTranscript, setCopiedTranscript] = React.useState(false);

  useSSE({
    'transcription-started': (data) => {
      if (data.meetingId === meetingId) {
        void queryClient.invalidateQueries({
          queryKey: meetingKeys.transcription(meetingId),
        });
      }
    },
    'transcription-completed': (data) => {
      if (data.meetingId === meetingId) {
        void queryClient.invalidateQueries({
          queryKey: meetingKeys.transcription(meetingId),
        });
      }
    },
    'transcription-failed': (data) => {
      if (data.meetingId === meetingId) {
        void queryClient.invalidateQueries({
          queryKey: meetingKeys.transcription(meetingId),
        });
      }
    },
  });

  const isTranscribing =
    transcription?.status === 'pending' || transcription?.status === 'processing';

  React.useEffect(() => {
    if (!copiedSummary) return;
    const timeoutId = setTimeout(() => setCopiedSummary(false), 1200);
    return () => clearTimeout(timeoutId);
  }, [copiedSummary]);

  React.useEffect(() => {
    if (!copiedTranscript) return;
    const timeoutId = setTimeout(() => setCopiedTranscript(false), 1200);
    return () => clearTimeout(timeoutId);
  }, [copiedTranscript]);

  if (isLoading || isTranscribing || !transcription || transcription.status !== 'completed') {
    return (
      <div className="grid h-full grid-cols-1 items-start gap-6 lg:grid-cols-4">
        <div className="w-full space-y-5 lg:sticky lg:top-0 lg:col-span-3">
          <div className="space-y-4 rounded-lg border border-border/50 bg-muted/30 p-4">
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2Icon className="size-3 animate-spin" />
                <span>Loading transcription...</span>
              </div>
            )}
            {isTranscribing && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2Icon className="size-3.5 animate-spin text-primary" />
                <span className="font-medium text-foreground">Transcribing...</span>
              </div>
            )}
            {transcription?.status === 'failed' && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                Transcription failed: {transcription.errorMessage ?? 'Unknown error'}
              </div>
            )}
            {(!transcription || transcription.status === 'failed') &&
              !isLoading &&
              !isTranscribing && (
                <div className="py-2 text-sm text-muted-foreground">
                  Click transcribe in the header to generate a transcription.
                </div>
              )}
          </div>
        </div>
        <div className="flex min-h-100 w-full min-w-0 items-center justify-center rounded-lg border border-border/50 bg-muted/10 p-8 lg:col-span-1">
          <p className="text-sm text-muted-foreground">
            {isTranscribing ? 'Transcription in progress...' : 'Transcript will appear here'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-1 items-start gap-6 lg:grid-cols-4">
      <div className="w-full space-y-5 lg:sticky lg:top-0 lg:col-span-3">
        <div className="flex max-h-[60vh] w-full flex-col overflow-hidden rounded-lg border border-border/50 bg-muted/30 shadow-sm lg:h-[calc(100vh-200px)] lg:max-h-none">
          <div className="flex shrink-0 items-center gap-2 border-b border-border/50 bg-muted/20 px-4 py-3">
            <SparklesIcon className="size-4 shrink-0 text-primary" />
            <span className="text-sm font-medium">Summary</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="ml-auto text-muted-foreground hover:text-foreground"
              disabled={!transcription.summary}
              onClick={() => {
                if (!transcription.summary) return;
                if (typeof navigator === 'undefined' || navigator.clipboard === null) return;

                void navigator.clipboard.writeText(transcription.summary).then(() => {
                  setCopiedSummary(true);
                });
              }}
              title={copiedSummary ? 'Copied' : 'Copy summary'}
              aria-label={copiedSummary ? 'Copied' : 'Copy summary'}
            >
              {copiedSummary ? (
                <CheckIcon className="size-3.5 text-success" />
              ) : (
                <CopyIcon className="size-3.5" />
              )}
            </Button>
            {transcription.costUsd > 0 && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {formatCost(transcription.costUsd)}
              </span>
            )}
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="p-4 sm:p-6">
              {transcription.summary && (
                <div className="prose prose-sm max-w-none text-muted-foreground dark:prose-invert">
                  <ReactMarkdown>{transcription.summary}</ReactMarkdown>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      <div className="flex max-h-[60vh] w-full min-w-0 flex-col overflow-hidden rounded-lg border border-border/50 bg-background shadow-sm lg:sticky lg:top-0 lg:col-span-1 lg:h-[calc(100vh-200px)] lg:max-h-none">
        <div className="flex shrink-0 items-center gap-2 border-b border-border/50 bg-muted/20 px-4 py-3">
          <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium">Transcript</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="ml-auto text-muted-foreground hover:text-foreground"
            onClick={() => {
              if (typeof navigator === 'undefined' || navigator.clipboard === null) return;

              const transcriptText = transcription.transcript
                .map((entry) => `${entry.speaker}: ${entry.content}`)
                .join('\n');

              const sections = [
                transcription.title ? `Title\n${transcription.title}` : null,
                transcription.summary ? `Summary\n${transcription.summary}` : null,
                transcriptText ? `Transcript\n${transcriptText}` : null,
              ].filter((section): section is string => section !== null);

              const payload = sections.join('\n\n');
              void navigator.clipboard.writeText(payload).then(() => setCopiedTranscript(true));
            }}
            title={copiedTranscript ? 'Copied' : 'Copy transcription details'}
            aria-label={copiedTranscript ? 'Copied' : 'Copy transcription details'}
          >
            {copiedTranscript ? (
              <CheckIcon className="size-3.5 text-success" />
            ) : (
              <CopyIcon className="size-3.5" />
            )}
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 p-4 sm:p-6">
            {transcription.transcript.length > 0 ? (
              transcription.transcript.map((entry, index) => (
                <div key={`${entry.speaker}-${index}`} className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold tracking-widest text-muted-foreground/80 uppercase">
                    {entry.speaker}
                  </span>
                  <p className="text-[14px] leading-relaxed text-foreground/90">{entry.content}</p>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                No transcript available.
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
