import type { ModelSpec } from '@/components/chat/chat-input-parts/types';

type SessionMessagePart = {
  type: string;
};

type SessionMessageContext = {
  providerId: string;
  modelId: string;
  isSummary: boolean;
  parts: SessionMessagePart[];
};

function shouldSkipMessage(message: SessionMessageContext): boolean {
  if (message.isSummary) return true;
  if (message.parts.some((part) => part.type === 'session-title')) return true;
  if (message.parts.some((part) => part.type === 'compaction')) return true;
  if (message.parts.some((part) => part.type === 'automation-generation')) return true;
  return false;
}

export function findLastUsedModel(messages: SessionMessageContext[]): ModelSpec | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (!message || shouldSkipMessage(message)) continue;
    return {
      providerId: message.providerId,
      modelId: message.modelId,
    };
  }

  return null;
}
