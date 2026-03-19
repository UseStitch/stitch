import * as React from 'react';

import { useQuery } from '@tanstack/react-query';

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

  const pendingQuestions = React.useMemo(
    () => questionsQuery.data?.filter((question) => question.status === 'pending') ?? [],
    [questionsQuery.data],
  );

  const pendingPermissionResponses = React.useMemo(
    () => permissionResponsesQuery.data?.filter((permission) => permission.status === 'pending') ?? [],
    [permissionResponsesQuery.data],
  );

  return {
    pendingQuestions,
    pendingPermissionResponses,
    replyQuestion: useReplyQuestion(),
    rejectQuestion: useRejectQuestion(),
    allowPermissionResponse: useAllowPermissionResponse(),
    rejectPermissionResponse: useRejectPermissionResponse(),
    alternativePermissionResponse: useAlternativePermissionResponse(),
  };
}
