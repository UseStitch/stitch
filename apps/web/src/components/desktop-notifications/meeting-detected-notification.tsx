import { VideoIcon } from 'lucide-react';
import * as React from 'react';

import type { DesktopNotificationEvent } from '@stitch/shared/ipc/types';

import { DesktopNotification } from './desktop-notification';

import { PLATFORM_CONFIG } from '@/components/recordings/shared/formatting';
import { useStartRecording } from '@/lib/queries/recordings';

type MeetingDetectedNotificationProps = {
  event: DesktopNotificationEvent;
  exiting?: boolean;
  onDismiss: (id: string) => void;
};

export function MeetingDetectedNotification({ event, exiting, onDismiss }: MeetingDetectedNotificationProps) {
  const [error, setError] = React.useState<string | null>(null);
  const startRecording = useStartRecording();
  const platformLabel = PLATFORM_CONFIG[event.payload.platform].label;

  return (
    <DesktopNotification exiting={exiting} onDismiss={() => onDismiss(event.id)}>
      <DesktopNotification.Icon>
        <VideoIcon className="size-4" />
      </DesktopNotification.Icon>
      <DesktopNotification.Content>
        <DesktopNotification.Title>Meeting detected</DesktopNotification.Title>
        <DesktopNotification.Description>
          Active call detected in <span className="font-medium text-foreground">{platformLabel}</span>.
        </DesktopNotification.Description>
        {error ? <p className="mt-1.5 text-xs leading-4 wrap-break-word text-destructive">{error}</p> : null}
        <DesktopNotification.Actions>
          <DesktopNotification.Action
            onClick={() => {
              setError(null);
              void startRecording.mutateAsync({ platform: event.payload.platform }).then(
                () => onDismiss(event.id),
                (nextError: unknown) => {
                  setError(nextError instanceof Error ? nextError.message : 'Failed to start recording');
                },
              );
            }}>
            {startRecording.isPending ? 'Starting...' : 'Start recording'}
          </DesktopNotification.Action>
          <DesktopNotification.Action variant="ghost" onClick={() => onDismiss(event.id)}>
            Dismiss
          </DesktopNotification.Action>
        </DesktopNotification.Actions>
      </DesktopNotification.Content>
    </DesktopNotification>
  );
}
