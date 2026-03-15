import * as React from 'react';

import { useQueryClient, useMutation, useSuspenseQuery } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';

import type { Session, MessagesPage } from '@openwork/shared';
import { createMessageId } from '@openwork/shared';

import { ChatInput } from '@/components/chat/chat-input';
import { useChatStreamContext } from '@/context/chat-stream-context';
import { useCreateSession, useSendMessage, sessionKeys } from '@/lib/queries/chat';
import { enabledProviderModelsQueryOptions } from '@/lib/queries/providers';
import { settingsQueryOptions, saveSettingMutationOptions } from '@/lib/queries/settings';

export const Route = createFileRoute('/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(enabledProviderModelsQueryOptions),
      context.queryClient.ensureQueryData(settingsQueryOptions),
    ]),
  component: IndexComponent,
});

const SEPARATOR = ':::';

function IndexComponent() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createSession = useCreateSession();
  const sendMessage = useSendMessage();
  const { setActiveMessageId } = useChatStreamContext();
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);

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

  const isSubmitting = createSession.isPending || sendMessage.isPending;

  async function handleSubmit(text: string) {
    if (!text.trim() || !selectedModel) return;

    const [providerId, modelId] = selectedModel.split(SEPARATOR);
    if (!providerId || !modelId) return;

    setValue('');

    const assistantMessageId = createMessageId();
    const session = await createSession.mutateAsync({});

    queryClient.setQueryData<Session>(sessionKeys.detail(session.id), session);

    queryClient.setQueryData<InfiniteData<MessagesPage>>(sessionKeys.messages(session.id), {
      pages: [{ messages: [], hasMore: false }],
      pageParams: [undefined],
    });

    setActiveMessageId(assistantMessageId);
    void sendMessage.mutateAsync({
      sessionId: session.id,
      content: text,
      providerId,
      modelId,
      assistantMessageId,
    });

    void navigate({ to: '/session/$id', params: { id: session.id }, viewTransition: true });
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="w-full max-w-3xl flex flex-col gap-8">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">What can I help you with?</h1>
          <p className="text-base text-muted-foreground">Select a model and start a conversation</p>
        </div>
        <div style={{ viewTransitionName: 'chat-input' }}>
          <ChatInput
            value={value}
            onChange={setValue}
            onSubmit={(text) => {
              void handleSubmit(text);
            }}
            selectedModel={selectedModel}
            onModelChange={handleModelChange}
            placeholder={isSubmitting ? 'Starting session...' : 'Ask anything...'}
          />
        </div>
      </div>
    </div>
  );
}
