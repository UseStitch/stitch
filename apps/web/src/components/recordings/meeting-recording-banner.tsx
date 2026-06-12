import { Video } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useQuery } from '@tanstack/react-query';

import type { MeetingCallDetectedPayload } from '@stitch/shared/recordings/meeting-ipc';

import { PLATFORM_CONFIG } from './shared/formatting';

import { Button } from '@/components/ui/button';
import { recordingsQueryOptions, useStartRecording } from '@/lib/queries/recordings';

const WARNING_LABELS: Record<string, string> = {
  input_backpressure: 'Audio input is falling behind — some audio may be dropped.',
  stream_callback_error: 'Audio stream encountered an error.',
  resample_failed: 'Audio resampling failed.',
};

export function RecordingEventListener() {
  React.useEffect(() => {
    const unsubscribeWarning = window.api?.recording?.onWarning((payload) => {
      const label = WARNING_LABELS[payload.code] ?? payload.message;
      toast.warning(label);
    });
    const unsubscribeDeviceChanged = window.api?.recording?.onDeviceChanged((payload) => {
      const deviceLabel = payload.deviceName ?? 'unknown device';
      toast.info(`Audio ${payload.kind} device changed to: ${deviceLabel}`);
    });

    return () => {
      unsubscribeWarning?.();
      unsubscribeDeviceChanged?.();
    };
  }, []);

  return null;
}

export function MeetingRecordingBanner() {
  const [detection, setDetection] = React.useState<MeetingCallDetectedPayload | null>(null);
  const [dismissedKeys, setDismissedKeys] = React.useState<Set<string>>(new Set());

  const startRecording = useStartRecording();
  const { data } = useQuery(recordingsQueryOptions({ page: 1, pageSize: 10 }));

  const activeRecordingIdRef = React.useRef(data?.activeRecordingId ?? null);
  activeRecordingIdRef.current = data?.activeRecordingId ?? null;

  const dismissedKeysRef = React.useRef(dismissedKeys);
  dismissedKeysRef.current = dismissedKeys;

  function dismissMeeting(key: string): void {
    setDismissedKeys((current) => {
      if (current.has(key)) return current;

      const next = new Set(current);
      next.add(key);
      return next;
    });
    setDetection((current) => {
      if (!current || current.key !== key) return current;

      return null;
    });
  }

  function requestDismissMeeting(key: string): void {
    if (window.api?.meeting?.dismissCall) {
      void window.api.meeting.dismissCall(key);
      return;
    }

    dismissMeeting(key);
  }

  React.useEffect(() => {
    const unsubscribeDetected = window.api?.meeting?.onCallDetected((payload) => {
      if (activeRecordingIdRef.current) {
        return;
      }

      setDetection((current) => {
        if (dismissedKeysRef.current.has(payload.key)) {
          return current;
        }

        return payload;
      });
    });
    const unsubscribeEnded = window.api?.meeting?.onCallEnded(({ key }) => {
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
    });
    const unsubscribeDismissed = window.api?.meeting?.onCallDismissed(({ key }) => {
      dismissMeeting(key);
    });

    return () => {
      unsubscribeDetected?.();
      unsubscribeEnded?.();
      unsubscribeDismissed?.();
    };
  }, []);

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
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary"></span>
            </span>
            <Video className="h-4 w-4" />
          </div>
          <p className="text-sm text-muted-foreground">
            Active call detected in{' '}
            <strong className="font-medium text-foreground">
              {PLATFORM_CONFIG[detection.platform].label}
            </strong>
            . Would you like to start recording?
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void startRecording.mutateAsync({ platform: detection.platform }).then(
                () => {
                  requestDismissMeeting(detection.key);
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
              requestDismissMeeting(detection.key);
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
