import { createFileRoute } from '@tanstack/react-router';

import { ConnectorsPage } from '@/components/connectors/connectors-page';
import {
  connectorDefinitionsQueryOptions,
  connectorInstancesQueryOptions,
} from '@/lib/queries/connectors';

export const Route = createFileRoute('/connectors')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(connectorDefinitionsQueryOptions),
      context.queryClient.ensureQueryData(connectorInstancesQueryOptions),
    ]),
  component: ConnectorsPage,
});
