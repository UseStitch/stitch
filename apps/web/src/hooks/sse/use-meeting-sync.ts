import * as React from 'react';

import { useQueryClient } from '@tanstack/react-query';

import type { Meeting } from '@stitch/shared/meetings/types';

import { useSSE } from '@/hooks/sse/sse-context';
import { serverFetch } from '@/lib/api';
import { meetingKeys } from '@/lib/queries/meetings';
import { useMeetingStore } from '@/stores/meeting-store';

function useMeetingSync(): void {
  const { setDetected, setRecording, setFinished, clear } = useMeetingStore();
  const queryClient = useQueryClient();

  React.useEffect(() => {
    void serverFetch('/meetings/active').then(async (res) => {
      if (!res.ok) return;
      const meetings: Meeting[] = await res.json();
      if (meetings.length === 0) return;

      const active = meetings[0];
      setDetected(active.id, active.app, active.startedAt);
      if (active.status === 'recording') {
        setRecording();
      }
    });
  }, [setDetected, setRecording]);

  useSSE({
    'meeting-detected': (data) => {
      setDetected(data.meetingId, data.app, data.startedAt);
      void queryClient.invalidateQueries({ queryKey: meetingKeys.list() });
    },
    'meeting-recording-finished': (data) => {
      setFinished(data.durationSecs);
      void queryClient.invalidateQueries({ queryKey: meetingKeys.list() });
    },
    'meeting-ended': () => {
      clear();
      void queryClient.invalidateQueries({ queryKey: meetingKeys.list() });
    },
  });
}

export function MeetingSync() {
  useMeetingSync();
  return null;
}
