import { createFileRoute } from '@tanstack/react-router';

import { SessionPage } from '@/components/session/session-page';
import { agentsQueryOptions } from '@/lib/queries/agents';
import { sessionQueryOptions, sessionMessagesInfiniteQueryOptions } from '@/lib/queries/chat';
import {
  enabledProviderModelsQueryOptions,
  visibleProviderModelsQueryOptions,
} from '@/lib/queries/providers';
import { queuedMessagesQueryOptions } from '@/lib/queries/queue';
import { settingsQueryOptions } from '@/lib/queries/settings';

export const Route = createFileRoute('/session/$id')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(sessionQueryOptions(params.id)),
      context.queryClient.ensureInfiniteQueryData(sessionMessagesInfiniteQueryOptions(params.id)),
      context.queryClient.ensureQueryData(agentsQueryOptions),
      context.queryClient.ensureQueryData(enabledProviderModelsQueryOptions),
      context.queryClient.ensureQueryData(visibleProviderModelsQueryOptions),
      context.queryClient.ensureQueryData(settingsQueryOptions),
      context.queryClient.ensureQueryData(queuedMessagesQueryOptions(params.id)),
    ]),
  component: SessionRouteComponent,
});

function SessionRouteComponent() {
  const { id } = Route.useParams();
  return <SessionPage sessionId={id} />;
}
