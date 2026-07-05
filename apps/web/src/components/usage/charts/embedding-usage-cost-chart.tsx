import * as React from 'react';

import type { EmbeddingUsageDashboardResponse } from '@stitch/shared/usage/types';

import { StackedBarChart } from '@/components/usage/charts/stacked-bar-chart';
import { getStackSegmentRadius, hashString, resolveCssVar } from '@/components/usage/charts/usage-chart-utils';

const FALLBACK_COLORS = ['#f97316', '#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#14b8a6'];

function getModelColor(modelKey: string, index: number): string {
  const cssVar = `--chart-${(index % 6) + 1}`;
  const fallback = FALLBACK_COLORS[hashString(modelKey) % FALLBACK_COLORS.length] ?? '#6b7280';
  return resolveCssVar(cssVar, fallback);
}

function labelForModelKey(modelKey: string): string {
  const separator = modelKey.indexOf('::');
  if (separator <= 0) return modelKey;
  return modelKey.slice(separator + 2);
}

type EmbeddingUsageCostChartProps = { usageData: EmbeddingUsageDashboardResponse | undefined };

export function EmbeddingUsageCostChart({ usageData }: EmbeddingUsageCostChartProps) {
  const modelKeys = React.useMemo(() => {
    const keys = new Set<string>();
    for (const bucket of usageData?.buckets ?? []) {
      for (const key of Object.keys(bucket.costUsdByModel)) {
        keys.add(key);
      }
    }
    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }, [usageData?.buckets]);

  const labels = usageData?.buckets.map((b) => b.label) ?? [];

  const datasets = React.useMemo(
    () =>
      modelKeys.map((key, i) => ({
        label: labelForModelKey(key),
        data: usageData?.buckets.map((b) => b.costUsdByModel[key] ?? 0) ?? [],
        backgroundColor: getModelColor(key, i),
        borderRadius: (ctx: import('chart.js').ScriptableContext<'bar'>) => getStackSegmentRadius(ctx),
        borderSkipped: false as const,
        inflateAmount: 0,
      })),
    [modelKeys, usageData],
  );

  return (
    <StackedBarChart
      title="Cost over time"
      subtitle="Stacked by model"
      emptyMessage="No embedding usage data for the selected filters."
      labels={labels}
      datasets={datasets}
    />
  );
}
