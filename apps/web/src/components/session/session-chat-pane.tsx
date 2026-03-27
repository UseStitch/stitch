import * as React from 'react';
import { StickToBottom } from 'use-stick-to-bottom';

import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';

import { createMessageId, type PrefixedString } from '@stitch/shared/id';

import { ChatInput, type Attachment, type ModelSpec } from '@/components/chat/chat-input';
import { DockContainer } from '@/components/chat/docks/dock';
import { MessageList } from '@/components/chat/message-list';
import { useChatAgent } from '@/hooks/session/use-chat-agent';
import { useChatModel } from '@/hooks/session/use-chat-model';
import { useSessionDocks } from '@/hooks/session/use-session-docks';
import { useSessionPendingItems } from '@/hooks/session/use-session-pending-items';
import { useCompactionUpdates } from '@/hooks/sse/use-compaction-updates';
import { usePermissionResponseSync } from '@/hooks/sse/use-permission-response-sync';
import { useQuestionSync } from '@/hooks/sse/use-question-sync';
import { useSessionStream } from '@/hooks/sse/use-session-stream';
import { useSessionStreamState } from '@/hooks/use-session-stream-state';
import { setNextSessionInputSeed } from '@/lib/chat-input-transition-seed';
import {
  flattenMessages,
  sessionMessagesInfiniteQueryOptions,
  sessionQueryOptions,
  useSendMessage,
  useSplitSession,
} from '@/lib/queries/chat';
import { useAddToQueue } from '@/lib/queries/queue';
import { cn } from '@/lib/utils';
import type {
  EditQueuedMessagePayload,
  SendQueuedMessageFn,
} from '@/components/session/session-page-types';
import {
  findLastUsedAgentId,
  findLastUsedModel,
} from '@/components/session/session-chat-pane/session-message-context';
import { useQueuedEditPayload } from '@/components/session/session-chat-pane/use-queued-edit-payload';
import { useSeededInput } from '@/components/session/session-chat-pane/use-seeded-input';
import { useSendQueuedRef } from '@/components/session/session-chat-pane/use-send-queued-ref';
import { useStreamStore } from '@/stores/stream-store';

type SessionChatPaneProps = {
  onOpenQueue: () => void;
  editPayload: EditQueuedMessagePayload | null;
  onConsumeEditPayload: () => void;
  sendQueuedRef: React.RefObject<SendQueuedMessageFn | null>;
};

export function SessionChatPane({
  onOpenQueue,
  editPayload,
  onConsumeEditPayload,
  sendQueuedRef,
}: SessionChatPaneProps) {
  const { id } = useParams({ from: '/session/$id' });
  const navigate = useNavigate();
  const { data: session } = useSuspenseQuery(sessionQueryOptions(id));
  const isChildSession = session.parentSessionId !== null;
  const messagesQuery = useSuspenseInfiniteQuery(sessionMessagesInfiniteQueryOptions(id));
  const messages = React.useMemo(() => flattenMessages(messagesQuery.data), [messagesQuery.data]);

  const lastUsedModel = React.useMemo((): ModelSpec | null => findLastUsedModel(messages), [messages]);
  const lastUsedAgentId = React.useMemo(() => findLastUsedAgentId(messages), [messages]);

  const { value, setValue } = useSeededInput();
  const { selectedModel, handleModelChange } = useChatModel({ lastUsedModel });
  const { selectedAgent, handleAgentChange } = useChatAgent({ lastUsedAgentId });
  const sendMessage = useSendMessage();
  const splitSession = useSplitSession();
  const addToQueue = useAddToQueue();
  const streamState = useSessionStreamState(id);
  const startStream = useStreamStore((state) => state.startStream);
  const abortStream = useStreamStore((state) => state.abortStream);
  const { isCompacting } = useCompactionUpdates(id);
  const pendingItems = useSessionPendingItems(id);
  const { pendingAttachments, handlePendingAttachmentsConsumed } = useQueuedEditPayload({
    editPayload,
    onConsumeEditPayload,
    setValue,
  });

  useQuestionSync(id);
  usePermissionResponseSync(id);
  useSessionStream({ sessionId: id });

  const docks = useSessionDocks({
    sessionId: id,
    retry: streamState.retry,
    doomLoop: streamState.doomLoop,
    pendingQuestions: pendingItems.pendingQuestions,
    pendingPermissionResponses: pendingItems.pendingPermissionResponses,
    replyQuestion: pendingItems.replyQuestion,
    rejectQuestion: pendingItems.rejectQuestion,
    allowPermissionResponse: pendingItems.allowPermissionResponse,
    rejectPermissionResponse: pendingItems.rejectPermissionResponse,
    alternativePermissionResponse: pendingItems.alternativePermissionResponse,
  });

  const isStreaming = streamState.isStreaming;
  const canSend = !sendMessage.isPending && !isStreaming && !isCompacting;

  const canSendQueuedMessage = React.useCallback(
    () => canSend && selectedModel !== null && selectedAgent !== null,
    [canSend, selectedModel, selectedAgent],
  );

  const sendQueuedMessage: SendQueuedMessageFn = React.useCallback(
    (content, queueAttachments) => {
      if (!selectedModel || !selectedAgent) return;

      const assistantMessageId = createMessageId();
      startStream(id, assistantMessageId);

      void sendMessage.mutateAsync({
        sessionId: id as PrefixedString<'ses'>,
        content,
        attachments:
          queueAttachments.length > 0
            ? queueAttachments.map((attachment) => ({
                path: attachment.path,
                previewUrl: null,
                mime: attachment.mime,
                filename: attachment.filename,
              }))
            : undefined,
        providerId: selectedModel.providerId,
        modelId: selectedModel.modelId,
        agentId: selectedAgent,
        assistantMessageId,
      });
    },
    [id, selectedModel, selectedAgent, sendMessage, startStream],
  );

  useSendQueuedRef({
    sendQueuedRef,
    canSendQueuedMessage,
    onSendQueuedMessage: sendQueuedMessage,
  });

  async function handleSubmit(text: string, attachments: Attachment[]) {
    if ((!text.trim() && attachments.length === 0) || !selectedModel || !selectedAgent) return;

    // If streaming or a send is in-flight, queue the message instead
    if (!canSend) {
      addToQueue.mutate({
        sessionId: id as PrefixedString<'ses'>,
        content: text,
        attachments:
          attachments.length > 0
            ? attachments.map((a) => ({
                path: a.path,
                mime: a.mime,
                filename: a.filename,
              }))
            : undefined,
      });
      setValue('');
      onOpenQueue();
      return;
    }

    setValue('');

    const assistantMessageId = createMessageId();
    startStream(id, assistantMessageId);

    await sendMessage.mutateAsync({
      sessionId: id as PrefixedString<'ses'>,
      content: text,
      attachments:
        attachments.length > 0
          ? attachments.map((a) => ({
              path: a.path,
              previewUrl: a.previewUrl,
              mime: a.mime,
              filename: a.filename,
            }))
          : undefined,
      providerId: selectedModel.providerId,
      modelId: selectedModel.modelId,
      agentId: selectedAgent,
      assistantMessageId,
    });
  }

  async function handleSplit(msgId: string) {
    const result = await splitSession.mutateAsync({
      sessionId: id as PrefixedString<'ses'>,
      msgId: msgId as PrefixedString<'msg'>,
    });
    setNextSessionInputSeed(result.prefillText);
    void navigate({ to: '/session/$id', params: { id: result.session.id }, viewTransition: true });
  }

  const inputMode = canSend ? 'send' : 'queue';

  return (
    <div className="h-full min-w-0 pt-4 pr-4">
      <StickToBottom
        className="relative h-full min-w-0 flex-1 overflow-hidden"
        resize="smooth"
        initial="smooth"
      >
        <StickToBottom.Content
          scrollClassName="no-scrollbar"
          className={cn('pt-2', isChildSession ? 'pb-8' : 'pb-40')}
        >
          <div className="mx-auto max-w-4xl" style={{ viewTransitionName: 'chat-thread' }}>
            <MessageList
              messages={messages}
              streamState={streamState}
              hasMore={messagesQuery.hasNextPage}
              isFetchingMore={messagesQuery.isFetchingNextPage}
              onLoadMore={() => void messagesQuery.fetchNextPage()}
              onAbortTool={() => void abortStream(id)}
              onSplit={isChildSession ? undefined : handleSplit}
            />
          </div>
        </StickToBottom.Content>

        {isChildSession ? null : (
          <>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-muted via-muted/80 to-transparent pt-10 pb-5" />
            <div className="pointer-events-auto absolute inset-x-0 bottom-0 pb-5">
              <div className="mx-auto max-w-4xl">
                <div
                  className={cn(
                    'streaming-border-wrapper',
                    streamState.isStreaming && 'is-streaming',
                  )}
                >
                  <div className="streaming-border-wrapper-inner">
                    <div className="streaming-border-wrapper-clip">
                      <div className="streaming-border-spinner" />
                    </div>
                  </div>
                  <div
                    className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm"
                    style={{ viewTransitionName: 'chat-input' }}
                  >
                    <DockContainer docks={docks} />
                    <div>
                      <ChatInput
                        value={value}
                        onChange={setValue}
                        onSubmit={(text, attachments) => {
                          void handleSubmit(text, attachments);
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
                            : canSend
                              ? 'Ask anything...'
                              : 'Type to queue a message...'
                        }
                        disabled={isCompacting}
                        mode={inputMode}
                        pendingAttachments={pendingAttachments}
                        onPendingAttachmentsConsumed={handlePendingAttachmentsConsumed}
                        embedded
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </StickToBottom>
    </div>
  );
}
