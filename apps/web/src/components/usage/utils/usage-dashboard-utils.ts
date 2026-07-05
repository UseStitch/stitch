import * as React from 'react';

import { USAGE_SOURCES, type UsageDateRange } from '@stitch/shared/usage/types';

import { formatUsdCost } from '@/lib/format-cost';

export const ALL_FILTER = 'all';

export const RANGE_LABELS: Record<UsageDateRange, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '1y': 'Last 1 year',
  all: 'All time',
};

const SOURCE_LABELS: Record<string, string> = {
  chat: 'Chat',
  automation: 'Automation',
  automation_generation: 'Automation Generation',
  title_generation: 'Title Generation',
  memory_extraction: 'Memory',
  recording_analysis: 'Recording Analysis',
};

export function getSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source.replaceAll('_', ' ');
}

export function formatCost(costUsd: number): string {
  return formatUsdCost(costUsd);
}

export function formatTokens(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 0 }).format(value);
}

export function encodeModelFilter(providerId: string, modelId: string): string {
  return `${providerId}::${modelId}`;
}

export function decodeModelFilter(value: string): { providerId: string; modelId: string } | null {
  const separator = value.indexOf('::');
  if (separator <= 0) return null;
  return { providerId: value.slice(0, separator), modelId: value.slice(separator + 2) };
}

export function useSourceOrder(sources: string[]): string[] {
  return React.useMemo(() => {
    const order = new Map<string, number>(USAGE_SOURCES.map((source, index) => [source, index]));
    return [...sources].sort((a, b) => {
      const aOrder = order.get(a) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = order.get(b) ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.localeCompare(b);
    });
  }, [sources]);
}
