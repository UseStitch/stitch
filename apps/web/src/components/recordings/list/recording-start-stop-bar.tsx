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

interface RecordingStartStopBarProps {
  activeRecording: Recording | undefined;
  isStarting: boolean;
  isStopping: boolean;
  title: string;
  onTitleChange: (title: string) => void;
  sttModelOverride: SttModelSelection | null;
  onSttModelOverrideChange: (value: SttModelSelection | null) => void;
  onStart: () => void;
  onStop: () => void;
}

export function RecordingStartStopBar({
  activeRecording,
  isStarting,
  isStopping,
  title,
  onTitleChange,
  sttModelOverride,
  onSttModelOverrideChange,
  onStart,
  onStop,
}: RecordingStartStopBarProps) {
  const { data: sttProviders } = useSuspenseQuery(sttProviderModelsQueryOptions);

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
          <Button onClick={onStop} disabled={isStopping} variant="destructive">
            <SquareIcon data-icon="inline-start" className="size-4" />
            Stop recording (<LiveDurationText startedAt={activeRecording.startedAt} />)
          </Button>
        ) : sttProviders.length > 0 ? (
          <ButtonGroup>
            <Button onClick={onStart} disabled={isStarting}>
              <MicIcon data-icon="inline-start" className="size-4" />
              Start recording
            </Button>
            <ButtonGroupSeparator />
            <SttModelSelectorPopover
              selectedValue={sttModelOverride}
              onSelect={onSttModelOverrideChange}
              sttProviders={sttProviders}
              triggerRender={
                <Button disabled={isStarting} className="px-2">
                  <ChevronDownIcon className="size-3.5" />
                </Button>
              }
            />
          </ButtonGroup>
        ) : (
          <Button onClick={onStart} disabled={isStarting}>
            <MicIcon data-icon="inline-start" className="size-4" />
            Start recording
          </Button>
        )}
      </div>
    </div>
  );
}
