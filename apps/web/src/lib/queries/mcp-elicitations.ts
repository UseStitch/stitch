import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type { McpElicitationAction, McpElicitationContent, McpElicitationRequest } from '@stitch/shared/mcp/types';

import { serverRequest } from '@/lib/api';

export const mcpElicitationKeys = {
  all: ['mcp-elicitations'] as const,
  list: (sessionId: string) => [...mcpElicitationKeys.all, 'list', sessionId] as const,
};

export function mcpElicitationsQueryOptions(sessionId: string) {
  return queryOptions({
    queryKey: mcpElicitationKeys.list(sessionId),
    queryFn: () => serverRequest<McpElicitationRequest[]>(`/chat/sessions/${sessionId}/mcp-elicitations`),
  });
}

type RespondInput = {
  sessionId: string;
  elicitationId: string;
  action: McpElicitationAction;
  content?: McpElicitationContent;
};

export function useRespondMcpElicitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RespondInput) =>
      serverRequest<null>(`/chat/sessions/${input.sessionId}/mcp-elicitations/${input.elicitationId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: input.action, content: input.content }),
      }),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: mcpElicitationKeys.list(input.sessionId) });
    },
  });
}
