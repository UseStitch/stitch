import * as React from 'react';
import { Video } from 'lucide-react';
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
  const { data } = useQuery(recordingsQueryOptions({ page: 1, pageSize: 10 }));

  const activeRecordingIdRef = React.useRef(data?.activeRecordingId ?? null);
  activeRecordingIdRef.current = data?.activeRecordingId ?? null;

  useSSE({
    'meeting-call-detected': (payload) => {
      if (activeRecordingIdRef.current) {
        return;
      }

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

  if (data === undefined || !detection || data.activeRecordingId) {
    return null;
  }

  return (
    <div className="border-b border-border/40 bg-card px-4 py-3 shadow-sm transition-all">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
            <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary"></span>
            </span>
            <Video className="h-4 w-4" />
          </div>
          <p className="text-sm text-muted-foreground">
            Active call detected in <strong className="font-medium text-foreground">{platformLabel(detection.platform)}</strong>. Would you like to start recording?
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void startRecording.mutateAsync({ platform: detection.platform }).then(
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
            className="shadow-sm"
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
            className="text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
