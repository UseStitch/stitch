import type { EmbeddingUsageDashboardResponse } from '@stitch/shared/usage/types';

import { StackedBarChart } from '@/components/usage/charts/stacked-bar-chart';
import { getStackSegmentRadius } from '@/components/usage/charts/usage-chart-utils';
import { getChartColor } from '@/lib/chart-colors';

function labelForModelKey(modelKey: string): string {
  const separator = modelKey.indexOf('::');
  if (separator <= 0) return modelKey;
  return modelKey.slice(separator + 2);
}

type EmbeddingUsageCostChartProps = { usageData: EmbeddingUsageDashboardResponse | undefined };

export function EmbeddingUsageCostChart({ usageData }: EmbeddingUsageCostChartProps) {
  const keys = new Set<string>();
  for (const bucket of usageData?.buckets ?? []) {
    for (const key of Object.keys(bucket.costUsdByModel)) {
      keys.add(key);
    }
  }
  const modelKeys = Array.from(keys).toSorted((a, b) => a.localeCompare(b));

  const labels = usageData?.buckets.map((b) => b.label) ?? [];

  const datasets = modelKeys.map((key, i) => ({
    label: labelForModelKey(key),
    data: usageData?.buckets.map((b) => b.costUsdByModel[key] ?? 0) ?? [],
    backgroundColor: getChartColor(i),
    borderRadius: (ctx: import('chart.js').ScriptableContext<'bar'>) => getStackSegmentRadius(ctx),
    borderSkipped: false as const,
    inflateAmount: 0,
  }));

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
