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
