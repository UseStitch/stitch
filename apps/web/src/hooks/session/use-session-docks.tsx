import * as React from 'react';

import type { UseMutationResult } from '@tanstack/react-query';

import { parseMcpToolName } from '@stitch/shared/mcp/types';
import type { PermissionResponse } from '@stitch/shared/permissions/types';
import type { QuestionRequest } from '@stitch/shared/questions/types';
import type { SessionTodo } from '@stitch/shared/todos/types';

import type { DockItem } from '@/components/chat/docks/dock';
import { DoomLoopDock } from '@/components/chat/docks/doom-loop-dock';
import { PermissionResponseDock } from '@/components/chat/docks/permission-response-dock';
import { QuestionDock } from '@/components/chat/docks/question-dock';
import { RetryDock } from '@/components/chat/docks/retry-dock';
import { TodoDock } from '@/components/chat/docks/todo-dock';
import type { RetryInfo, DoomLoopInfo } from '@/stores/stream-store';

type UseSessionDocksOptions = {
  sessionId: string;
  retry: RetryInfo | null;
  doomLoop: DoomLoopInfo | null;
  pendingQuestions: QuestionRequest[];
  pendingPermissionResponses: PermissionResponse[];
  todos: SessionTodo[];
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
  todos,
  replyQuestion,
  rejectQuestion,
  allowPermissionResponse,
  rejectPermissionResponse,
  alternativePermissionResponse,
}: UseSessionDocksOptions): DockItem[] {
  return React.useMemo(() => {
    const items: DockItem[] = [];

    const runMutation = async (action: () => Promise<unknown>, errorMessage: string) => {
      try {
        await action();
      } catch (error) {
        console.error(errorMessage, error);
      }
    };

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
      const request = pendingQuestions[0];
      if (request) {
        items.push({
          id: 'questions',
          title: 'Questions',
          defaultExpanded: true,
          variant: 'primary',
          children: (
            <QuestionDock
              request={request}
              onReply={async (questionId, answers) => {
                await runMutation(
                  () => replyQuestion.mutateAsync({ sessionId, questionId, answers }),
                  'Failed to reply to question:',
                );
              }}
              onReject={async (questionId) => {
                await runMutation(
                  () => rejectQuestion.mutateAsync({ sessionId, questionId }),
                  'Failed to reject question:',
                );
              }}
            />
          ),
        });
      }
    }

    if (pendingPermissionResponses.length > 0) {
      const permissionResponse = pendingPermissionResponses[0];
      if (permissionResponse) {
        const parsedTool = parseMcpToolName(permissionResponse.toolName);
        const toolLabel = parsedTool?.toolName ?? permissionResponse.toolName;

        items.push({
          id: 'permission-response',
          title: `Allow ${toolLabel}?`,
          defaultExpanded: true,
          variant: 'primary',
          children: (
            <PermissionResponseDock
              permissionResponse={permissionResponse}
              toolLabel={toolLabel}
              isPending={
                allowPermissionResponse.isPending ||
                rejectPermissionResponse.isPending ||
                alternativePermissionResponse.isPending
              }
              onAllow={async (permissionResponseId) => {
                await runMutation(
                  () => allowPermissionResponse.mutateAsync({ sessionId, permissionResponseId }),
                  'Failed to allow tool:',
                );
              }}
              onAlwaysAllow={async (permissionResponseId) => {
                await runMutation(
                  () =>
                    allowPermissionResponse.mutateAsync({
                      sessionId,
                      permissionResponseId,
                      setPermission: {
                        permission: 'allow',
                        pattern: null,
                      },
                    }),
                  'Failed to always allow tool:',
                );
              }}
              onReject={async (permissionResponseId) => {
                await runMutation(
                  () => rejectPermissionResponse.mutateAsync({ sessionId, permissionResponseId }),
                  'Failed to reject tool:',
                );
              }}
              onAlternative={async (permissionResponseId, entry) => {
                await runMutation(
                  () =>
                    alternativePermissionResponse.mutateAsync({
                      sessionId,
                      permissionResponseId,
                      entry,
                    }),
                  'Failed to submit alternative action:',
                );
              }}
              onApplySuggestion={async (permissionResponseId, pattern) => {
                await runMutation(
                  () =>
                    allowPermissionResponse.mutateAsync({
                      sessionId,
                      permissionResponseId,
                      setPermission: {
                        permission: 'allow',
                        pattern,
                      },
                    }),
                  'Failed to apply permission suggestion:',
                );
              }}
            />
          ),
        });
      }
    }

    const activeCount = todos.filter(
      (todo) => todo.status === 'pending' || todo.status === 'in_progress',
    ).length;

    if (todos.length > 0 && activeCount > 0) {
      items.push({
        id: 'todos',
        title: `Todos (${activeCount} active)`,
        defaultExpanded: false,
        variant: 'default',
        children: <TodoDock todos={todos} />,
      });
    }

    return items;
  }, [
    doomLoop,
    retry,
    pendingQuestions,
    pendingPermissionResponses,
    todos,
    sessionId,
    replyQuestion,
    rejectQuestion,
    allowPermissionResponse,
    rejectPermissionResponse,
    alternativePermissionResponse,
  ]);
}
