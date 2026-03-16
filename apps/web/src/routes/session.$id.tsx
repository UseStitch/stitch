import * as React from 'react';
import { StickToBottom } from 'use-stick-to-bottom';

import { useSuspenseInfiniteQuery, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { createMessageId, type PrefixedString } from '@openwork/shared';

import { ChatInput } from '@/components/chat/chat-input';
import { DockContainer } from '@/components/chat/docks/dock';
import { MessageList } from '@/components/chat/message-list';
import { useChatModel } from '@/hooks/session/use-chat-model';
import { useChatAgent } from '@/hooks/session/use-chat-agent';
import { useSessionDocks } from '@/hooks/session/use-session-docks';
import { useCompactionUpdates } from '@/hooks/sse/use-compaction-updates';
import { useQuestionSync } from '@/hooks/sse/use-question-sync';
import { useSessionStream } from '@/hooks/sse/use-session-stream';
import { useSessionStreamState } from '@/hooks/use-session-stream-state';
import { parseModelId } from '@/lib/model-id';
import {
  sessionQueryOptions,
  sessionMessagesInfiniteQueryOptions,
  flattenMessages,
  useSendMessage,
} from '@/lib/queries/chat';
import { enabledProviderModelsQueryOptions } from '@/lib/queries/providers';
import {
  questionsQueryOptions,
  useReplyQuestion,
  useRejectQuestion,
} from '@/lib/queries/questions';
import { settingsQueryOptions } from '@/lib/queries/settings';
import { useStreamStore } from '@/stores/stream-store';

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

function SessionComponent() {
  const { id } = Route.useParams();

  const messagesQuery = useSuspenseInfiniteQuery(sessionMessagesInfiniteQueryOptions(id));
  const messages = React.useMemo(() => flattenMessages(messagesQuery.data), [messagesQuery.data]);

  const [value, setValue] = React.useState('');
  const { selectedModel, handleModelChange } = useChatModel();
  const { selectedAgent, handleAgentChange } = useChatAgent();

  const sendMessage = useSendMessage();
  const replyQuestion = useReplyQuestion();
  const rejectQuestion = useRejectQuestion();
  const streamState = useSessionStreamState(id);
  const startStream = useStreamStore((s) => s.startStream);
  const abortStream = useStreamStore((s) => s.abortStream);
  const { isCompacting } = useCompactionUpdates(id);

  const questionsQuery = useQuery(questionsQueryOptions(id));
  const pendingQuestions = questionsQuery.data?.filter((q) => q.status === 'pending') ?? [];

  useQuestionSync(id);
  useSessionStream({ sessionId: id });

  const docks = useSessionDocks({
    sessionId: id,
    retry: streamState.retry,
    doomLoop: streamState.doomLoop,
    pendingQuestions,
    replyQuestion,
    rejectQuestion,
  });

  async function handleSubmit(text: string) {
    if (!text.trim() || !selectedModel || !selectedAgent) return;

    const parsed = parseModelId(selectedModel);
    if (!parsed) return;

    setValue('');

    const assistantMessageId = createMessageId();
    startStream(id, assistantMessageId);

    await sendMessage.mutateAsync({
      sessionId: id as PrefixedString<'ses'>,
      content: text,
      providerId: parsed.providerId,
      modelId: parsed.modelId,
      agentId: selectedAgent,
      assistantMessageId,
    });
  }

  const canSubmit = !sendMessage.isPending && !streamState.isStreaming && !isCompacting;

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
              onStop={() => void abortStream(id)}
              isStreaming={streamState.isStreaming}
              selectedModel={selectedModel}
              onModelChange={handleModelChange}
              selectedAgent={selectedAgent}
              onAgentChange={handleAgentChange}
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
