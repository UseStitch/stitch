import { ChevronDownIcon, Video } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useQuery, useSuspenseQuery } from '@tanstack/react-query';

import type { MeetingCallDetectedPayload } from '@stitch/shared/recordings/meeting-ipc';

import { PLATFORM_CONFIG } from './shared/formatting';

import type { SttModelSelection } from '@/components/model-selectors/stt-model-selector-popover';
import { SttModelSelectorPopover } from '@/components/model-selectors/stt-model-selector-popover';
import { Button } from '@/components/ui/button';
import { ButtonGroup, ButtonGroupSeparator } from '@/components/ui/button-group';
import { useRecordingEvents } from '@/hooks/sse/sse-context';
import { getErrorMessage } from '@/lib/errors';
import { sttProviderModelsQueryOptions } from '@/lib/queries/providers';
import { activeRecordingQueryOptions, useStartRecording, useStopRecording } from '@/lib/queries/recordings';
import { settingsQueryOptions } from '@/lib/queries/settings';

const WARNING_LABELS: Record<string, string> = {
  input_backpressure: 'Audio input is falling behind — some audio may be dropped.',
  stream_callback_error: 'Audio stream encountered an error.',
  resample_failed: 'Audio resampling failed.',
  mic_stream_ended: 'Microphone stream ended — restarting audio capture.',
  speaker_stream_ended: 'System audio stream ended — restarting audio capture.',
  mic_resample_failed: 'Microphone resampling failed — restarting audio capture.',
  speaker_resample_failed: 'System audio resampling failed — restarting audio capture.',
  aec_resample_failed: 'Audio resampling failed — restarting audio capture.',
};

const UNRECOVERABLE_WARNING_CODE = 'capture_restart_failed';

export function RecordingEventListener() {
  const { data } = useQuery(activeRecordingQueryOptions);
  const activeRecordingId = data?.activeRecordingId ?? null;
  const stopRecording = useStopRecording();

  const stopRecordingRef = React.useRef(stopRecording);
  stopRecordingRef.current = stopRecording;

  React.useEffect(() => {
    const unsubscribeWarning = window.api?.recording?.onWarning((payload) => {
      if (payload.code === UNRECOVERABLE_WARNING_CODE) {
        toast.error('Audio capture could not be recovered — stopping the recording.', {
          id: 'recording.unrecoverable',
        });
        void stopRecordingRef.current.mutateAsync().catch(() => {
          toast.error('Failed to finalize the recording.', { id: 'recording-finalize-error' });
        });
        return;
      }
      const label = WARNING_LABELS[payload.code] ?? payload.message;
      toast.warning(label, { id: `recording-warning-${payload.code}` });
    });
    const unsubscribeDeviceChanged = window.api?.recording?.onDeviceChanged((payload) => {
      const deviceLabel = payload.deviceName ?? 'unknown device';
      toast.info(`Audio ${payload.kind} device changed to: ${deviceLabel}`, { id: 'recording-device-change' });
    });

    return () => {
      unsubscribeWarning?.();
      unsubscribeDeviceChanged?.();
    };
  }, []);

  useRecordingEvents(activeRecordingId, {
    'recording.unrecoverable': ({ reason }) => {
      toast.error(reason, { id: 'recording.unrecoverable' });
      void stopRecording.mutateAsync().catch(() => {
        toast.error('Failed to finalize the recording.', { id: 'recording-finalize-error' });
      });
    },
  });

  return null;
}

export function MeetingRecordingBanner() {
  const [detection, setDetection] = React.useState<MeetingCallDetectedPayload | null>(null);
  const [dismissedKeys, setDismissedKeys] = React.useState<Set<string>>(new Set());

  const startRecording = useStartRecording();
  const { data } = useQuery(activeRecordingQueryOptions);
  const { data: sttProviders } = useSuspenseQuery(sttProviderModelsQueryOptions);
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const activeRecordingId = data?.activeRecordingId ?? null;

  const defaultSttModel: SttModelSelection | null =
    settings['recordings.transcription.providerId'] && settings['recordings.transcription.modelId']
      ? {
          providerId: settings['recordings.transcription.providerId'],
          modelId: settings['recordings.transcription.modelId'],
        }
      : null;

  const activeRecordingIdRef = React.useRef(activeRecordingId);
  activeRecordingIdRef.current = activeRecordingId;

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
    if (activeRecordingId) {
      setDetection(null);
    }
  }, [activeRecordingId]);

  if (data === undefined || !detection || activeRecordingId) {
    return null;
  }

  return (
    <div className="border-b border-border/40 bg-card/95 px-4 py-3 shadow-sm backdrop-blur transition-all">
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
            <strong className="font-medium text-foreground">{PLATFORM_CONFIG[detection.platform].label}</strong>. Would
            you like to start recording?
          </p>
        </div>
        <div className="flex items-center gap-2">
          {sttProviders.length > 0 ? (
            <ButtonGroup className="overflow-hidden rounded-lg border border-primary/20 bg-primary shadow-sm shadow-primary/10">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  void startRecording.mutateAsync({ platform: detection.platform }).then(
                    () => {
                      requestDismissMeeting(detection.key);
                      toast.success('Recording started', { id: 'meeting-recording-start-3' });
                    },
                    (error: unknown) => {
                      toast.error(getErrorMessage(error, 'Failed to start recording'), {
                        id: 'meeting-recording-start-3',
                      });
                    },
                  );
                }}
                disabled={startRecording.isPending}
                className="rounded-none px-2.5 text-primary-foreground hover:bg-primary/90">
                Start recording
              </Button>
              <ButtonGroupSeparator className="bg-primary-foreground/20" />
              <SttModelSelectorPopover
                defaultValue={defaultSttModel}
                onSelect={(value) => {
                  void startRecording
                    .mutateAsync({
                      platform: detection.platform,
                      sttProviderId: value.providerId,
                      sttModelId: value.modelId,
                    })
                    .then(
                      () => {
                        requestDismissMeeting(detection.key);
                        toast.success('Recording started', { id: 'meeting-recording-start-stt' });
                      },
                      (error: unknown) => {
                        toast.error(getErrorMessage(error, 'Failed to start recording'), {
                          id: 'meeting-recording-start-stt',
                        });
                      },
                    );
                }}
                sttProviders={sttProviders}
                triggerRender={
                  <Button
                    type="button"
                    size="sm"
                    disabled={startRecording.isPending}
                    className="rounded-none px-1.5 text-primary-foreground hover:bg-primary/90"
                    title="Choose transcription model and start">
                    <ChevronDownIcon className="size-3.5" />
                  </Button>
                }
              />
            </ButtonGroup>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                void startRecording.mutateAsync({ platform: detection.platform }).then(
                  () => {
                    requestDismissMeeting(detection.key);
                    toast.success('Recording started', { id: 'meeting-recording-start' });
                  },
                  (error: unknown) => {
                    toast.error(getErrorMessage(error, 'Failed to start recording'), { id: 'meeting-recording-start' });
                  },
                );
              }}
              disabled={startRecording.isPending}
              className="rounded-lg px-2.5 shadow-sm shadow-primary/10">
              Start recording
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              requestDismissMeeting(detection.key);
            }}
            className="text-muted-foreground hover:bg-muted hover:text-foreground">
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
