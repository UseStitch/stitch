import { createFileRoute } from '@tanstack/react-router';

import { ShortcutsSettings } from '@/components/settings/shortcuts';
import { settingsQueryOptions } from '@/lib/queries/settings';
import { shortcutsQueryOptions } from '@/lib/queries/shortcuts';

export const Route = createFileRoute('/settings/shortcuts')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(settingsQueryOptions),
      context.queryClient.ensureQueryData(shortcutsQueryOptions),
    ]),
  component: ShortcutsSettings,
});
