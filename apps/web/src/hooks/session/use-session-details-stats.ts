import * as React from 'react';

import { useSuspenseInfiniteQuery, useSuspenseQuery, useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';

import {
  flattenMessages,
  sessionMessagesInfiniteQueryOptions,
  sessionQueryOptions,
} from '@/lib/queries/chat';
import { enabledProviderModelsQueryOptions, providersQueryOptions } from '@/lib/queries/providers';

type SessionUsageTotals = {
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

  return {
    sessionTitle: session.title ?? 'New conversation',
    providerLabel,
    modelLabel: selectedModelSummary?.name ?? latestMessage?.modelId ?? '-',
    contextLimit,
    messagesCount: messages.length,
    usagePercent,
    totalTokens: usageTotals.totalTokens,
    inputTokens: usageTotals.inputTokens,
    outputTokens: usageTotals.outputTokens,
    reasoningTokens: usageTotals.reasoningTokens,
    cacheReadTokens: usageTotals.cacheReadTokens,
    cacheWriteTokens: usageTotals.cacheWriteTokens,
    userMessageCount,
    assistantMessageCount,
    totalCostUsd,
    sessionCreatedAt: session.createdAt,
    lastActivityAt: session.updatedAt,
  };
}
