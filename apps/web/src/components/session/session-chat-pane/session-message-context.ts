import type { ModelSpec } from '@/components/chat/chat-input';
import type { PrefixedString } from '@stitch/shared/id';

type SessionMessagePart = {
  type: string;
};

type SessionMessageContext = {
  providerId: string;
  modelId: string;
  agentId: PrefixedString<'agt'> | null;
  isSummary: boolean;
  parts: SessionMessagePart[];
};

function shouldSkipMessage(message: SessionMessageContext): boolean {
  if (message.isSummary) return true;
  if (message.parts.some((part) => part.type === 'session-title')) return true;
  if (message.parts.some((part) => part.type === 'compaction')) return true;
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

export function findLastUsedAgentId(messages: SessionMessageContext[]): PrefixedString<'agt'> | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (!message || shouldSkipMessage(message)) continue;
    return message.agentId;
  }

  return null;
}
