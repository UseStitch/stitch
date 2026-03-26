import { create } from 'zustand';

import type { PrefixedString } from '@stitch/shared/id';

type MeetingBannerStatus = 'idle' | 'detected' | 'recording' | 'finished';

type ActiveMeeting = {
  meetingId: PrefixedString<'rec'>;
  app: string;
  startedAt: number;
};

type MeetingState = {
  status: MeetingBannerStatus;
  meeting: ActiveMeeting | null;
  finishedDurationSecs: number | null;
};

type MeetingActions = {
  setDetected: (meetingId: PrefixedString<'rec'>, app: string, startedAt: number) => void;
  setRecordingMeeting: (meetingId: PrefixedString<'rec'>, app: string, startedAt: number) => void;
  setRecording: (startedAt?: number) => void;
  setFinished: (durationSecs: number) => void;
  clear: () => void;
};

export const useMeetingStore = create<MeetingState & MeetingActions>((set) => ({
  status: 'idle',
  meeting: null,
  finishedDurationSecs: null,

  setDetected: (meetingId, app, startedAt) =>
    set({
      status: 'detected',
      meeting: { meetingId, app, startedAt },
      finishedDurationSecs: null,
    }),

  setRecordingMeeting: (meetingId, app, startedAt) =>
    set({
      status: 'recording',
      meeting: { meetingId, app, startedAt },
      finishedDurationSecs: null,
    }),

  setRecording: (startedAt) =>
    set((state) => {
      if (!state.meeting) return state;
      return {
        status: 'recording',
        meeting: {
          ...state.meeting,
          startedAt: startedAt ?? Date.now(),
        },
      };
    }),

  setFinished: (durationSecs) =>
    set((state) => {
      if (!state.meeting) return state;
      return { status: 'finished', finishedDurationSecs: durationSecs };
    }),

  clear: () =>
    set({
      status: 'idle',
      meeting: null,
      finishedDurationSecs: null,
    }),
}));
