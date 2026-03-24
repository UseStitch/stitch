import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CpuIcon,
  FileTextIcon,
  Loader2Icon,
  MicIcon,
  PauseIcon,
  PlayIcon,
  SearchIcon,
  SparklesIcon,
} from 'lucide-react';
import * as React from 'react';

import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';

import type { Meeting, MeetingStatus, Transcription } from '@stitch/shared/meetings/types';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDialogContext } from '@/context/dialog-context';
import { useSSE } from '@/hooks/sse/sse-context';
import {
  getAudioUrl,
  meetingKeys,
  recordingsQueryOptions,
  transcriptionQueryOptions,
  useTranscribeMeeting,
} from '@/lib/queries/meetings';
import {
  enabledProviderModelsQueryOptions,
  type ModelSummary,
  type ProviderModels,
} from '@/lib/queries/providers';
import { cn } from '@/lib/utils';

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(secs: number): string {
  const mins = Math.floor(secs / 60);
  const remainder = Math.floor(secs % 60);
  if (mins === 0) return `${remainder}s`;
  return `${mins}m ${remainder}s`;
}

function formatAppName(app: string): string {
  return app.replace(/\.exe$/i, '');
}

function formatCost(costUsd: number): string {
  if (costUsd < 0.01) return `$${costUsd.toFixed(4)}`;
  return `$${costUsd.toFixed(2)}`;
}

const STATUS_STYLES: Record<MeetingStatus, { label: string; className: string }> = {
  completed: { label: 'Completed', className: 'bg-emerald-500/10 text-emerald-600' },
  recording: { label: 'Recording', className: 'bg-red-500/10 text-red-600' },
  detected: { label: 'Detected', className: 'bg-primary/10 text-primary' },
  dismissed: { label: 'Dismissed', className: 'bg-muted text-muted-foreground' },
};

function StatusBadge({ status }: { status: MeetingStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', style.className)}>
      {style.label}
    </span>
  );
}

function AudioPlayer({ meetingId }: { meetingId: string }) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [audioSrc, setAudioSrc] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void getAudioUrl(meetingId).then((url) => {
      if (!cancelled) setAudioSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setProgress(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => setPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, [audioSrc]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play();
      setPlaying(true);
    }
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
  }

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  if (!audioSrc) return null;

  return (
    <div className="flex items-center gap-2">
      <audio ref={audioRef} src={audioSrc} preload="metadata" />
      <Button variant="ghost" size="icon-sm" onClick={togglePlay} className="shrink-0">
        {playing ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
      </Button>
      <MicIcon className="size-3 shrink-0 text-muted-foreground" />
      <div
        className="h-1.5 flex-1 cursor-pointer rounded-full bg-muted"
        onClick={handleSeek}
        role="slider"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={duration}
        tabIndex={0}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-100"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      {duration > 0 && (
        <span className="min-w-10 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatDuration(duration)}
        </span>
      )}
    </div>
  );
}

function filterAudioCapableModels(providerModels: ProviderModels[]): ProviderModels[] {
  return providerModels
    .map((provider) => ({
      ...provider,
      models: provider.models.filter((m) => m.modalities?.input?.includes('audio')),
    }))
    .filter((p) => p.models.length > 0);
}

type AudioModelSpec = {
  providerId: string;
  modelId: string;
};

type AudioModelOption = {
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
  modelSummary: ModelSummary;
};

function buildAudioModelOptions(providerModels: ProviderModels[]): AudioModelOption[] {
  return providerModels.flatMap((provider) =>
    provider.models.map((model) => ({
      providerId: provider.providerId,
      providerName: provider.providerName,
      modelId: model.id,
      modelName: model.name,
      modelSummary: model,
    })),
  );
}

function TranscriptionModelSelector({
  selectedValue,
  onSelect,
  providerModels,
}: {
  selectedValue: AudioModelSpec | null;
  onSelect: (value: AudioModelSpec) => void;
  providerModels: ProviderModels[];
}) {
  const [search, setSearch] = React.useState('');

  const allOptions = React.useMemo(() => buildAudioModelOptions(providerModels), [providerModels]);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return providerModels;
    const q = search.toLowerCase();
    return providerModels
      .map((provider) => ({
        ...provider,
        models: provider.models.filter(
          (m) =>
            m.name.toLowerCase().includes(q) || provider.providerName.toLowerCase().includes(q),
        ),
      }))
      .filter((p) => p.models.length > 0);
  }, [providerModels, search]);

  const selectedOption = selectedValue
    ? (allOptions.find(
        (o) => o.providerId === selectedValue.providerId && o.modelId === selectedValue.modelId,
      ) ?? null)
    : null;

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
          'text-muted-foreground hover:text-foreground hover:bg-muted/50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        )}
      >
        <CpuIcon className="size-3.5 shrink-0" />
        <span className="max-w-32 truncate">
          {selectedOption?.modelName ?? 'Select model'}
        </span>
        <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          side="bottom"
          sideOffset={6}
          align="start"
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup
            className={cn(
              'bg-popover text-popover-foreground rounded-lg shadow-lg ring-1 ring-foreground/10',
              'data-open:animate-in data-closed:animate-out',
              'data-closed:fade-out-0 data-open:fade-in-0',
              'data-closed:zoom-out-95 data-open:zoom-in-95',
              'data-[side=bottom]:slide-in-from-top-2',
              'w-80 max-h-60 flex flex-col origin-(--transform-origin) outline-none duration-100',
            )}
          >
            <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
              <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search audio models"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            <div className="no-scrollbar max-h-50 overflow-y-auto overscroll-contain">
              <div className="p-1">
                {filtered.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No audio-capable models found
                  </p>
                )}
                {filtered.map((provider, idx) => (
                  <div key={provider.providerId}>
                    {idx > 0 && <div className="my-1 h-px bg-border/50" />}
                    <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                      {provider.providerName}
                    </p>
                    {provider.models.map((model) => {
                      const isSelected =
                        selectedValue?.providerId === provider.providerId &&
                        selectedValue?.modelId === model.id;
                      return (
                        <PopoverPrimitive.Close
                          key={model.id}
                          onClick={() =>
                            onSelect({ providerId: provider.providerId, modelId: model.id })
                          }
                          className={cn(
                            'w-full flex items-center justify-between rounded-md px-2 py-1.5 text-sm cursor-default',
                            'transition-colors hover:bg-accent hover:text-accent-foreground',
                            'focus-visible:outline-none focus-visible:bg-accent',
                            isSelected && 'font-medium',
                          )}
                        >
                          <span>{model.name}</span>
                          {isSelected && <CheckIcon className="size-3.5 shrink-0" />}
                        </PopoverPrimitive.Close>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function TranscriptionView({ transcription }: { transcription: Transcription }) {
  const [showFull, setShowFull] = React.useState(false);

  return (
    <div className="mt-3 rounded-lg border border-border/50 bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium">
          {transcription.title || 'Transcription'}
        </span>
        {transcription.costUsd > 0 && (
          <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
            {formatCost(transcription.costUsd)}
          </span>
        )}
      </div>

      {transcription.summary && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {transcription.summary}
        </p>
      )}

      {transcription.transcript && (
        <>
          <button
            type="button"
            onClick={() => setShowFull((v) => !v)}
            className="mt-2 text-xs font-medium text-primary hover:underline"
          >
            {showFull ? 'Hide transcript' : 'Show full transcript'}
          </button>

          {showFull && (
            <div className="mt-2 max-h-60 overflow-y-auto rounded border border-border/50 bg-background p-2.5 text-xs leading-relaxed whitespace-pre-wrap">
              {transcription.transcript}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TranscriptionSection({ meetingId }: { meetingId: string }) {
  const queryClient = useQueryClient();
  const { data: transcription, isLoading } = useQuery(transcriptionQueryOptions(meetingId));
  const { data: allProviderModels } = useQuery(enabledProviderModelsQueryOptions);
  const transcribeMutation = useTranscribeMeeting();

  const [selectedModel, setSelectedModel] = React.useState<AudioModelSpec | null>(null);

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

  const audioModels = React.useMemo(
    () => filterAudioCapableModels(allProviderModels ?? []),
    [allProviderModels],
  );

  const isTranscribing =
    transcription?.status === 'pending' || transcription?.status === 'processing';

  function handleTranscribe() {
    if (!selectedModel) return;
    transcribeMutation.mutate({
      meetingId,
      providerId: selectedModel.providerId,
      modelId: selectedModel.modelId,
    });
  }

  if (isLoading) {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2Icon className="size-3 animate-spin" />
        <span>Loading transcription...</span>
      </div>
    );
  }

  if (isTranscribing) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
        <Loader2Icon className="size-3.5 animate-spin text-primary" />
        <span className="text-xs font-medium text-muted-foreground">Transcribing...</span>
      </div>
    );
  }

  if (transcription?.status === 'completed') {
    return (
      <div>
        <TranscriptionView transcription={transcription} />
        <div className="mt-2 flex items-center gap-2">
          <TranscriptionModelSelector
            selectedValue={selectedModel}
            onSelect={setSelectedModel}
            providerModels={audioModels}
          />
          <Button
            variant="ghost"
            size="xs"
            onClick={handleTranscribe}
            disabled={!selectedModel || transcribeMutation.isPending}
          >
            <SparklesIcon className="size-3" />
            Re-transcribe
          </Button>
        </div>
      </div>
    );
  }

  if (transcription?.status === 'failed') {
    return (
      <div className="mt-3">
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Transcription failed: {transcription.errorMessage ?? 'Unknown error'}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <TranscriptionModelSelector
            selectedValue={selectedModel}
            onSelect={setSelectedModel}
            providerModels={audioModels}
          />
          <Button
            variant="ghost"
            size="xs"
            onClick={handleTranscribe}
            disabled={!selectedModel || transcribeMutation.isPending}
          >
            <SparklesIcon className="size-3" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // No transcription yet
  return (
    <div className="mt-3 flex items-center gap-2">
      <TranscriptionModelSelector
        selectedValue={selectedModel}
        onSelect={setSelectedModel}
        providerModels={audioModels}
      />
      <Button
        variant="ghost"
        size="xs"
        onClick={handleTranscribe}
        disabled={!selectedModel || transcribeMutation.isPending}
      >
        {transcribeMutation.isPending ? (
          <Loader2Icon className="size-3 animate-spin" />
        ) : (
          <SparklesIcon className="size-3" />
        )}
        Transcribe
      </Button>
    </div>
  );
}

function RecordingRow({ meeting }: { meeting: Meeting }) {
  const hasAudio = meeting.status === 'completed' && meeting.recordingFilePath;
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="border-b border-border/50 px-1 py-3 last:border-0">
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-3 text-left',
          hasAudio && 'cursor-pointer',
        )}
        onClick={() => hasAudio && setExpanded((v) => !v)}
        disabled={!hasAudio}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{formatAppName(meeting.app)}</span>
            <StatusBadge status={meeting.status} />
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatDate(meeting.startedAt)}</span>
            <span>{formatTime(meeting.startedAt)}</span>
            {meeting.durationSecs !== null && (
              <>
                <span className="text-border">|</span>
                <span>{formatDuration(meeting.durationSecs)}</span>
              </>
            )}
          </div>
        </div>
        {hasAudio && (
          <ChevronRightIcon
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
              expanded && 'rotate-90',
            )}
          />
        )}
      </button>

      {hasAudio && expanded && (
        <div className="mt-2.5">
          <AudioPlayer meetingId={meeting.id} />
          <TranscriptionSection meetingId={meeting.id} />
        </div>
      )}
    </div>
  );
}

function RecordingsContent() {
  const { data: recordings } = useSuspenseQuery(recordingsQueryOptions);

  if (recordings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <MicIcon className="mb-3 size-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No recordings yet</p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Recordings will appear here when a meeting is detected and recorded.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {recordings.map((recording) => (
        <RecordingRow key={recording.id} meeting={recording} />
      ))}
    </div>
  );
}

export function RecordingsDialog() {
  const { recordingsOpen, setRecordingsOpen } = useDialogContext();

  return (
    <Dialog open={recordingsOpen} onOpenChange={setRecordingsOpen}>
      <DialogHeader className="sr-only">
        <DialogTitle>Recordings</DialogTitle>
      </DialogHeader>
      <DialogContent className="flex h-120 max-w-xl! flex-col gap-0 overflow-hidden p-0">
        <div className="flex items-center border-b px-5 py-4">
          <h2 className="text-base font-semibold">Recordings</h2>
        </div>
        <ScrollArea className="min-h-0 flex-1 overflow-hidden">
          <div className="px-5 py-2">
            <React.Suspense
              fallback={
                <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
              }
            >
              <RecordingsContent />
            </React.Suspense>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
