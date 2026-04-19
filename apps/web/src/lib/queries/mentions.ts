import { queryOptions } from '@tanstack/react-query';

import type { MentionSuggestion, MentionSuggestionsResponse } from '@stitch/shared/chat/mentions';

import { serverFetch } from '@/lib/api';

const mentionKeys = {
  all: ['mentions'] as const,
  suggestions: (q: string) => [...mentionKeys.all, 'suggestions', q] as const,
};

export const mentionSuggestionsQueryOptions = (q: string) =>
  queryOptions({
    queryKey: mentionKeys.suggestions(q),
    queryFn: async (): Promise<MentionSuggestion[]> => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      const res = await serverFetch(`/chat/mentions/suggestions?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch mention suggestions');
      const data = (await res.json()) as MentionSuggestionsResponse;
      return data.suggestions;
    },
    staleTime: 30_000,
  });
