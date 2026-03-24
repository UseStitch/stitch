import { queryOptions, useMutation } from '@tanstack/react-query';

import type { Meeting } from '@stitch/shared/meetings/types';

import { getServerUrl, serverFetch } from '@/lib/api';
import { useMeetingStore } from '@/stores/meeting-store';

const meetingKeys = {
  all: ['meetings'] as const,
  list: () => [...meetingKeys.all, 'list'] as const,
};

export const recordingsQueryOptions = queryOptions({
  queryKey: meetingKeys.list(),
  queryFn: async (): Promise<Meeting[]> => {
    const res = await serverFetch('/meetings');
    if (!res.ok) throw new Error('Failed to fetch recordings');
    return res.json() as Promise<Meeting[]>;
  },
});

export async function getAudioUrl(meetingId: string, track: 'mic' | 'speaker'): Promise<string> {
  const baseUrl = await getServerUrl();
  return `${baseUrl}/meetings/${meetingId}/audio/${track}`;
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
      setRecording();
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
