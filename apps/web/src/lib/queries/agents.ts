import { queryOptions } from '@tanstack/react-query';

import type { Agent } from '@openwork/shared';

import { serverFetch } from '@/lib/api';

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
