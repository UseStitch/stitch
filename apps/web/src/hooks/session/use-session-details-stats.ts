import * as React from 'react';

import { useSuspenseInfiniteQuery, useSuspenseQuery, useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';

import {
  flattenMessages,
  sessionMessagesInfiniteQueryOptions,
  sessionQueryOptions,
} from '@/lib/queries/chat';
import { enabledProviderModelsQueryOptions, providersQueryOptions } from '@/lib/queries/providers';

type SessionContextTokens = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

type SessionDetailsStats = {
  sessionTitle: string;
  providerLabel: string;
  modelLabel: string;
  contextLimit: number | null;
  messagesCount: number;
  usagePercent: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  userMessageCount: number;
  assistantMessageCount: number;
  totalCostUsd: number;
  sessionCreatedAt: number | null | undefined;
  lastActivityAt: number | null | undefined;
};

export function useSessionDetailsStats(): SessionDetailsStats {
  const { id } = useParams({ from: '/session/$id' });
  const { data: session } = useSuspenseQuery(sessionQueryOptions(id));
  const messagesQuery = useSuspenseInfiniteQuery(sessionMessagesInfiniteQueryOptions(id));
  const providerModelsQuery = useQuery(enabledProviderModelsQueryOptions);
  const providersQuery = useQuery(providersQueryOptions);
  const messages = React.useMemo(() => flattenMessages(messagesQuery.data), [messagesQuery.data]);
  const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  const latestAssistantWithTokens = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== 'assistant') continue;
      if (msg.parts?.some((p) => p.type === 'session-title')) continue;
      const usage = msg.usage;
      const tokenSum =
        (usage?.inputTokens ?? 0) +
        (usage?.outputTokens ?? 0) +
        (usage?.inputTokenDetails?.cacheReadTokens ?? 0) +
        (usage?.inputTokenDetails?.cacheWriteTokens ?? 0) +
        (usage?.outputTokenDetails?.reasoningTokens ?? 0);
      if (tokenSum > 0) return msg;
    }
    return null;
  }, [messages]);

  const contextTokens = React.useMemo<SessionContextTokens>(() => {
    if (!latestAssistantWithTokens) {
      return {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        reasoningTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      };
    }
    const usage = latestAssistantWithTokens.usage;
    const cacheRead = usage?.inputTokenDetails?.cacheReadTokens ?? 0;
    const cacheWrite = usage?.inputTokenDetails?.cacheWriteTokens ?? 0;
    const reasoning = usage?.outputTokenDetails?.reasoningTokens ?? 0;
    const input = usage?.inputTokens ?? 0;
    const output = usage?.outputTokens ?? 0;
    return {
      inputTokens: input,
      outputTokens: output,
      totalTokens: input + output + cacheRead + cacheWrite + reasoning,
      reasoningTokens: reasoning,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
    };
  }, [latestAssistantWithTokens]);

  const contextLimit = React.useMemo(() => {
    if (!latestAssistantWithTokens || !providerModelsQuery.data) return null;

    const provider = providerModelsQuery.data.find(
      (item) => item.providerId === latestAssistantWithTokens.providerId,
    );
    const model = provider?.models.find((item) => item.id === latestAssistantWithTokens.modelId);
    return model?.limit?.context ?? null;
  }, [latestAssistantWithTokens, providerModelsQuery.data]);

  const usagePercent =
    contextLimit && contextLimit > 0
      ? `${Math.min(100, Math.round((contextTokens.totalTokens / contextLimit) * 100))}%`
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

  return {
    sessionTitle: session.title ?? 'New conversation',
    providerLabel,
    modelLabel: selectedModelSummary?.name ?? latestMessage?.modelId ?? '-',
    contextLimit,
    messagesCount: messages.length,
    usagePercent,
    totalTokens: contextTokens.totalTokens,
    inputTokens: contextTokens.inputTokens,
    outputTokens: contextTokens.outputTokens,
    reasoningTokens: contextTokens.reasoningTokens,
    cacheReadTokens: contextTokens.cacheReadTokens,
    cacheWriteTokens: contextTokens.cacheWriteTokens,
    userMessageCount,
    assistantMessageCount,
    totalCostUsd,
    sessionCreatedAt: session.createdAt,
    lastActivityAt: session.updatedAt,
  };
}
