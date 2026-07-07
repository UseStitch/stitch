import * as React from 'react';
import { StickToBottom } from 'use-stick-to-bottom';

import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { createMessageId, type PrefixedString } from '@stitch/shared/id';

import { ChatInput } from '@/components/chat/chat-input';
import type { Attachment, ModelSpec } from '@/components/chat/chat-input-parts/types';
import { DockContainer } from '@/components/chat/docks/dock';
import { extractTextFromParts } from '@/components/chat/message-bubble/extract-text';
import { MessageList } from '@/components/chat/message-list';
import { findLastUsedModel } from '@/components/session/session-chat-pane/session-message-context';
import { useSeededInput } from '@/components/session/session-chat-pane/use-seeded-input';
import { Button } from '@/components/ui/button';
import { useChatModel } from '@/hooks/session/use-chat-model';
import { useSessionDocks } from '@/hooks/session/use-session-docks';
import { useSessionPendingItems } from '@/hooks/session/use-session-pending-items';
import { useCompactionUpdates } from '@/hooks/sse/use-compaction-updates';
import { useSessionStreamState } from '@/hooks/use-session-stream-state';
import { useSlashCommands } from '@/hooks/use-slash-commands';
import { setNextSessionInputSeed } from '@/lib/chat-input-transition-seed';
import {
  flattenMessages,
  sessionMessagesInfiniteQueryOptions,
  sessionQueryOptions,
  useRedoMessage,
  useSendMessage,
  useSplitSession,
} from '@/lib/queries/chat';
import { sessionTodosQueryOptions } from '@/lib/queries/todos';
import { cn } from '@/lib/utils';
import { useStreamStore } from '@/stores/stream-store';

type SessionChatPaneProps = { sessionId: string; onGenerateAutomation?: () => Promise<void> };

export function SessionChatPane({ sessionId, onGenerateAutomation }: SessionChatPaneProps) {
  const id = sessionId;
  const navigate = useNavigate();
  const { data: session } = useSuspenseQuery(sessionQueryOptions(id));
  const isChildSession = session.parentSessionId !== null;
  const messagesQuery = useSuspenseInfiniteQuery(sessionMessagesInfiniteQueryOptions(id));
  const { data: todos } = useSuspenseQuery(sessionTodosQueryOptions(id));
  const messages = React.useMemo(() => flattenMessages(messagesQuery.data), [messagesQuery.data]);

  const lastUsedModel = React.useMemo((): ModelSpec | null => findLastUsedModel(messages), [messages]);
  const { value, setValue } = useSeededInput();
  const [editingMsgId, setEditingMsgId] = React.useState<string | null>(null);
  const { selectedModel, handleModelChange } = useChatModel({ lastUsedModel });
  const sendMessage = useSendMessage();
  const redoMessage = useRedoMessage();
  const splitSession = useSplitSession();
  const streamState = useSessionStreamState(id);
  const startStream = useStreamStore((state) => state.startStream);
  const abortStream = useStreamStore((state) => state.abortStream);
  const { isCompacting } = useCompactionUpdates(id);
  const pendingItems = useSessionPendingItems(id);

  const docks = useSessionDocks({
    sessionId: id,
    retry: streamState.retry,
    doomLoop: streamState.doomLoop,
    pendingQuestions: pendingItems.pendingQuestions,
    pendingPermissionResponses: pendingItems.pendingPermissionResponses,
    todos,
    replyQuestion: pendingItems.replyQuestion,
    rejectQuestion: pendingItems.rejectQuestion,
    allowPermissionResponse: pendingItems.allowPermissionResponse,
    rejectPermissionResponse: pendingItems.rejectPermissionResponse,
    alternativePermissionResponse: pendingItems.alternativePermissionResponse,
  });

  const isStreaming = streamState.isStreaming;
  const canSend = !sendMessage.isPending && !redoMessage.isPending && !isStreaming && !isCompacting;
  const editingMessage = React.useMemo(
    () => (editingMsgId ? messages.find((message) => message.id === editingMsgId) : null),
    [editingMsgId, messages],
  );
  const visibleMessages = React.useMemo(() => {
    if (!editingMessage) return messages;
    return messages.filter((message) => message.createdAt < editingMessage.createdAt);
  }, [editingMessage, messages]);

  const submitTextMessage = React.useCallback(
    async (text: string) => {
      if (!selectedModel || !canSend) return;

      const assistantMessageId = createMessageId();
      startStream(id, assistantMessageId);

      await sendMessage.mutateAsync({
        sessionId: id as PrefixedString<'ses'>,
        content: text,
        providerId: selectedModel.providerId,
        modelId: selectedModel.modelId,
        assistantMessageId,
      });
    },
    [canSend, id, selectedModel, sendMessage, startStream],
  );

  const slashCommands = useSlashCommands({
    sessionId: id,
    selectedModel,
    isStreaming,
    setInput: setValue,
    onSubmitPrompt: submitTextMessage,
    onGenerateAutomation,
  });

  async function handleSubmit(text: string, attachments: Attachment[]) {
    if ((!text.trim() && attachments.length === 0) || !selectedModel) return;
    if (!canSend) return;

    if (!editingMessage && attachments.length === 0 && slashCommands.tryRun(text)) {
      setValue('');
      return;
    }

    if (editingMessage) {
      const assistantMessageId = createMessageId();
      startStream(id, assistantMessageId);
      setEditingMsgId(null);
      setValue('');

      try {
        await redoMessage.mutateAsync({
          sessionId: id as PrefixedString<'ses'>,
          editedMessageId: editingMessage.id,
          content: text,
          attachments: attachments.map((a) => ({
            path: a.path,
            previewUrl: a.previewUrl,
            mime: a.mime,
            filename: a.filename,
          })),
          providerId: selectedModel.providerId,
          modelId: selectedModel.modelId,
          assistantMessageId,
        });
      } catch (error) {
        setEditingMsgId(editingMessage.id);
        setValue(text);
        throw error;
      }
      return;
    }

    setValue('');

    if (attachments.length === 0) {
      await submitTextMessage(text);
      return;
    }

    const assistantMessageId = createMessageId();
    startStream(id, assistantMessageId);

    await sendMessage.mutateAsync({
      sessionId: id as PrefixedString<'ses'>,
      content: text,
      attachments: attachments.map((a) => ({
        path: a.path,
        previewUrl: a.previewUrl,
        mime: a.mime,
        filename: a.filename,
      })),
      providerId: selectedModel.providerId,
      modelId: selectedModel.modelId,
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

  function handleEdit(msgId: string) {
    const message = messages.find((msg) => msg.id === msgId);
    if (!message) return;

    setEditingMsgId(msgId);
    setValue(extractTextFromParts(message.parts));
  }

  function cancelEdit() {
    setEditingMsgId(null);
    setValue('');
  }

  return (
    <div className="h-full min-w-0 pt-4 pr-4">
      <StickToBottom className="relative h-full min-w-0 flex-1 overflow-hidden" resize="smooth" initial="smooth">
        <StickToBottom.Content scrollClassName="no-scrollbar" className={cn('pt-2', isChildSession ? 'pb-8' : 'pb-40')}>
          <div className="mx-auto max-w-4xl" style={{ viewTransitionName: 'chat-thread' }}>
            <MessageList
              messages={visibleMessages}
              streamState={streamState}
              hasMore={messagesQuery.hasNextPage}
              isFetchingMore={messagesQuery.isFetchingNextPage}
              onLoadMore={() => void messagesQuery.fetchNextPage()}
              onAbortTool={() => void abortStream(id)}
              onSplit={isChildSession ? undefined : handleSplit}
              onEdit={isChildSession ? undefined : handleEdit}
            />
          </div>
        </StickToBottom.Content>

        {isChildSession ? null : (
          <>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-muted via-muted/80 to-transparent pt-10 pb-5" />
            <div className="pointer-events-auto absolute inset-x-0 bottom-0 pb-5">
              <div className="mx-auto max-w-4xl">
                <div className={cn('streaming-border-wrapper', streamState.isStreaming && 'is-streaming')}>
                  <div className="streaming-border-content shadow-sm" style={{ viewTransitionName: 'chat-input' }}>
                    <DockContainer docks={docks} />
                    {editingMessage && (
                      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">
                        <span>Editing this message will redo the conversation from that point.</span>
                        <Button type="button" variant="ghost" size="xs" onClick={cancelEdit}>
                          Cancel
                        </Button>
                      </div>
                    )}
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
                        placeholder={isCompacting ? 'Compacting conversation...' : 'Ask anything...'}
                        disabled={isCompacting || !canSend}
                        embedded
                        completionGroups={slashCommands.completionGroups}
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
