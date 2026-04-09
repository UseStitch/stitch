import * as React from 'react';
import { toast } from 'sonner';

import { useQuery } from '@tanstack/react-query';

import type { MeetingCallDetectedPayload } from '@stitch/shared/chat/realtime';

import { Button } from '@/components/ui/button';
import { useSSE } from '@/hooks/sse/sse-context';
import { recordingsQueryOptions, useStartRecording } from '@/lib/queries/recordings';

function platformLabel(platform: MeetingCallDetectedPayload['platform']): string {
  if (platform === 'google-meet') return 'Google Meet';
  if (platform === 'teams') return 'Microsoft Teams';
  if (platform === 'zoom') return 'Zoom';
  if (platform === 'slack') return 'Slack';
  return 'Discord';
}

export function MeetingRecordingBanner() {
  const [detection, setDetection] = React.useState<MeetingCallDetectedPayload | null>(null);
  const [dismissedKeys, setDismissedKeys] = React.useState<Set<string>>(new Set());

  const startRecording = useStartRecording();
  const { data } = useQuery(recordingsQueryOptions);

  useSSE({
    'meeting-call-detected': (payload) => {
      setDetection((current) => {
        if (dismissedKeys.has(payload.key)) {
          return current;
        }

        return payload;
      });
    },
    'meeting-call-ended': ({ key }) => {
      setDetection((current) => {
        if (!current || current.key !== key) {
          return current;
        }

        return null;
      });
      setDismissedKeys((current) => {
        if (!current.has(key)) {
          return current;
        }

        const next = new Set(current);
        next.delete(key);
        return next;
      });
    },
  });

  React.useEffect(() => {
    if (data?.activeRecordingId) {
      setDetection(null);
    }
  }, [data?.activeRecordingId]);

  if (!detection || data?.activeRecordingId) {
    return null;
  }

  return (
    <div className="border-b border-border/60 bg-info/10 px-4 py-2">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
        <p className="text-xs text-info-foreground">
          Active call detected in {platformLabel(detection.platform)}. Start recording in Stitch?
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void startRecording.mutateAsync({}).then(
                () => {
                  setDetection(null);
                  toast.success('Recording started');
                },
                (error: unknown) => {
                  toast.error(error instanceof Error ? error.message : 'Failed to start recording');
                },
              );
            }}
            disabled={startRecording.isPending}
          >
            Start recording
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setDismissedKeys((current) => {
                const next = new Set(current);
                next.add(detection.key);
                return next;
              });
              setDetection(null);
            }}
          >
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
