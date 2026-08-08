import { useQuery } from '@tanstack/react-query';

import { mcpElicitationsQueryOptions, useRespondMcpElicitation } from '@/lib/queries/mcp-elicitations';
import {
  permissionResponsesQueryOptions,
  useAllowPermissionResponse,
  useAlternativePermissionResponse,
  useRejectPermissionResponse,
} from '@/lib/queries/permissions';
import { questionsQueryOptions, useRejectQuestion, useReplyQuestion } from '@/lib/queries/questions';

export function useSessionPendingItems(sessionId: string) {
  const questionsQuery = useQuery(questionsQueryOptions(sessionId));
  const permissionResponsesQuery = useQuery(permissionResponsesQueryOptions(sessionId));
  const mcpElicitationsQuery = useQuery(mcpElicitationsQueryOptions(sessionId));

  const pendingQuestions = questionsQuery.data?.filter((question) => question.status === 'pending') ?? [];

  const pendingPermissionResponses = permissionResponsesQuery.data ?? [];

  return {
    pendingQuestions,
    pendingPermissionResponses,
    pendingMcpElicitations: mcpElicitationsQuery.data ?? [],
    replyQuestion: useReplyQuestion(),
    rejectQuestion: useRejectQuestion(),
    allowPermissionResponse: useAllowPermissionResponse(),
    rejectPermissionResponse: useRejectPermissionResponse(),
    alternativePermissionResponse: useAlternativePermissionResponse(),
    respondMcpElicitation: useRespondMcpElicitation(),
  };
}
