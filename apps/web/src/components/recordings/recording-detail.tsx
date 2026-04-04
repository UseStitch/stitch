import {
  EllipsisIcon,
  Loader2Icon,
  MicIcon,
  SparklesIcon,
  SquareIcon,
  Trash2Icon,
} from 'lucide-react';
import * as React from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';

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
import {
  meetingKeys,
  transcriptionVersionsQueryOptions,
  useDeleteTranscriptionVersion,
  useTranscribeMeeting,
} from '@/lib/queries/meetings';
import { enabledAudioProviderModelsQueryOptions } from '@/lib/queries/providers';
import { settingsQueryOptions } from '@/lib/queries/settings';

export function RecordingDetail({ meeting, onDelete }: { meeting: Meeting; onDelete: () => void }) {
  const queryClient = useQueryClient();
  const hasAudio = meeting.status === 'completed' && meeting.recordingFilePath;
  const { data: transcriptionVersions = [] } = useQuery(
    transcriptionVersionsQueryOptions(meeting.id),
  );
  const { data: settings } = useQuery(settingsQueryOptions);
  const { data: audioModels = [] } = useQuery(enabledAudioProviderModelsQueryOptions);
  const transcribeMutation = useTranscribeMeeting();
  const deleteTranscriptionVersionMutation = useDeleteTranscriptionVersion();
  const [isStartingTranscription, setIsStartingTranscription] = React.useState(false);

  const latestTranscription = transcriptionVersions[0] ?? null;
  const inFlightTranscription =
    transcriptionVersions.find(
      (version) => version.status === 'pending' || version.status === 'processing',
    ) ?? null;
  const latestCompletedTranscription =
    transcriptionVersions.find((version) => version.status === 'completed') ?? null;

  const title = latestCompletedTranscription?.title || formatAppName(meeting.app);

  const [selectedModel, setSelectedModel] = React.useState<AudioModelSpec | null>(null);

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

  const isStoppingTranscription = deleteTranscriptionVersionMutation.isPending;

  async function handleTranscribeOrStop() {
    if (inFlightTranscription) {
      await deleteTranscriptionVersionMutation.mutateAsync({
        meetingId: meeting.id,
        transcriptionId: inFlightTranscription.id,
      });
      return;
    }

    if (!selectedModel) return;

    setIsStartingTranscription(true);
    try {
      await transcribeMutation.mutateAsync({
        meetingId: meeting.id,
        providerId: selectedModel.providerId,
        modelId: selectedModel.modelId,
      });
      await queryClient.refetchQueries({ queryKey: meetingKeys.transcriptions(meeting.id) });
    } finally {
      setIsStartingTranscription(false);
    }
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
                    onClick={() => {
                      void handleTranscribeOrStop();
                    }}
                    disabled={
                      isStoppingTranscription ||
                      transcribeMutation.isPending ||
                      isStartingTranscription ||
                      (!inFlightTranscription && !selectedModel)
                    }
                  >
                    {isStoppingTranscription ||
                    transcribeMutation.isPending ||
                    isStartingTranscription ? (
                      <Loader2Icon className="size-3 animate-spin" />
                    ) : inFlightTranscription ? (
                      <SquareIcon className="size-3" />
                    ) : (
                      <SparklesIcon className="size-3" />
                    )}
                    {inFlightTranscription
                      ? 'Stop'
                      : !latestTranscription || latestTranscription.status === 'failed'
                        ? latestTranscription?.status === 'failed'
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
          {hasAudio && (
            <TranscriptionSection
              meetingId={meeting.id}
              isStartingTranscription={isStartingTranscription || transcribeMutation.isPending}
            />
          )}
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
