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
  list: () => [...recordingsKeys.all, 'list'] as const,
};

export const recordingsQueryOptions = queryOptions({
  queryKey: recordingsKeys.list(),
  queryFn: async (): Promise<ListRecordingsResponse> => {
    const res = await serverFetch('/recordings');
    if (!res.ok) throw new Error('Failed to fetch recordings');
    return res.json() as Promise<ListRecordingsResponse>;
  },
  refetchInterval: 2_000,
});

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
