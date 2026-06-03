import { createFileRoute, redirect } from '@tanstack/react-router';

import { SessionPage } from '@/components/session/session-page';
import { useActions } from '@/lib/actions';
import { sessionQueryOptions, sessionMessagesInfiniteQueryOptions } from '@/lib/queries/chat';
import { visibleProviderModelsQueryOptions } from '@/lib/queries/providers';
import { queuedMessagesQueryOptions } from '@/lib/queries/queue';
import { useSessionHotkeys } from '@/lib/use-session-hotkeys';

export const Route = createFileRoute('/session/$id')({
  loader: async ({ context, params }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions(params.id));

    if (session.type === 'automation') {
      throw redirect({ to: '/automations/sessions/$id', params: { id: params.id } });
    }

    await Promise.all([
      context.queryClient.ensureInfiniteQueryData(sessionMessagesInfiniteQueryOptions(params.id)),
      context.queryClient.ensureQueryData(visibleProviderModelsQueryOptions),
      context.queryClient.ensureQueryData(queuedMessagesQueryOptions(params.id)),
    ]);
  },
  component: SessionRouteComponent,
});

function SessionRouteComponent() {
  const { id } = Route.useParams();

  const actions = useActions();
  useSessionHotkeys(actions);

  return <SessionPage sessionId={id} />;
}
