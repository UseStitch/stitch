import { EllipsisIcon, Loader2Icon, MicIcon, SparklesIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';

import { useQuery } from '@tanstack/react-query';

import type { Meeting } from '@stitch/shared/meetings/types';

import { AudioPlayer } from '@/components/recordings/recording-detail/audio-player';
import {
  formatAppName,
  formatDate,
  formatDuration,
  formatTime,
} from '@/components/recordings/recording-detail/formatting';
import { StatusBadge } from '@/components/recordings/recording-detail/status-badge';
import {
  type AudioModelSpec,
  TranscriptionModelSelector,
} from '@/components/recordings/recording-detail/transcription-model-selector';
import { TranscriptionSection } from '@/components/recordings/recording-detail/transcription-section';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { transcriptionQueryOptions, useTranscribeMeeting } from '@/lib/queries/meetings';
import { enabledAudioProviderModelsQueryOptions } from '@/lib/queries/providers';
import { settingsQueryOptions } from '@/lib/queries/settings';

export function RecordingDetail({ meeting, onDelete }: { meeting: Meeting; onDelete: () => void }) {
  const hasAudio = meeting.status === 'completed' && meeting.recordingFilePath;
  const { data: transcription } = useQuery(transcriptionQueryOptions(meeting.id));
  const { data: settings } = useQuery(settingsQueryOptions);
  const { data: audioModels = [] } = useQuery(enabledAudioProviderModelsQueryOptions);
  const transcribeMutation = useTranscribeMeeting();

  const title = transcription?.title || formatAppName(meeting.app);

  const [selectedModel, setSelectedModel] = React.useState<AudioModelSpec | null>(null);

  React.useEffect(() => {
    setSelectedModel(null);
  }, [meeting.id]);

  React.useEffect(() => {
    if (selectedModel || audioModels.length === 0) {
      return;
    }

    const defaultProviderId = settings?.['recordings.default.providerId'];
    const defaultModelId = settings?.['recordings.default.modelId'];

    if (defaultProviderId && defaultModelId) {
      const hasDefault = audioModels.some(
        (provider) =>
          provider.providerId === defaultProviderId &&
          provider.models.some((model) => model.id === defaultModelId),
      );

      if (hasDefault) {
        setSelectedModel({ providerId: defaultProviderId, modelId: defaultModelId });
        return;
      }
    }

    const [firstProvider] = audioModels;
    const [firstModel] = firstProvider.models;
    if (firstModel) {
      setSelectedModel({ providerId: firstProvider.providerId, modelId: firstModel.id });
    }
  }, [audioModels, selectedModel, settings]);

  function handleTranscribe() {
    if (!selectedModel) return;
    transcribeMutation.mutate({
      meetingId: meeting.id,
      providerId: selectedModel.providerId,
      modelId: selectedModel.modelId,
    });
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border/50 px-6 py-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-lg font-semibold">{title}</h1>
              <StatusBadge status={meeting.status} />
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
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

          <div className="flex shrink-0 items-center gap-3">
            {hasAudio && (
              <>
                <div className="flex items-center gap-2">
                  <TranscriptionModelSelector
                    selectedValue={selectedModel}
                    onSelect={setSelectedModel}
                    providerModels={audioModels}
                  />
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={handleTranscribe}
                    disabled={!selectedModel || transcribeMutation.isPending}
                  >
                    {transcribeMutation.isPending ? (
                      <Loader2Icon className="size-3 animate-spin" />
                    ) : (
                      <SparklesIcon className="size-3" />
                    )}
                    {!transcription || transcription.status === 'failed'
                      ? transcription?.status === 'failed'
                        ? 'Retry'
                        : 'Transcribe'
                      : 'Re-transcribe'}
                  </Button>
                </div>
                <div className="h-5 w-px bg-border/50" />
                <AudioPlayer meetingId={meeting.id} />
                <div className="h-5 w-px bg-border/50" />
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon-sm" aria-label="Recording actions">
                    <EllipsisIcon className="size-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  <Trash2Icon className="size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="relative isolate flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="mx-auto w-full max-w-350">
          {hasAudio && <TranscriptionSection meetingId={meeting.id} />}
          {!hasAudio && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MicIcon className="mb-3 size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {meeting.status === 'recording'
                  ? 'Recording in progress...'
                  : 'No audio available for this recording'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
