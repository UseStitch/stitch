import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  ListRecordingsResponse,
  RecordingAnalysisResponse,
  StartRecordingInput,
  StartRecordingAnalysisResponse,
  StartRecordingResponse,
  StopRecordingResponse,
} from '@stitch/shared/recordings/types';

import { serverRequest } from '@/lib/api';

const recordingsKeys = {
  all: ['recordings'] as const,
  lists: () => [...recordingsKeys.all, 'list'] as const,
  list: (page: number, pageSize: number) => [...recordingsKeys.lists(), page, pageSize] as const,
  analysis: (recordingId: string) => [...recordingsKeys.all, 'analysis', recordingId] as const,
  devices: () => [...recordingsKeys.all, 'devices'] as const,
};

export function recordingsQueryOptions(input: { page: number; pageSize: number }) {
  return queryOptions({
    queryKey: recordingsKeys.list(input.page, input.pageSize),
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(input.page),
        pageSize: String(input.pageSize),
      });
      return serverRequest<ListRecordingsResponse>(`/recordings?${params.toString()}`);
    },
  });
}

type AudioDeviceList = {
  microphoneDevices: string[];
  speakerDevices: string[];
};

type PermissionState = 'granted' | 'denied' | 'unknown';

type AudioPermissionsStatus = {
  microphone: PermissionState;
  screenCapture: PermissionState;
};

export const audioDevicesQueryOptions = queryOptions({
  queryKey: recordingsKeys.devices(),
  queryFn: async (): Promise<AudioDeviceList> => {
    if (!window.api?.recording?.listDevices) {
      throw new Error('Audio devices are only available from the desktop app');
    }

    return window.api.recording.listDevices();
  },
  refetchInterval: 5_000,
  staleTime: 2_000,
});

export const audioPermissionsQueryOptions = queryOptions({
  queryKey: ['recordings', 'permissions'] as const,
  queryFn: async (): Promise<AudioPermissionsStatus> => {
    if (!window.api?.recording?.checkPermissions) {
      throw new Error('Audio permissions are only available from the desktop app');
    }

    return window.api.recording.checkPermissions();
  },
  staleTime: 10_000,
});

async function preflightPermissionCheck(): Promise<void> {
  try {
    // Request microphone permission via Electron (triggers native macOS prompt)
    if (window.api?.permissions?.requestMicrophone) {
      await window.api.permissions.requestMicrophone();
    }

    // Prime system audio: the kTCCServiceAudioCapture prompt only fires once IO
    // starts on a tap-backed device — there is no request-style API for it.
    if (window.api?.recording?.primeSystemAudio) {
      const status = await window.api.recording.primeSystemAudio();
      if (status.screenCapture !== 'granted') {
        if (window.api?.permissions?.openScreenCaptureSettings) {
          void window.api.permissions.openScreenCaptureSettings();
        }
        throw new Error(
          'Audio capture permission is needed. Allow "System Audio Recording" when prompted, or toggle on Stitch under "Screen & System Audio Recording" in System Settings, then click Start Recording again.',
        );
      }
      return;
    }

    // Check screen capture permission from the Electron main process.
    if (window.api?.permissions?.getScreenCaptureStatus) {
      const status = await window.api.permissions.getScreenCaptureStatus();
      if (status !== 'granted') {
        if (window.api?.permissions?.openScreenCaptureSettings) {
          void window.api.permissions.openScreenCaptureSettings();
        }
        throw new Error(
          'Audio capture permission is needed. In the System Settings window, toggle on Stitch under "Screen & System Audio Recording", then click Start Recording again.',
        );
      }
      return;
    }

    if (window.api?.recording?.checkPermissions) {
      const permissions = await window.api.recording.checkPermissions();
      if (permissions.microphone === 'granted' && permissions.screenCapture === 'granted') {
        return;
      }

      const issues: string[] = [];

      if (permissions.microphone !== 'granted') {
        issues.push(
          'Microphone access is denied. Grant microphone permission in System Settings > Privacy & Security > Microphone.',
        );
      }
      if (permissions.screenCapture !== 'granted') {
        issues.push(
          'Audio capture permission is needed. Toggle on Stitch under "Screen & System Audio Recording" in System Settings > Privacy & Security.',
        );
      }

      if (issues.length > 0) {
        throw new Error(issues.join('\n'));
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('permission is needed')) {
      throw error;
    }
    if (error instanceof Error && error.message.includes('access is denied')) {
      throw error;
    }
  }
}

export function useStartRecording() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: StartRecordingInput): Promise<StartRecordingResponse> => {
      await preflightPermissionCheck();

      if (window.api?.recording?.start) {
        return window.api.recording.start(input);
      }

      return serverRequest<StartRecordingResponse>('/recordings/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recordingsKeys.lists() });
    },
  });
}

export function useStopRecording() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (): Promise<StopRecordingResponse> => {
      if (window.api?.recording?.stop) {
        return window.api.recording.stop();
      }

      return serverRequest<StopRecordingResponse>('/recordings/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationMs: null, fileSizeBytes: null }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recordingsKeys.lists() });
    },
  });
}

export function useDeleteRecording() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recordingId: string) =>
      serverRequest<void>(`/recordings/${recordingId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recordingsKeys.lists() });
    },
  });
}

export function recordingAnalysisQueryOptions(recordingId: string) {
  return queryOptions({
    queryKey: recordingsKeys.analysis(recordingId),
    queryFn: () => serverRequest<RecordingAnalysisResponse>(`/recordings/${recordingId}/analysis`),
  });
}

export function useStartRecordingAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { recordingId: string; force?: boolean }) => {
      const params = new URLSearchParams();
      if (input.force) {
        params.set('force', '1');
      }
      const suffix = params.toString();
      return serverRequest<StartRecordingAnalysisResponse>(
        `/recordings/${input.recordingId}/analyze${suffix ? `?${suffix}` : ''}`,
        { method: 'POST' },
      );
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: recordingsKeys.analysis(variables.recordingId),
      });
    },
  });
}

export function useCancelRecordingAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recordingId: string) =>
      serverRequest<void>(`/recordings/${recordingId}/analysis/cancel`, {
        method: 'POST',
      }),
    onSuccess: (_, recordingId) => {
      void queryClient.invalidateQueries({ queryKey: recordingsKeys.analysis(recordingId) });
    },
  });
}
