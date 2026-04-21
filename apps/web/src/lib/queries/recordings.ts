import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  ListRecordingsResponse,
  RecordingAnalysisResponse,
  StartRecordingInput,
  StartRecordingAnalysisResponse,
  StartRecordingResponse,
  StopRecordingResponse,
} from '@stitch/shared/recordings/types';

import { serverFetch } from '@/lib/api';

const recordingsKeys = {
  all: ['recordings'] as const,
  list: (page: number, pageSize: number) =>
    [...recordingsKeys.all, 'list', page, pageSize] as const,
  analysis: (recordingId: string) => [...recordingsKeys.all, 'analysis', recordingId] as const,
  devices: () => [...recordingsKeys.all, 'devices'] as const,
};

export function recordingsQueryOptions(input: { page: number; pageSize: number }) {
  return queryOptions({
    queryKey: recordingsKeys.list(input.page, input.pageSize),
    queryFn: async (): Promise<ListRecordingsResponse> => {
      const params = new URLSearchParams({
        page: String(input.page),
        pageSize: String(input.pageSize),
      });
      const res = await serverFetch(`/recordings?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch recordings');
      return res.json() as Promise<ListRecordingsResponse>;
    },
    refetchInterval: 2_000,
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
    const res = await serverFetch('/recordings/devices');
    if (!res.ok) throw new Error('Failed to fetch audio devices');
    return res.json() as Promise<AudioDeviceList>;
  },
  refetchInterval: 5_000,
  staleTime: 2_000,
});

export const audioPermissionsQueryOptions = queryOptions({
  queryKey: ['recordings', 'permissions'] as const,
  queryFn: async (): Promise<AudioPermissionsStatus> => {
    const res = await serverFetch('/recordings/permissions');
    if (!res.ok) throw new Error('Failed to check audio permissions');
    return res.json() as Promise<AudioPermissionsStatus>;
  },
  staleTime: 10_000,
});

async function preflightPermissionCheck(): Promise<void> {
  try {
    // Request microphone permission via Electron (triggers native macOS prompt)
    if (window.api?.permissions?.requestMicrophone) {
      await window.api.permissions.requestMicrophone();
    }

    // Check screen capture permission from the Electron main process.
    // This is more reliable than the native binary's TCC check because it
    // queries from the actual app process (correct code signing identity).
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

    // Fallback for non-Electron (dev server): use the native binary check
    const res = await serverFetch('/recordings/permissions');
    if (!res.ok) return;

    const permissions = (await res.json()) as AudioPermissionsStatus;

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

      const res = await serverFetch('/recordings/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to start recording');
      }

      return res.json() as Promise<StartRecordingResponse>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recordingsKeys.all });
    },
  });
}

export function useStopRecording() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<StopRecordingResponse> => {
      const res = await serverFetch('/recordings/stop', { method: 'POST' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to stop recording');
      }
      return res.json() as Promise<StopRecordingResponse>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recordingsKeys.all });
    },
  });
}

export function useDeleteRecording() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recordingId: string): Promise<void> => {
      const res = await serverFetch(`/recordings/${recordingId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to delete recording');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recordingsKeys.all });
    },
  });
}

export function recordingAnalysisQueryOptions(recordingId: string) {
  return queryOptions({
    queryKey: recordingsKeys.analysis(recordingId),
    queryFn: async (): Promise<RecordingAnalysisResponse> => {
      const res = await serverFetch(`/recordings/${recordingId}/analysis`);
      if (!res.ok) throw new Error('Failed to fetch recording analysis');
      return res.json() as Promise<RecordingAnalysisResponse>;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.analysis?.status;
      return status === 'pending' || status === 'processing' ? 1_000 : false;
    },
  });
}

export function useStartRecordingAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      recordingId: string;
      force?: boolean;
    }): Promise<StartRecordingAnalysisResponse> => {
      const params = new URLSearchParams();
      if (input.force) {
        params.set('force', '1');
      }
      const suffix = params.toString();
      const res = await serverFetch(
        `/recordings/${input.recordingId}/analyze${suffix ? `?${suffix}` : ''}`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to start recording analysis');
      }
      return res.json() as Promise<StartRecordingAnalysisResponse>;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: recordingsKeys.analysis(variables.recordingId),
      });
      void queryClient.invalidateQueries({ queryKey: recordingsKeys.all });
    },
  });
}

export function useCancelRecordingAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recordingId: string): Promise<void> => {
      const res = await serverFetch(`/recordings/${recordingId}/analysis/cancel`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to cancel recording analysis');
      }
    },
    onSuccess: (_, recordingId) => {
      void queryClient.invalidateQueries({ queryKey: recordingsKeys.analysis(recordingId) });
      void queryClient.invalidateQueries({ queryKey: recordingsKeys.all });
    },
  });
}
