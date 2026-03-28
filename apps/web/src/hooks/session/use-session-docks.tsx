import * as React from 'react';

import { useSuspenseQuery, type UseMutationResult } from '@tanstack/react-query';

import { parseMcpToolName } from '@stitch/shared/mcp/types';
import type { PermissionResponse } from '@stitch/shared/permissions/types';
import type { QuestionRequest } from '@stitch/shared/questions/types';

import type { DockItem } from '@/components/chat/docks/dock';
import { DoomLoopDock } from '@/components/chat/docks/doom-loop-dock';
import { PermissionResponseDock } from '@/components/chat/docks/permission-response-dock';
import { QuestionDock } from '@/components/chat/docks/question-dock';
import { RetryDock } from '@/components/chat/docks/retry-dock';
import { agentsQueryOptions } from '@/lib/queries/agents';
import type { RetryInfo, DoomLoopInfo } from '@/stores/stream-store';

type UseSessionDocksOptions = {
  sessionId: string;
  retry: RetryInfo | null;
  doomLoop: DoomLoopInfo | null;
  pendingQuestions: QuestionRequest[];
  pendingPermissionResponses: PermissionResponse[];
  replyQuestion: UseMutationResult<
    unknown,
    Error,
    { sessionId: string; questionId: string; answers: string[][] }
  >;
  rejectQuestion: UseMutationResult<unknown, Error, { sessionId: string; questionId: string }>;
  allowPermissionResponse: UseMutationResult<
    unknown,
    Error,
    {
      sessionId: string;
      permissionResponseId: string;
      setPermission?: { permission: 'allow' | 'deny' | 'ask'; pattern?: string | null };
    }
  >;
  rejectPermissionResponse: UseMutationResult<
    unknown,
    Error,
    {
      sessionId: string;
      permissionResponseId: string;
      setPermission?: { permission: 'allow' | 'deny' | 'ask'; pattern?: string | null };
    }
  >;
  alternativePermissionResponse: UseMutationResult<
    unknown,
    Error,
    { sessionId: string; permissionResponseId: string; entry: string }
  >;
};

export function useSessionDocks({
  sessionId,
  retry,
  doomLoop,
  pendingQuestions,
  pendingPermissionResponses,
  replyQuestion,
  rejectQuestion,
  allowPermissionResponse,
  rejectPermissionResponse,
  alternativePermissionResponse,
}: UseSessionDocksOptions): DockItem[] {
  const { data: agents } = useSuspenseQuery(agentsQueryOptions);

  return React.useMemo(() => {
    const agentNameById = new Map<string, string>(agents.map((a) => [a.id, a.name]));
    const resolveSubAgentLabel = (subAgentId?: string): string | null => {
      if (!subAgentId) return null;
      return agentNameById.get(subAgentId) ?? 'sub-agent';
    };

    const items: DockItem[] = [];

    if (doomLoop) {
      items.push({
        id: 'doom-loop',
        title: 'Repeated action detected',
        defaultExpanded: true,
        variant: 'warning',
        children: <DoomLoopDock sessionId={sessionId} toolName={doomLoop.toolName} />,
      });
    }

    if (retry) {
      items.push({
        id: 'retry',
        title: `Retrying... (attempt ${retry.attempt}/${retry.maxRetries})`,
        defaultExpanded: true,
        variant: 'destructive',
        children: <RetryDock retry={retry} />,
      });
    }

    if (pendingQuestions.length > 0) {
      const subAgentLabel = resolveSubAgentLabel(pendingQuestions[0]?.subAgentId);
      const questionTitle = subAgentLabel ? `Questions (from ${subAgentLabel})` : 'Questions';

      items.push({
        id: 'questions',
        title: questionTitle,
        defaultExpanded: true,
        variant: 'primary',
        children: (
          <QuestionDock
            questions={pendingQuestions}
            onReply={async (questionId, answers) => {
              try {
                await replyQuestion.mutateAsync({ sessionId, questionId, answers });
              } catch (error) {
                console.error('Failed to reply to question:', error);
              }
            }}
            onReject={async (questionId) => {
              try {
                await rejectQuestion.mutateAsync({ sessionId, questionId });
              } catch (error) {
                console.error('Failed to reject question:', error);
              }
            }}
          />
        ),
      });
    }

    if (pendingPermissionResponses.length > 0) {
      const first = pendingPermissionResponses[0];
      const parsedTool = first ? parseMcpToolName(first.toolName) : null;
      const toolLabel = parsedTool?.toolName ?? first?.toolName ?? 'tool';
      const permSubAgentLabel = resolveSubAgentLabel(first?.subAgentId);
      const permTitle = permSubAgentLabel
        ? `Allow ${toolLabel}? (from ${permSubAgentLabel})`
        : `Allow ${toolLabel}?`;

      items.push({
        id: 'permission-response',
        title: permTitle,
        defaultExpanded: true,
        variant: 'primary',
        children: (
          <PermissionResponseDock
            permissionResponses={pendingPermissionResponses}
            onAllow={async (permissionResponseId) => {
              try {
                await allowPermissionResponse.mutateAsync({ sessionId, permissionResponseId });
              } catch (error) {
                console.error('Failed to allow tool:', error);
              }
            }}
            onAlwaysAllow={async (permissionResponseId) => {
              try {
                await allowPermissionResponse.mutateAsync({
                  sessionId,
                  permissionResponseId,
                  setPermission: {
                    permission: 'allow',
                    pattern: null,
                  },
                });
              } catch (error) {
                console.error('Failed to always allow tool:', error);
              }
            }}
            onReject={async (permissionResponseId) => {
              try {
                await rejectPermissionResponse.mutateAsync({ sessionId, permissionResponseId });
              } catch (error) {
                console.error('Failed to reject tool:', error);
              }
            }}
            onAlternative={async (permissionResponseId, entry) => {
              try {
                await alternativePermissionResponse.mutateAsync({
                  sessionId,
                  permissionResponseId,
                  entry,
                });
              } catch (error) {
                console.error('Failed to submit alternative action:', error);
              }
            }}
            onApplySuggestion={async (permissionResponseId, pattern) => {
              try {
                await allowPermissionResponse.mutateAsync({
                  sessionId,
                  permissionResponseId,
                  setPermission: {
                    permission: 'allow',
                    pattern,
                  },
                });
              } catch (error) {
                console.error('Failed to apply permission suggestion:', error);
              }
            }}
          />
        ),
      });
    }

    return items;
  }, [
    agents,
    doomLoop,
    retry,
    pendingQuestions,
    pendingPermissionResponses,
    sessionId,
    replyQuestion,
    rejectQuestion,
    allowPermissionResponse,
    rejectPermissionResponse,
    alternativePermissionResponse,
  ]);
}
