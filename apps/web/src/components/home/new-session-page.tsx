import * as React from 'react';

import { useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import type { MessagesPage, Session } from '@stitch/shared/chat/messages';
import { createMessageId } from '@stitch/shared/id';

import { ChatInput } from '@/components/chat/chat-input';
import type { Attachment } from '@/components/chat/chat-input-parts/types';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { useChatModel } from '@/hooks/session/use-chat-model';
import { setNextSessionInputSeed } from '@/lib/chat-input-transition-seed';
import { sessionKeys, useCreateSession, useSendMessage } from '@/lib/queries/chat';
import { todoKeys } from '@/lib/queries/todos';
import { useStreamStore } from '@/stores/stream-store';

export function NewSessionPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createSession = useCreateSession();
  const sendMessage = useSendMessage();
  const startStream = useStreamStore((state) => state.startStream);

  const [value, setValue] = React.useState('');

  const { selectedModel, handleModelChange } = useChatModel();

  const isSubmitting = createSession.isPending || sendMessage.isPending;

  async function handleSubmit(text: string, attachments: Attachment[]) {
    if ((!text.trim() && attachments.length === 0) || !selectedModel) return;

    setNextSessionInputSeed(text);

    const assistantMessageId = createMessageId();
    const session = await createSession.mutateAsync({});

    queryClient.setQueryData<Session>(sessionKeys.detail(session.id), session);

    queryClient.setQueryData<InfiniteData<MessagesPage>>(sessionKeys.messages(session.id), {
      pages: [{ messages: [], hasMore: false }],
      pageParams: [undefined],
    });
    queryClient.setQueryData(todoKeys.list(session.id), []);

    startStream(session.id, assistantMessageId);
    void sendMessage.mutateAsync({
      sessionId: session.id,
      content: text,
      attachments:
        attachments.length > 0
          ? attachments.map((attachment) => ({
              path: attachment.path,
              previewUrl: attachment.previewUrl,
              mime: attachment.mime,
              filename: attachment.filename,
            }))
          : undefined,
      providerId: selectedModel.providerId,
      modelId: selectedModel.modelId,
      assistantMessageId,
    });

    void navigate({ to: '/session/$id', params: { id: session.id } });
  }

  return (
    <div className="grid h-full place-items-center px-space-2xl">
      <div className="w-full max-w-4xl">
        <Stack gap="3xl">
          <div className="space-y-space-l text-center">
            <Text as="h1" variant="heading-l" align="center">
              What can I help you with?
            </Text>
            <Text as="p" variant="heading-s" tone="muted">
              Select a model and start a conversation
            </Text>
          </div>
          <div>
            <ChatInput
              value={value}
              onChange={setValue}
              onSubmit={(text, attachments) => {
                void handleSubmit(text, attachments);
              }}
              selectedModel={selectedModel}
              onModelChange={handleModelChange}
              placeholder={isSubmitting ? 'Starting session...' : 'Ask anything...'}
              disabled={isSubmitting}
            />
          </div>
        </Stack>
      </div>
    </div>
  );
}
