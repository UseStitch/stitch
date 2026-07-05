import { ChevronDownIcon, MicIcon, SquareIcon } from 'lucide-react';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { Recording } from '@stitch/shared/recordings/types';

import { LiveDurationText } from '../shared/live-duration';

import type { SttModelSelection } from '@/components/model-selectors/stt-model-selector-popover';
import { SttModelSelectorPopover } from '@/components/model-selectors/stt-model-selector-popover';
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
  const { data: sttProviders } = useSuspenseQuery(sttProviderModelsQueryOptions);
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);

  const defaultSttModel: SttModelSelection | null =
    settings['recordings.transcription.providerId'] && settings['recordings.transcription.modelId']
      ? {
          providerId: settings['recordings.transcription.providerId'],
          modelId: settings['recordings.transcription.modelId'],
        }
      : null;

  return (
    <div className="rounded-xl border border-border/60 bg-card/70 p-4">
      <div className="flex flex-wrap items-center gap-3">
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
          <Button
            onClick={onStop}
            disabled={isStopping}
            variant="destructive"
            className="h-8 rounded-lg px-2.5 shadow-sm">
            <SquareIcon data-icon="inline-start" className="size-4" />
            Stop recording (<LiveDurationText startedAt={activeRecording.startedAt} />)
          </Button>
        ) : sttProviders.length > 0 ? (
          <ButtonGroup className="overflow-hidden rounded-lg border border-primary/20 bg-primary shadow-sm shadow-primary/10">
            <Button
              onClick={() => onStart()}
              disabled={isStarting}
              className="h-8 rounded-none px-2.5 text-primary-foreground hover:bg-primary/90">
              <MicIcon data-icon="inline-start" className="size-4" />
              Start recording
            </Button>
            <ButtonGroupSeparator className="bg-primary-foreground/20" />
            <SttModelSelectorPopover
              defaultValue={defaultSttModel}
              onSelect={(value) => onStart(value)}
              sttProviders={sttProviders}
              triggerRender={
                <Button
                  disabled={isStarting}
                  className="h-8 rounded-none px-1.5 text-primary-foreground hover:bg-primary/90"
                  title="Choose transcription model and start">
                  <ChevronDownIcon className="size-3.5" />
                </Button>
              }
            />
          </ButtonGroup>
        ) : (
          <Button onClick={() => onStart()} disabled={isStarting} className="h-8 rounded-lg px-2.5 shadow-sm">
            <MicIcon data-icon="inline-start" className="size-4" />
            Start recording
          </Button>
        )}
      </div>
    </div>
  );
}
