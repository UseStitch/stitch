import { createFileRoute } from '@tanstack/react-router';

import { RecordingsSettings } from '@/components/settings/recordings';
import { audioProviderModelsQueryOptions, transcriptionProviderModelsQueryOptions } from '@/lib/queries/providers';
import { audioDevicesQueryOptions, audioPermissionsQueryOptions } from '@/lib/queries/recordings';
import { settingsQueryOptions } from '@/lib/queries/settings';

export const Route = createFileRoute('/settings/recordings')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(settingsQueryOptions),
      context.queryClient.ensureQueryData(transcriptionProviderModelsQueryOptions),
      context.queryClient.ensureQueryData(audioProviderModelsQueryOptions),
      context.queryClient.ensureQueryData(audioDevicesQueryOptions),
      context.queryClient.ensureQueryData(audioPermissionsQueryOptions),
    ]),
  component: RecordingsSettings,
});
