import { toast } from 'sonner';

import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

import type { SortDirection } from '@stitch/shared/pagination';
import type {
  ActiveRecordingResponse,
  ListMeetingNoteTemplatesResponse,
  ListRecordingsResponse,
  MeetingNoteTemplateInput,
  MeetingNoteTemplateResponse,
  RecordingSortField,
  RecordingDetailsResponse,
  StartRecordingInput,
  StartRecordingAnalysisResponse,
  StartRecordingResponse,
  StopRecordingResponse,
} from '@stitch/shared/recordings/types';

import { serverRequest } from '@/lib/api';

export const recordingsKeys = {
  all: ['recordings'] as const,
  lists: () => [...recordingsKeys.all, 'list'] as const,
  list: (input: { page: number; pageSize: number; sort: RecordingSortField; sortDirection: SortDirection }) =>
    [...recordingsKeys.lists(), input] as const,
  infiniteList: (pageSize: number) => [...recordingsKeys.lists(), 'infinite', pageSize, 'startedAt', 'desc'] as const,
  details: () => [...recordingsKeys.all, 'detail'] as const,
  detail: (recordingId: string) => [...recordingsKeys.details(), recordingId] as const,
  active: () => [...recordingsKeys.all, 'active'] as const,
  devices: () => [...recordingsKeys.all, 'devices'] as const,
  templates: () => [...recordingsKeys.all, 'templates'] as const,
  permissions: () => [...recordingsKeys.all, 'permissions'] as const,
};

const RECORDINGS_PAGE_SIZE = 12;

export function recordingsQueryOptions(input: {
  page: number;
  pageSize: number;
  sort: RecordingSortField;
  sortDirection: SortDirection;
}) {
  return queryOptions({
    queryKey: recordingsKeys.list(input),
    queryFn: () => serverRequest<ListRecordingsResponse>('/recordings', { params: input }),
    placeholderData: keepPreviousData,
  });
}

export const recordingsInfiniteQueryOptions = () =>
  infiniteQueryOptions({
    queryKey: recordingsKeys.infiniteList(RECORDINGS_PAGE_SIZE),
    queryFn: ({ pageParam }) =>
      serverRequest<ListRecordingsResponse>('/recordings', {
        params: { page: pageParam, pageSize: RECORDINGS_PAGE_SIZE, sort: 'startedAt', sortDirection: 'desc' },
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.page >= lastPage.totalPages) return undefined;
      return lastPage.page + 1;
    },
    placeholderData: keepPreviousData,
  });

export const activeRecordingQueryOptions = queryOptions({
  queryKey: recordingsKeys.active(),
  queryFn: () => serverRequest<ActiveRecordingResponse>('/recordings/active'),
});

export const meetingNoteTemplatesQueryOptions = queryOptions({
  queryKey: recordingsKeys.templates(),
  queryFn: () => serverRequest<ListMeetingNoteTemplatesResponse>('/recordings/templates'),
});

export function useCreateMeetingNoteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: MeetingNoteTemplateInput) =>
      serverRequest<MeetingNoteTemplateResponse>('/recordings/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recordingsKeys.templates() });
      toast.success('Template created', { id: 'recording-template-create' });
    },
    onError: (error) => toast.error(error.message, { id: 'recording-template-create' }),
  });
}

export function useUpdateMeetingNoteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { id: string; template: MeetingNoteTemplateInput }) =>
      serverRequest<MeetingNoteTemplateResponse>(`/recordings/templates/${input.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input.template),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recordingsKeys.templates() });
      toast.success('Template saved', { id: 'recording-template-update' });
    },
    onError: (error) => toast.error(error.message, { id: 'recording-template-update' }),
  });
}

export function useDeleteMeetingNoteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => serverRequest<void>(`/recordings/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recordingsKeys.templates() });
      toast.success('Template deleted', { id: 'recording-template-delete' });
    },
    onError: (error) => toast.error(error.message, { id: 'recording-template-delete' }),
  });
}

type AudioDeviceList = { microphoneDevices: string[]; speakerDevices: string[] };

type PermissionState = 'granted' | 'denied' | 'unknown';

type AudioPermissionsStatus = { microphone: PermissionState; screenCapture: PermissionState };

export const audioDevicesQueryOptions = queryOptions({
  queryKey: recordingsKeys.devices(),
  queryFn: (): Promise<AudioDeviceList> => window.api.recording.listDevices(),
  refetchInterval: 5_000,
  staleTime: 2_000,
});

export const audioPermissionsQueryOptions = queryOptions({
  queryKey: recordingsKeys.permissions(),
  queryFn: (): Promise<AudioPermissionsStatus> => window.api.recording.checkPermissions(),
  staleTime: 10_000,
});

async function preflightPermissionCheck(): Promise<void> {
  try {
    // Request microphone permission via Electron (triggers native macOS prompt)
    await window.api.permissions.requestMicrophone();

    // Prime system audio: the kTCCServiceAudioCapture prompt only fires once IO
    // starts on a tap-backed device — there is no request-style API for it.
    const status = await window.api.recording.primeSystemAudio();
    if (status.screenCapture !== 'granted') {
      void window.api.permissions.openScreenCaptureSettings();
      throw new Error(
        'Audio capture permission is needed. Allow "System Audio Recording" when prompted, or toggle on Stitch under "Screen & System Audio Recording" in System Settings, then click Start Recording again.',
      );
    }
  } catch (error) {
    if (Error.isError(error) && error.message.includes('permission is needed')) {
      throw error;
    }
    if (Error.isError(error) && error.message.includes('access is denied')) {
      throw error;
    }
  }
}

export function useStartRecording() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: StartRecordingInput): Promise<StartRecordingResponse> => {
      await preflightPermissionCheck();
      return window.api.recording.start(input);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recordingsKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: recordingsKeys.active() });
    },
  });
}

export function useStopRecording() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (): Promise<StopRecordingResponse> => window.api.recording.stop(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recordingsKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: recordingsKeys.active() });
    },
  });
}

export function useDeleteRecording() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recordingId: string) => serverRequest<void>(`/recordings/${recordingId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recordingsKeys.lists() });
    },
  });
}

export function recordingDetailsQueryOptions(recordingId: string) {
  return queryOptions({
    queryKey: recordingsKeys.detail(recordingId),
    queryFn: () => serverRequest<RecordingDetailsResponse>(`/recordings/${recordingId}`),
  });
}

export function useStartRecordingAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { recordingId: string; force?: boolean; templateId: string }) =>
      serverRequest<StartRecordingAnalysisResponse>(`/recordings/${input.recordingId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: input.templateId }),
        params: { force: input.force ? '1' : undefined },
      }),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: recordingsKeys.detail(variables.recordingId) });
    },
  });
}

export function useCancelRecordingAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recordingId: string) =>
      serverRequest<void>(`/recordings/${recordingId}/analysis/cancel`, { method: 'POST' }),
    onSuccess: (_, recordingId) => {
      void queryClient.invalidateQueries({ queryKey: recordingsKeys.detail(recordingId) });
    },
  });
}
