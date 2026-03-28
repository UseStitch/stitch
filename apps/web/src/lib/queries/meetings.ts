import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type { PrefixedString } from '@stitch/shared/id';
import type { Meeting, Transcription } from '@stitch/shared/meetings/types';

import { getServerUrl, serverFetch } from '@/lib/api';
import { useMeetingStore } from '@/stores/meeting-store';

const meetingKeys = {
  all: ['meetings'] as const,
  list: () => [...meetingKeys.all, 'list'] as const,
  transcription: (meetingId: string) => [...meetingKeys.all, 'transcription', meetingId] as const,
  transcriptions: (meetingId: string) =>
    [...meetingKeys.all, 'transcriptions', meetingId] as const,
};

export const recordingsQueryOptions = queryOptions({
  queryKey: meetingKeys.list(),
  queryFn: async (): Promise<Meeting[]> => {
    const res = await serverFetch('/meetings');
    if (!res.ok) throw new Error('Failed to fetch recordings');
    return res.json() as Promise<Meeting[]>;
  },
});

export const transcriptionQueryOptions = (meetingId: string) =>
  queryOptions({
    queryKey: meetingKeys.transcription(meetingId),
    queryFn: async (): Promise<Transcription | null> => {
      const res = await serverFetch(`/meetings/${meetingId}/transcription`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch transcription');
      return res.json() as Promise<Transcription>;
    },
  });

export const transcriptionVersionsQueryOptions = (meetingId: string) =>
  queryOptions({
    queryKey: meetingKeys.transcriptions(meetingId),
    queryFn: async (): Promise<Transcription[]> => {
      const res = await serverFetch(`/meetings/${meetingId}/transcriptions`);
      if (!res.ok) throw new Error('Failed to fetch transcription versions');
      return res.json() as Promise<Transcription[]>;
    },
  });

export async function getAudioUrl(meetingId: string): Promise<string> {
  const baseUrl = await getServerUrl();
  return `${baseUrl}/meetings/${meetingId}/audio`;
}

export function useAcceptMeeting() {
  const setRecording = useMeetingStore((s) => s.setRecording);

  return useMutation({
    mutationFn: async (meetingId: string) => {
      const res = await serverFetch(`/meetings/${meetingId}/accept`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to accept meeting');
      return res.json();
    },
    onSuccess: () => {
      setRecording(Date.now());
    },
  });
}

export function useStartRecording() {
  const queryClient = useQueryClient();
  const setRecordingMeeting = useMeetingStore((s) => s.setRecordingMeeting);

  return useMutation({
    mutationFn: async (): Promise<{
      meetingId: PrefixedString<'rec'>;
      app: string;
      startedAt: number;
    }> => {
      const res = await serverFetch('/meetings/start', {
        method: 'POST',
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? 'Failed to start recording');
      }
      return res.json() as Promise<{
        meetingId: PrefixedString<'rec'>;
        app: string;
        startedAt: number;
      }>;
    },
    onSuccess: (meeting) => {
      setRecordingMeeting(meeting.meetingId, meeting.app, meeting.startedAt);
      void queryClient.invalidateQueries({ queryKey: meetingKeys.list() });
    },
  });
}

export function useStopRecording() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (meetingId: string) => {
      const res = await serverFetch(`/meetings/${meetingId}/stop`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to stop recording');
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: meetingKeys.list() });
    },
  });
}

export function useDismissMeeting() {
  const clear = useMeetingStore((s) => s.clear);

  return useMutation({
    mutationFn: async (meetingId: string) => {
      const res = await serverFetch(`/meetings/${meetingId}/dismiss`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to dismiss meeting');
      return res.json();
    },
    onSuccess: () => {
      clear();
    },
  });
}

export function useTranscribeMeeting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      meetingId: string;
      providerId: string;
      modelId: string;
    }): Promise<{ transcriptionId: string }> => {
      const res = await serverFetch(`/meetings/${input.meetingId}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: input.providerId,
          modelId: input.modelId,
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? 'Failed to start transcription');
      }
      return res.json() as Promise<{ transcriptionId: string }>;
    },
    onSuccess: (_, variables) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: meetingKeys.transcription(variables.meetingId) }),
        queryClient.invalidateQueries({ queryKey: meetingKeys.transcriptions(variables.meetingId) }),
      ]);
    },
  });
}

export function useDeleteTranscriptionVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { meetingId: string; transcriptionId: string }): Promise<void> => {
      const res = await serverFetch(
        `/meetings/${input.meetingId}/transcriptions/${input.transcriptionId}`,
        {
          method: 'DELETE',
        },
      );

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? 'Failed to delete transcription version');
      }
    },
    onSuccess: (_, variables) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: meetingKeys.transcription(variables.meetingId) }),
        queryClient.invalidateQueries({ queryKey: meetingKeys.transcriptions(variables.meetingId) }),
      ]);
    },
  });
}

export function useDeleteMeeting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (meetingId: string): Promise<void> => {
      const res = await serverFetch(`/meetings/${meetingId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete recording');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: meetingKeys.list() });
    },
  });
}

export { meetingKeys };
