import * as React from 'react';
import { StickToBottom } from 'use-stick-to-bottom';
import { EllipsisIcon, InfoIcon, PencilLineIcon, Trash2Icon } from 'lucide-react';

import { useSuspenseInfiniteQuery, useSuspenseQuery, useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { createMessageId, type PrefixedString } from '@openwork/shared/id';

import { ChatInput } from '@/components/chat/chat-input';
import { DockContainer } from '@/components/chat/docks/dock';
import { MessageList } from '@/components/chat/message-list';
import { SessionDetailsSheet } from '@/components/session/session-details-sheet';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { useDialogContext } from '@/context/dialog-context';
import { useChatAgent } from '@/hooks/session/use-chat-agent';
import { useChatModel } from '@/hooks/session/use-chat-model';
import { useSessionDocks } from '@/hooks/session/use-session-docks';
import { useCompactionUpdates } from '@/hooks/sse/use-compaction-updates';
import { usePermissionResponseSync } from '@/hooks/sse/use-permission-response-sync';
import { useQuestionSync } from '@/hooks/sse/use-question-sync';
import { useSessionStream } from '@/hooks/sse/use-session-stream';
import { useSessionStreamState } from '@/hooks/use-session-stream-state';
import {
  consumeNextSessionInputSeed,
  getTransitionSeedClearDelayMs,
} from '@/lib/chat-input-transition-seed';
import { parseModelId } from '@/lib/model-id';
import { agentsQueryOptions } from '@/lib/queries/agents';
import {
  sessionQueryOptions,
  sessionMessagesInfiniteQueryOptions,
  flattenMessages,
  useDeleteSession,
  useSendMessage,
} from '@/lib/queries/chat';
import {
  permissionResponsesQueryOptions,
  useAllowPermissionResponse,
  useRejectPermissionResponse,
  useAlternativePermissionResponse,
} from '@/lib/queries/permissions';
import { providersQueryOptions } from '@/lib/queries/providers';
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
      context.queryClient.ensureQueryData(agentsQueryOptions),
      context.queryClient.ensureQueryData(enabledProviderModelsQueryOptions),
      context.queryClient.ensureQueryData(settingsQueryOptions),
    ]),
  component: SessionComponent,
});

type SessionUsageTotals = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

const MODEL_SEPARATOR = ':::';

function SessionComponent() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { setRenameSessionOpen } = useDialogContext();
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

  const sessionQuery = useSuspenseQuery(sessionQueryOptions(id));
  const messagesQuery = useSuspenseInfiniteQuery(sessionMessagesInfiniteQueryOptions(id));
  const providersQuery = useQuery(providersQueryOptions);
  const providerModelsQuery = useQuery(enabledProviderModelsQueryOptions);
  const messages = React.useMemo(() => flattenMessages(messagesQuery.data), [messagesQuery.data]);

  const lastUsedModel = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (!message) continue;
      if (message.parts.some((part) => part.type === 'session-title')) continue;
      if (message.isSummary) continue;
      if (message.parts.some((part) => part.type === 'compaction')) continue;
      return `${message.providerId}${MODEL_SEPARATOR}${message.modelId}`;
    }

    return null;
  }, [messages]);

  const lastUsedAgentId = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (!message) continue;
      if (message.parts.some((part) => part.type === 'session-title')) continue;
      if (message.isSummary) continue;
      if (message.parts.some((part) => part.type === 'compaction')) continue;
      return message.agentId;
    }

    return null;
  }, [messages]);

  const seedTextRef = React.useRef(consumeNextSessionInputSeed());
  const [value, setValue] = React.useState(seedTextRef.current);
  const { selectedModel, handleModelChange } = useChatModel({ lastUsedModel });
  const { selectedAgent, handleAgentChange } = useChatAgent({ lastUsedAgentId });

  const sendMessage = useSendMessage();
  const deleteSession = useDeleteSession();
  const replyQuestion = useReplyQuestion();
  const rejectQuestion = useRejectQuestion();
  const allowPermissionResponse = useAllowPermissionResponse();
  const rejectPermissionResponse = useRejectPermissionResponse();
  const alternativePermissionResponse = useAlternativePermissionResponse();
  const streamState = useSessionStreamState(id);
  const startStream = useStreamStore((s) => s.startStream);
  const abortStream = useStreamStore((s) => s.abortStream);
  const { isCompacting } = useCompactionUpdates(id);

  const questionsQuery = useQuery(questionsQueryOptions(id));
  const pendingQuestions = questionsQuery.data?.filter((q) => q.status === 'pending') ?? [];
  const permissionResponsesQuery = useQuery(permissionResponsesQueryOptions(id));
  const pendingPermissionResponses =
    permissionResponsesQuery.data?.filter((p) => p.status === 'pending') ?? [];

  useQuestionSync(id);
  usePermissionResponseSync(id);
  useSessionStream({ sessionId: id });

  React.useEffect(() => {
    const seedText = seedTextRef.current;
    if (!seedText) return;

    const timeoutId = window.setTimeout(() => {
      setValue((current) => (current === seedText ? '' : current));
    }, getTransitionSeedClearDelayMs());

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  const docks = useSessionDocks({
    sessionId: id,
    retry: streamState.retry,
    doomLoop: streamState.doomLoop,
    pendingQuestions,
    pendingPermissionResponses,
    replyQuestion,
    rejectQuestion,
    allowPermissionResponse,
    rejectPermissionResponse,
    alternativePermissionResponse,
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

  const session = sessionQuery.data;
  const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  const usageTotals = React.useMemo<SessionUsageTotals>(() => {
    return messages.reduce<SessionUsageTotals>(
      (acc, message) => {
        acc.inputTokens += message.usage?.inputTokens ?? 0;
        acc.outputTokens += message.usage?.outputTokens ?? 0;
        acc.totalTokens += message.usage?.totalTokens ?? 0;
        acc.reasoningTokens += message.usage?.outputTokenDetails?.reasoningTokens ?? 0;
        acc.cacheReadTokens += message.usage?.inputTokenDetails?.cacheReadTokens ?? 0;
        acc.cacheWriteTokens += message.usage?.inputTokenDetails?.cacheWriteTokens ?? 0;
        return acc;
      },
      {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        reasoningTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    );
  }, [messages]);

  const contextLimit = React.useMemo(() => {
    if (!latestMessage || !providerModelsQuery.data) return null;

    const provider = providerModelsQuery.data.find((item) => item.providerId === latestMessage.providerId);
    const model = provider?.models.find((item) => item.id === latestMessage.modelId);
    return model?.limit?.context ?? null;
  }, [latestMessage, providerModelsQuery.data]);

  const usagePercent =
    contextLimit && contextLimit > 0
      ? `${Math.min(100, ((usageTotals.inputTokens / contextLimit) * 100)).toFixed(1)}%`
      : '-';

  const totalCostUsd = React.useMemo(
    () => messages.reduce((acc, message) => acc + (message.costUsd ?? 0), 0),
    [messages],
  );

  const userMessageCount = React.useMemo(
    () => messages.filter((message) => message.role === 'user').length,
    [messages],
  );

  const assistantMessageCount = React.useMemo(
    () => messages.filter((message) => message.role === 'assistant').length,
    [messages],
  );

  const selectedModelSummary = React.useMemo(() => {
    if (!latestMessage || !providerModelsQuery.data) return null;

    const provider = providerModelsQuery.data.find((item) => item.providerId === latestMessage.providerId);
    return provider?.models.find((item) => item.id === latestMessage.modelId) ?? null;
  }, [latestMessage, providerModelsQuery.data]);

  const providerLabel =
    latestMessage && providersQuery.data
      ? providersQuery.data.find((provider) => provider.id === latestMessage.providerId)?.name ??
        latestMessage.providerId
      : '-';

  async function handleDeleteSession() {
    await deleteSession.mutateAsync({ sessionId: id as PrefixedString<'ses'> });
    setDeleteDialogOpen(false);
    setDetailsOpen(false);
    void navigate({ to: '/' });
  }

  function toggleDetailsPanel() {
    setDetailsOpen((open) => !open);
  }

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        <header className="border-b border-border/60 bg-muted/40">
          <div className="mx-auto flex h-12 w-full items-center justify-between px-6">
            <h1 className="truncate text-base font-medium">{session.title ?? 'New conversation'}</h1>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                className="hidden lg:inline-flex"
                onClick={toggleDetailsPanel}
                aria-label={detailsOpen ? 'Hide session details' : 'Show session details'}
              >
                <InfoIcon className="size-4" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon-sm" aria-label="Session actions">
                      <EllipsisIcon className="size-4" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => setRenameSessionOpen(true)}>
                    <PencilLineIcon className="size-4" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                    <Trash2Icon className="size-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <ResizablePanelGroup
          orientation="horizontal"
          className="h-full min-h-0 w-full pl-6 pr-0 pt-0 pb-0"
        >
          <ResizablePanel defaultSize={detailsOpen ? '70%' : '100%'} minSize="45%">
            <div className="h-full min-w-0 pr-4 pt-4">
              <StickToBottom
                className="relative h-full min-w-0 flex-1 overflow-hidden"
                resize="smooth"
                initial="smooth"
              >
                <StickToBottom.Content scrollClassName="no-scrollbar" className="pb-40 pt-2">
                  <div className="mx-auto max-w-4xl" style={{ viewTransitionName: 'chat-thread' }}>
                    <MessageList
                      messages={messages}
                      streamState={streamState}
                      hasMore={messagesQuery.hasNextPage}
                      isFetchingMore={messagesQuery.isFetchingNextPage}
                      onLoadMore={() => void messagesQuery.fetchNextPage()}
                      onAbortTool={() => void abortStream(id)}
                    />
                  </div>
                </StickToBottom.Content>

                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-muted via-muted/80 to-transparent pb-5 pt-10" />
                <div className="pointer-events-auto absolute inset-x-0 bottom-0 pb-5">
                  <div className="mx-auto max-w-4xl">
                    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
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
                                ? 'Ask anything...'
                                : 'Waiting for response...'
                          }
                          disabled={!canSubmit}
                          embedded
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </StickToBottom>
            </div>
          </ResizablePanel>

          {detailsOpen ? (
            <>
              <ResizableHandle className="hidden lg:flex bg-foreground/25 after:w-0" />

              <ResizablePanel defaultSize="30%" minSize="24%" maxSize="38%">
                <SessionDetailsSheet
                  className="hidden lg:block"
                  sessionTitle={session.title ?? 'New conversation'}
                  providerLabel={providerLabel}
                  modelLabel={selectedModelSummary?.name ?? latestMessage?.modelId ?? '-'}
                  contextLimit={contextLimit}
                  messagesCount={messages.length}
                  usagePercent={usagePercent}
                  totalTokens={usageTotals.totalTokens}
                  inputTokens={usageTotals.inputTokens}
                  outputTokens={usageTotals.outputTokens}
                  reasoningTokens={usageTotals.reasoningTokens}
                  cacheReadTokens={usageTotals.cacheReadTokens}
                  cacheWriteTokens={usageTotals.cacheWriteTokens}
                  userMessageCount={userMessageCount}
                  assistantMessageCount={assistantMessageCount}
                  totalCostUsd={totalCostUsd}
                  sessionCreatedAt={session.createdAt}
                  lastActivityAt={session.updatedAt}
                />
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete session?</DialogTitle>
            <DialogDescription>
              This permanently removes the session and all of its messages. This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void handleDeleteSession();
              }}
              disabled={deleteSession.isPending}
            >
              {deleteSession.isPending ? 'Deleting...' : 'Delete session'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
