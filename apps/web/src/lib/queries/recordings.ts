import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  ListRecordingsResponse,
  StartRecordingInput,
  StartRecordingResponse,
  StopRecordingResponse,
} from '@stitch/shared/recordings/types';

import { serverFetch } from '@/lib/api';

const recordingsKeys = {
  all: ['recordings'] as const,
  list: (page: number, pageSize: number) => [...recordingsKeys.all, 'list', page, pageSize] as const,
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

export function useStartRecording() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: StartRecordingInput): Promise<StartRecordingResponse> => {
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
