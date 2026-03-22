import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';

import type { SessionStats } from '@stitch/shared/chat/messages';

import { sessionStatsQueryOptions } from '@/lib/queries/chat';

const EMPTY_STATS: SessionStats = {
  sessionTitle: 'New conversation',
  providerLabel: '-',
  modelLabel: '-',
  contextLimit: null,
  messagesCount: 0,
  usagePercent: '-',
  totalTokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  userMessageCount: 0,
  assistantMessageCount: 0,
  totalCostUsd: 0,
  sessionCreatedAt: null,
  lastActivityAt: null,
};

export function useSessionDetailsStats(): SessionStats {
  const { id } = useParams({ from: '/session/$id' });
  const { data } = useQuery(sessionStatsQueryOptions(id));
  return data ?? EMPTY_STATS;
}
