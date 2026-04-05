import { createFileRoute, redirect } from '@tanstack/react-router';

import { SessionPage } from '@/components/session/session-page';
import { useActions } from '@/lib/actions';
import { sessionMessagesInfiniteQueryOptions, sessionQueryOptions } from '@/lib/queries/chat';
import {
  enabledProviderModelsQueryOptions,
  visibleProviderModelsQueryOptions,
} from '@/lib/queries/providers';
import { queuedMessagesQueryOptions } from '@/lib/queries/queue';
import { settingsQueryOptions } from '@/lib/queries/settings';
import { useSessionHotkeys } from '@/lib/use-session-hotkeys';

export const Route = createFileRoute('/automations/sessions/$id')({
  loader: async ({ context, params }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions(params.id));

    if (session.type !== 'automation') {
      throw redirect({ to: '/session/$id', params: { id: params.id } });
    }

    await Promise.all([
      context.queryClient.ensureInfiniteQueryData(sessionMessagesInfiniteQueryOptions(params.id)),
      context.queryClient.ensureQueryData(enabledProviderModelsQueryOptions),
      context.queryClient.ensureQueryData(visibleProviderModelsQueryOptions),
      context.queryClient.ensureQueryData(settingsQueryOptions),
      context.queryClient.ensureQueryData(queuedMessagesQueryOptions(params.id)),
    ]);
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  const actions = useActions();
  useSessionHotkeys(actions);

  return <SessionPage sessionId={id} />;
}
