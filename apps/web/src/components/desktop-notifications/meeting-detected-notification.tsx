import { VideoIcon } from 'lucide-react';
import * as React from 'react';

import type { DesktopNotificationEvent } from '@stitch/shared/ipc/types';

import { DesktopNotification } from './desktop-notification';

import { Icon } from '@/components/primitives/icon';
import { Text } from '@/components/primitives/text';
import { PLATFORM_CONFIG } from '@/components/recordings/shared/formatting';
import { getErrorMessage } from '@/lib/errors';
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
        <Icon as={VideoIcon} size="m" />
      </DesktopNotification.Icon>
      <DesktopNotification.Content>
        <DesktopNotification.Title>Meeting detected</DesktopNotification.Title>
        <DesktopNotification.Description>
          Active call detected in{' '}
          <Text as="span" variant="body-strong">
            {platformLabel}
          </Text>
          .
        </DesktopNotification.Description>
        {error ? (
          <div className="mt-space-s wrap-break-word">
            <Text variant="caption" tone="destructive">
              {error}
            </Text>
          </div>
        ) : null}
        <DesktopNotification.Actions>
          <DesktopNotification.Action
            onClick={() => {
              setError(null);
              void startRecording.mutateAsync({ platform: event.payload.platform }).then(
                () => onDismiss(event.id),
                (nextError: unknown) => {
                  setError(getErrorMessage(nextError, 'Failed to start recording'));
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
