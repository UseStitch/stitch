import {
  CheckIcon,
  CopyIcon,
  FileTextIcon,
  Loader2Icon,
  SparklesIcon,
  Trash2Icon,
} from 'lucide-react';
import * as React from 'react';
import ReactMarkdown from 'react-markdown';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { Transcription } from '@stitch/shared/meetings/types';

import { formatCost } from '@/components/recordings/recording-detail/formatting';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSSE } from '@/hooks/sse/sse-context';
import {
  meetingKeys,
  transcriptionVersionsQueryOptions,
  useDeleteTranscriptionVersion,
} from '@/lib/queries/meetings';

function formatVersionLabel(transcription: Transcription): string {
  const timestamp = new Date(transcription.createdAt).toLocaleString();
  return `${timestamp} - ${transcription.status}`;
}

export function TranscriptionSection({
  meetingId,
  isStartingTranscription = false,
}: {
  meetingId: string;
  isStartingTranscription?: boolean;
}) {
  const queryClient = useQueryClient();
  const {
    data: transcriptions = [],
    isLoading,
    isFetching,
    isError,
    error,
  } = useQuery(transcriptionVersionsQueryOptions(meetingId));
  const deleteTranscriptionVersion = useDeleteTranscriptionVersion();
  const [selectedTranscriptionId, setSelectedTranscriptionId] = React.useState<string | null>(null);
  const [copiedSummary, setCopiedSummary] = React.useState(false);
  const [copiedTranscript, setCopiedTranscript] = React.useState(false);
  const latestStatusRef = React.useRef<{ id: string; status: Transcription['status'] } | null>(null);

  const latestTranscription = transcriptions[0] ?? null;
  const latestCompletedTranscription =
    transcriptions.find((version) => version.status === 'completed') ?? null;

  const selectedTranscription = React.useMemo(
    () => transcriptions.find((version) => version.id === selectedTranscriptionId) ?? null,
    [selectedTranscriptionId, transcriptions],
  );

  const selectedVersionLabel = React.useMemo(() => {
    if (!selectedTranscription) {
      return 'Select version';
    }

    const label = formatVersionLabel(selectedTranscription);
    return label.length > 48 ? `${label.slice(0, 47)}...` : label;
  }, [selectedTranscription]);

  const displayTranscription =
    selectedTranscription?.status === 'completed'
      ? selectedTranscription
      : latestCompletedTranscription;

  const hasInFlightTranscription =
    isStartingTranscription ||
    isFetching ||
    transcriptions.some((version) => version.status === 'pending' || version.status === 'processing');

  const latestFailure = latestTranscription?.status === 'failed' ? latestTranscription : null;

  React.useEffect(() => {
    if (transcriptions.length === 0) {
      setSelectedTranscriptionId(null);
      return;
    }

    if (selectedTranscriptionId && transcriptions.some((version) => version.id === selectedTranscriptionId)) {
      return;
    }

    setSelectedTranscriptionId(
      (latestCompletedTranscription ?? latestTranscription)?.id ?? transcriptions[0]?.id ?? null,
    );
  }, [latestCompletedTranscription, latestTranscription, selectedTranscriptionId, transcriptions]);

  React.useEffect(() => {
    if (!latestTranscription) {
      latestStatusRef.current = null;
      return;
    }

    const previous = latestStatusRef.current;
    if (
      previous &&
      previous.id === latestTranscription.id &&
      previous.status !== 'completed' &&
      latestTranscription.status === 'completed'
    ) {
      setSelectedTranscriptionId(latestTranscription.id);
    }

    latestStatusRef.current = {
      id: latestTranscription.id,
      status: latestTranscription.status,
    };
  }, [latestTranscription]);

  useSSE({
    'transcription-started': (data) => {
      if (data.meetingId === meetingId) {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: meetingKeys.transcription(meetingId) }),
          queryClient.invalidateQueries({ queryKey: meetingKeys.transcriptions(meetingId) }),
        ]);
      }
    },
    'transcription-completed': (data) => {
      if (data.meetingId === meetingId) {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: meetingKeys.transcription(meetingId) }),
          queryClient.invalidateQueries({ queryKey: meetingKeys.transcriptions(meetingId) }),
        ]);
      }
    },
    'transcription-failed': (data) => {
      if (data.meetingId === meetingId) {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: meetingKeys.transcription(meetingId) }),
          queryClient.invalidateQueries({ queryKey: meetingKeys.transcriptions(meetingId) }),
        ]);
      }
    },
  });

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

  if (isLoading) {
    return (
      <div className="grid h-full grid-cols-1 items-start gap-6 lg:grid-cols-4">
        <div className="w-full space-y-5 lg:sticky lg:top-0 lg:col-span-3">
          <div className="space-y-4 rounded-lg border border-border/50 bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2Icon className="size-3 animate-spin" />
              <span>Loading transcription...</span>
            </div>
          </div>
        </div>
        <div className="flex min-h-100 w-full min-w-0 items-center justify-center rounded-lg border border-border/50 bg-muted/10 p-8 lg:col-span-1">
          <p className="text-sm text-muted-foreground">Transcript will appear here</p>
        </div>
      </div>
    );
  }

  if (isError) {
    const message = error instanceof Error ? error.message : 'Failed to load transcription versions';

    return (
      <div className="grid h-full grid-cols-1 items-start gap-6 lg:grid-cols-4">
        <div className="w-full space-y-5 lg:sticky lg:top-0 lg:col-span-3">
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            Failed to load transcriptions: {message}
          </div>
        </div>
        <div className="flex min-h-100 w-full min-w-0 items-center justify-center rounded-lg border border-border/50 bg-muted/10 p-8 lg:col-span-1">
          <p className="text-sm text-muted-foreground">Transcript unavailable</p>
        </div>
      </div>
    );
  }

  if (!displayTranscription) {
    return (
      <div className="grid h-full grid-cols-1 items-start gap-6 lg:grid-cols-4">
        <div className="w-full space-y-5 lg:sticky lg:top-0 lg:col-span-3">
          <div className="space-y-4 rounded-lg border border-border/50 bg-muted/30 p-4">
            {hasInFlightTranscription && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2Icon className="size-3.5 animate-spin text-primary" />
                <span className="font-medium text-foreground">Transcribing...</span>
              </div>
            )}
            {latestFailure && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                Transcription failed: {latestFailure.errorMessage ?? 'Unknown error'}
              </div>
            )}
            {!hasInFlightTranscription && !latestFailure && (
              <div className="py-2 text-sm text-muted-foreground">
                Click transcribe in the header to generate a transcription.
              </div>
            )}
          </div>
        </div>
        <div className="flex min-h-100 w-full min-w-0 items-center justify-center rounded-lg border border-border/50 bg-muted/10 p-8 lg:col-span-1">
          <p className="text-sm text-muted-foreground">
            {hasInFlightTranscription ? 'Transcription in progress...' : 'Transcript will appear here'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-1 items-start gap-6 lg:grid-cols-4">
      <div className="flex w-full flex-col gap-5 lg:sticky lg:top-0 lg:col-span-3 lg:h-[calc(100vh-200px)]">
        {latestFailure && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            Latest transcription attempt failed: {latestFailure.errorMessage ?? 'Unknown error'}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">Version</span>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="xs" className="max-w-66 justify-between gap-2">
                  <span className="truncate">{selectedVersionLabel}</span>
                </Button>
              }
            />
            <DropdownMenuContent align="start" className="w-80">
              <DropdownMenuRadioGroup
                value={selectedTranscriptionId ?? ''}
                onValueChange={(value) => setSelectedTranscriptionId(value || null)}
              >
                {transcriptions.map((version) => (
                  <DropdownMenuRadioItem key={version.id} value={version.id}>
                    {formatVersionLabel(version)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            disabled={!selectedTranscriptionId || deleteTranscriptionVersion.isPending}
            onClick={() => {
              if (!selectedTranscriptionId) return;
              deleteTranscriptionVersion.mutate({
                meetingId,
                transcriptionId: selectedTranscriptionId,
              });
            }}
            title="Delete selected version"
            aria-label="Delete selected version"
          >
            <Trash2Icon className="size-3.5" />
          </Button>
          {hasInFlightTranscription && displayTranscription.id !== latestTranscription?.id && (
            <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2Icon className="size-3 animate-spin" />
              <span>New version in progress. Showing previous completed version.</span>
            </div>
          )}
        </div>

        <div className="flex max-h-[60vh] w-full flex-col overflow-hidden rounded-lg border border-border/50 bg-muted/30 shadow-sm lg:max-h-none lg:min-h-0 lg:flex-1">
          <div className="flex shrink-0 items-center gap-2 border-b border-border/50 bg-muted/20 px-4 py-3">
            <SparklesIcon className="size-4 shrink-0 text-primary" />
            <span className="text-sm font-medium">Summary</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="ml-auto text-muted-foreground hover:text-foreground"
              disabled={!displayTranscription.summary}
              onClick={() => {
                if (!displayTranscription.summary) return;
                if (typeof navigator === 'undefined' || navigator.clipboard === null) return;

                void navigator.clipboard.writeText(displayTranscription.summary).then(() => {
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
            {displayTranscription.costUsd > 0 && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {formatCost(displayTranscription.costUsd)}
              </span>
            )}
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="p-4 sm:p-6">
              {displayTranscription.summary && (
                <div className="prose prose-sm max-w-none text-muted-foreground dark:prose-invert">
                  <ReactMarkdown>{displayTranscription.summary}</ReactMarkdown>
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

              const transcriptText = displayTranscription.transcript
                .map((entry) => `${entry.speaker}: ${entry.content}`)
                .join('\n');

              const sections = [
                displayTranscription.title ? `Title\n${displayTranscription.title}` : null,
                displayTranscription.summary ? `Summary\n${displayTranscription.summary}` : null,
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
            {displayTranscription.transcript.length > 0 ? (
              displayTranscription.transcript.map((entry, index) => (
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
