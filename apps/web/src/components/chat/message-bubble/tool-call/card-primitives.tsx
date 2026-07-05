import * as React from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { toolKeys } from '@/lib/queries/tools';

type KnownTool = { toolName: string; displayName: string };

export function useStitchToolDisplayName(toolName: string): string {
  const queryClient = useQueryClient();
  return React.useMemo(() => {
    const knownTools = queryClient.getQueryData<KnownTool[]>(toolKeys.knownTools());
    return knownTools?.find((t) => t.toolName === toolName)?.displayName ?? formatToolDisplayName(toolName);
  }, [queryClient, toolName]);
}

export function truncateText(value: string, max = 84): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}...`;
}

export function formatToolDisplayName(toolName: string): string {
  const normalized = toolName.replace(/[_-]+/g, ' ').trim();
  if (!normalized) return toolName;
  return normalized.replace(/\b\w/g, (match) => match.toUpperCase());
}
