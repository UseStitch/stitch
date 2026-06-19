import { createFileRoute } from '@tanstack/react-router';

import { RecordingsSettings } from '@/components/settings/recordings';
import {
  enabledProviderModelsQueryOptions,
  sttProviderModelsQueryOptions,
} from '@/lib/queries/providers';
import {
  audioDevicesQueryOptions,
  audioPermissionsQueryOptions,
  meetingNoteTemplatesQueryOptions,
} from '@/lib/queries/recordings';
import { settingsQueryOptions } from '@/lib/queries/settings';

export const Route = createFileRoute('/settings/recordings')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(settingsQueryOptions),
      context.queryClient.ensureQueryData(sttProviderModelsQueryOptions),
      context.queryClient.ensureQueryData(enabledProviderModelsQueryOptions),
      context.queryClient.ensureQueryData(audioDevicesQueryOptions),
      context.queryClient.ensureQueryData(audioPermissionsQueryOptions),
      context.queryClient.ensureQueryData(meetingNoteTemplatesQueryOptions),
    ]),
  component: RecordingsSettings,
});
