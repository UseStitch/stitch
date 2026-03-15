import * as React from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import type { DockItem } from '@/components/chat/docks/dock';
import { DoomLoopDock } from '@/components/chat/docks/doom-loop-dock';
import { RetryDock } from '@/components/chat/docks/retry-dock';
import { QuestionDock } from '@/components/chat/docks/question-dock';
import type { RetryInfo, DoomLoopInfo } from '@/hooks/use-chat-stream';
import type { QuestionRequest } from '@openwork/shared';

type UseSessionDocksOptions = {
  sessionId: string;
  retry: RetryInfo | null;
  doomLoop: DoomLoopInfo | null;
  pendingQuestions: QuestionRequest[];
  replyQuestion: UseMutationResult<
    unknown,
    Error,
    { sessionId: string; questionId: string; answers: string[][] }
  >;
  rejectQuestion: UseMutationResult<unknown, Error, { sessionId: string; questionId: string }>;
};

export function useSessionDocks({
  sessionId,
  retry,
  doomLoop,
  pendingQuestions,
  replyQuestion,
  rejectQuestion,
}: UseSessionDocksOptions): DockItem[] {
  return React.useMemo(() => {
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
      items.push({
        id: 'questions',
        title: 'Questions',
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

    return items;
  }, [doomLoop, retry, pendingQuestions, sessionId, replyQuestion, rejectQuestion]);
}
