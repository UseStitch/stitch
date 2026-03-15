import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
  useSuspenseQuery,
  useSuspenseInfiniteQuery,
  useQueryClient,
  useMutation,
  useQuery,
} from '@tanstack/react-query';
import { StickToBottom } from 'use-stick-to-bottom';
import { ChatInput } from '@/components/chat/chat-input';
import { MessageList } from '@/components/chat/message-list';
import { DockContainer, type DockItem } from '@/components/chat/docks/dock';
import { RetryDock } from '@/components/chat/docks/retry-dock';
import { DoomLoopDock } from '@/components/chat/docks/doom-loop-dock';
import { QuestionDock } from '@/components/chat/docks/question-dock';
import { enabledProviderModelsQueryOptions } from '@/lib/queries/providers';
import {
  sessionQueryOptions,
  sessionMessagesInfiniteQueryOptions,
  flattenMessages,
  sessionKeys,
  useSendMessage,
} from '@/lib/queries/chat';
import {
  questionsQueryOptions,
  useReplyQuestion,
  useRejectQuestion,
  questionKeys,
} from '@/lib/queries/questions';
import { useChatStreamContext } from '@/context/chat-stream-context';
import { useCompactionUpdates } from '@/hooks/use-compaction-updates';
import { useSSE } from '@/hooks/use-sse';
import { settingsQueryOptions, saveSettingMutationOptions } from '@/lib/queries/settings';
import { createMessageId } from '@openwork/shared';

export const Route = createFileRoute('/session/$id')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(sessionQueryOptions(params.id)),
      context.queryClient.ensureInfiniteQueryData(sessionMessagesInfiniteQueryOptions(params.id)),
      context.queryClient.ensureQueryData(enabledProviderModelsQueryOptions),
      context.queryClient.ensureQueryData(settingsQueryOptions),
    ]),
  component: SessionComponent,
});

const SEPARATOR = ':::';

function SessionComponent() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);

  const messagesQuery = useSuspenseInfiniteQuery(sessionMessagesInfiniteQueryOptions(id));
  const messages = React.useMemo(() => flattenMessages(messagesQuery.data), [messagesQuery.data]);

  const [value, setValue] = React.useState('');
  const [modelOverride, setModelOverride] = React.useState<string | null>(null);
  const selectedModel = modelOverride ?? settings['model.default'] ?? null;

  const saveDefaultModel = useMutation(
    saveSettingMutationOptions('model.default', queryClient, { silent: true }),
  );

  function handleModelChange(model: string | null) {
    setModelOverride(model);
    if (model) saveDefaultModel.mutate(model);
  }

  const sendMessage = useSendMessage();
  const replyQuestion = useReplyQuestion();
  const rejectQuestion = useRejectQuestion();
  const { activeMessageId, setActiveMessageId, ...streamState } = useChatStreamContext();
  const { isCompacting } = useCompactionUpdates(id);

  const questionsQuery = useQuery(questionsQueryOptions(id));
  const pendingQuestions = questionsQuery.data?.filter((q) => q.status === 'pending') ?? [];

  useSSE({
    'question-asked': (data) => {
      try {
        const payload = data as { question: { sessionId: string } };
        if (payload.question?.sessionId !== id) return;
        void queryClient.invalidateQueries({ queryKey: questionKeys.list(id) });
      } catch (e) {
        console.error('Error handling question-asked:', e);
      }
    },
    'question-replied': (data) => {
      try {
        const payload = data as { sessionId: string };
        if (payload.sessionId !== id) return;
        void queryClient.invalidateQueries({ queryKey: questionKeys.list(id) });
      } catch (e) {
        console.error('Error handling question-replied:', e);
      }
    },
    'question-rejected': (data) => {
      try {
        const payload = data as { sessionId: string };
        if (payload.sessionId !== id) return;
        void queryClient.invalidateQueries({ queryKey: questionKeys.list(id) });
      } catch (e) {
        console.error('Error handling question-rejected:', e);
      }
    },
  });

  // When stream finishes, refresh the most recent messages page and clear active stream
  React.useEffect(() => {
    if (!streamState.isStreaming && activeMessageId !== null && streamState.finishReason !== null) {
      void queryClient
        .resetQueries({ queryKey: sessionKeys.messages(id) })
        .then(() => setActiveMessageId(null));
    }
  }, [
    streamState.isStreaming,
    streamState.finishReason,
    activeMessageId,
    id,
    queryClient,
    setActiveMessageId,
  ]);

  async function handleSubmit(text: string) {
    if (!text.trim() || !selectedModel) {
      return;
    }

    const [providerId, modelId] = selectedModel.split(SEPARATOR);
    if (!providerId || !modelId) {
      return;
    }

    setValue('');

    const assistantMessageId = createMessageId();
    setActiveMessageId(assistantMessageId);

    await sendMessage.mutateAsync({
      sessionId: id,
      content: text,
      providerId,
      modelId,
      assistantMessageId,
    });
  }

  const canSubmit = !sendMessage.isPending && !streamState.isStreaming && !isCompacting;

  const docks = React.useMemo(() => {
    const items: DockItem[] = [];

    if (streamState.doomLoop) {
      items.push({
        id: 'doom-loop',
        title: 'Repeated action detected',
        defaultExpanded: true,
        variant: 'warning',
        children: <DoomLoopDock sessionId={id} toolName={streamState.doomLoop.toolName} />,
      });
    }

    if (streamState.retry) {
      items.push({
        id: 'retry',
        title: `Retrying... (attempt ${streamState.retry.attempt}/${streamState.retry.maxRetries})`,
        defaultExpanded: true,
        variant: 'destructive',
        children: <RetryDock retry={streamState.retry} />,
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
                await replyQuestion.mutateAsync({
                  sessionId: id,
                  questionId,
                  answers,
                });
              } catch (error) {
                console.error('Failed to reply to question:', error);
              }
            }}
            onReject={async (questionId) => {
              try {
                await rejectQuestion.mutateAsync({
                  sessionId: id,
                  questionId,
                });
              } catch (error) {
                console.error('Failed to reject question:', error);
              }
            }}
          />
        ),
      });
    }

    return items;
  }, [
    streamState.doomLoop,
    streamState.retry,
    pendingQuestions,
    id,
    replyQuestion,
    rejectQuestion,
  ]);

  return (
    <StickToBottom
      className="flex-1 h-full overflow-hidden relative"
      resize="smooth"
      initial="smooth"
    >
      <StickToBottom.Content scrollClassName="no-scrollbar" className="px-6 pb-40 pt-6">
        <div className="mx-auto max-w-4xl">
          <MessageList
            messages={messages}
            streamState={streamState}
            hasMore={messagesQuery.hasNextPage}
            isFetchingMore={messagesQuery.isFetchingNextPage}
            onLoadMore={() => void messagesQuery.fetchNextPage()}
          />
        </div>
      </StickToBottom.Content>

      <div className="absolute bottom-0 inset-x-0 px-6 pb-5 pt-10 bg-linear-to-t from-muted via-muted/80 to-transparent pointer-events-none" />
      <div className="absolute bottom-0 inset-x-0 px-6 pb-5 pointer-events-auto">
        <div className="mx-auto max-w-4xl">
          <DockContainer docks={docks} />
          <div style={{ viewTransitionName: 'chat-input' }}>
            <ChatInput
              value={value}
              onChange={setValue}
              onSubmit={(text) => {
                void handleSubmit(text);
              }}
              selectedModel={selectedModel}
              onModelChange={handleModelChange}
              placeholder={
                isCompacting
                  ? 'Compacting conversation...'
                  : canSubmit
                    ? 'Ask a follow-up...'
                    : 'Waiting for response...'
              }
              disabled={!canSubmit}
              hasDockAbove={docks.length > 0}
            />
          </div>
        </div>
      </div>
    </StickToBottom>
  );
}
