import * as React from 'react';

import { useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';

import type { Session, MessagesPage } from '@stitch/shared/chat/messages';
import { createMessageId } from '@stitch/shared/id';

import { ChatInput, type Attachment } from '@/components/chat/chat-input';
import { useChatAgent } from '@/hooks/session/use-chat-agent';
import { useChatModel } from '@/hooks/session/use-chat-model';
import { setNextSessionInputSeed } from '@/lib/chat-input-transition-seed';
import { agentsQueryOptions } from '@/lib/queries/agents';
import { useCreateSession, useSendMessage, sessionKeys } from '@/lib/queries/chat';
import {
  enabledProviderModelsQueryOptions,
  visibleProviderModelsQueryOptions,
} from '@/lib/queries/providers';
import { settingsQueryOptions } from '@/lib/queries/settings';
import { useStreamStore } from '@/stores/stream-store';

export const Route = createFileRoute('/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(enabledProviderModelsQueryOptions),
      context.queryClient.ensureQueryData(visibleProviderModelsQueryOptions),
      context.queryClient.ensureQueryData(agentsQueryOptions),
      context.queryClient.ensureQueryData(settingsQueryOptions),
    ]),
  component: IndexComponent,
});

function IndexComponent() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createSession = useCreateSession();
  const sendMessage = useSendMessage();
  const startStream = useStreamStore((s) => s.startStream);

  const [value, setValue] = React.useState('');

  const { selectedModel, handleModelChange } = useChatModel();
  const { selectedAgent, handleAgentChange } = useChatAgent();

  const isSubmitting = createSession.isPending || sendMessage.isPending;

  async function handleSubmit(text: string, attachments: Attachment[]) {
    if ((!text.trim() && attachments.length === 0) || !selectedModel || !selectedAgent) return;

    setNextSessionInputSeed(text);

    const assistantMessageId = createMessageId();
    const session = await createSession.mutateAsync({});

    queryClient.setQueryData<Session>(sessionKeys.detail(session.id), session);

    queryClient.setQueryData<InfiniteData<MessagesPage>>(sessionKeys.messages(session.id), {
      pages: [{ messages: [], hasMore: false }],
      pageParams: [undefined],
    });

    startStream(session.id, assistantMessageId);
    void sendMessage.mutateAsync({
      sessionId: session.id,
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

    void navigate({ to: '/session/$id', params: { id: session.id }, viewTransition: true });
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="flex w-full max-w-4xl flex-col gap-8">
        <div className="space-y-3 text-center">
          <h1 className="text-3xl font-bold tracking-tight">What can I help you with?</h1>
          <p className="text-base text-muted-foreground">Select a model and start a conversation</p>
        </div>
        <div style={{ viewTransitionName: 'chat-input' }}>
          <ChatInput
            value={value}
            onChange={setValue}
            onSubmit={(text, attachments) => {
              void handleSubmit(text, attachments);
            }}
            selectedModel={selectedModel}
            onModelChange={handleModelChange}
            selectedAgent={selectedAgent}
            onAgentChange={handleAgentChange}
            placeholder={isSubmitting ? 'Starting session...' : 'Ask anything...'}
            disabled={isSubmitting}
          />
        </div>
      </div>
    </div>
  );
}
