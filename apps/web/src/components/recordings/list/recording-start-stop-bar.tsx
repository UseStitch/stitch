import { ChevronDownIcon, MicIcon, SquareIcon } from 'lucide-react';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { Recording } from '@stitch/shared/recordings/types';

import { LiveDurationText } from '../shared/live-duration';

import type { SttModelSelection } from '@/components/model-selectors/stt-model-selector-popover';
import { SttModelSelectorPopover } from '@/components/model-selectors/stt-model-selector-popover';
import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Button } from '@/components/ui/button';
import { ButtonGroup, ButtonGroupSeparator } from '@/components/ui/button-group';
import { Input } from '@/components/ui/input';
import { sttProviderModelsQueryOptions } from '@/lib/queries/providers';
import { settingsQueryOptions } from '@/lib/queries/settings';

interface RecordingStartStopBarProps {
  activeRecording: Recording | undefined;
  isStarting: boolean;
  isStopping: boolean;
  title: string;
  onTitleChange: (title: string) => void;
  onStart: (sttModel?: SttModelSelection) => void;
  onStop: () => void;
}

export function RecordingStartStopBar({
  activeRecording,
  isStarting,
  isStopping,
  title,
  onTitleChange,
  onStart,
  onStop,
}: RecordingStartStopBarProps) {
  const { data: sttProviders } = useSuspenseQuery({ ...sttProviderModelsQueryOptions, select: (data) => data });
  const { data: settings } = useSuspenseQuery({
    ...settingsQueryOptions,
    select: (data) => ({
      'recordings.transcription.providerId': data['recordings.transcription.providerId'],
      'recordings.transcription.modelId': data['recordings.transcription.modelId'],
    }),
  });

  const defaultSttModel: SttModelSelection | null =
    settings['recordings.transcription.providerId'] && settings['recordings.transcription.modelId']
      ? {
          providerId: settings['recordings.transcription.providerId'],
          modelId: settings['recordings.transcription.modelId'],
        }
      : null;

  return (
    <div className="rounded-xl border border-border-subtle bg-card p-space-xl">
      <Stack direction="row" wrap align="center" gap="l">
        <div className="min-w-72 flex-1">
          <label htmlFor="recording-title" className="sr-only">
            Recording title
          </label>
          <Input
            id="recording-title"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Recording title e.g. Weekly Product Sync"
            disabled={Boolean(activeRecording)}
          />
        </div>

        {activeRecording ? (
          <Button onClick={onStop} disabled={isStopping} variant="destructive">
            <Icon as={SquareIcon} size="m" data-icon="inline-start" />
            Stop recording (<LiveDurationText startedAt={activeRecording.startedAt} />)
          </Button>
        ) : sttProviders.length > 0 ? (
          <ButtonGroup className="overflow-hidden rounded-lg border border-primary-subtle bg-primary shadow-sm shadow-primary-subtle">
            <Button onClick={() => onStart()} disabled={isStarting}>
              <Icon as={MicIcon} size="m" data-icon="inline-start" />
              Start recording
            </Button>
            <ButtonGroupSeparator className="bg-primary-foreground" />
            <SttModelSelectorPopover
              defaultValue={defaultSttModel}
              onSelect={(value) => onStart(value)}
              sttProviders={sttProviders}
              triggerRender={
                <Button size="icon-sm" disabled={isStarting} title="Choose transcription model and start">
                  <Icon as={ChevronDownIcon} size="s" />
                </Button>
              }
            />
          </ButtonGroup>
        ) : (
          <Button onClick={() => onStart()} disabled={isStarting}>
            <Icon as={MicIcon} size="m" data-icon="inline-start" />
            Start recording
          </Button>
        )}
      </Stack>
    </div>
  );
}
