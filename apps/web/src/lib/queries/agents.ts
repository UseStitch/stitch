import { queryOptions } from '@tanstack/react-query';

import { serverFetch } from '@/lib/api';
import type { Agent } from '@openwork/shared';

const agentKeys = {
  all: ['agents'] as const,
  list: () => [...agentKeys.all, 'list'] as const,
};

export const agentsQueryOptions = queryOptions({
  queryKey: agentKeys.list(),
  staleTime: Infinity,
  queryFn: async (): Promise<Agent[]> => {
    const res = await serverFetch('/agents');
    if (!res.ok) throw new Error('Failed to fetch agents');
    return res.json() as Promise<Agent[]>;
  },
});
