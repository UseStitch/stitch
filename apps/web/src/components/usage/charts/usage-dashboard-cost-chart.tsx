import * as React from 'react';

import type { UsageDashboardResponse } from '@stitch/shared/usage/types';

import { StackedBarChart } from '@/components/usage/charts/stacked-bar-chart';
import { getStackSegmentRadius } from '@/components/usage/charts/usage-chart-utils';
import { getSourceLabel, useSourceOrder } from '@/components/usage/utils/usage-dashboard-utils';
import { getChartColor, getChartColorForKey } from '@/lib/chart-colors';

const SOURCE_COLOR_INDEX: Record<string, number> = {
  chat: 0,
  automation: 1,
  automation_generation: 4,
  title_generation: 2,
  memory_extraction: 3,
  recording_analysis: 4,
};

function getSourceColor(source: string): string {
  const index = SOURCE_COLOR_INDEX[source];
  if (index !== undefined) return getChartColor(index);
  return getChartColorForKey(source);
}

type UsageDashboardCostChartProps = { usageData: UsageDashboardResponse | undefined };

export function UsageDashboardCostChart({ usageData }: UsageDashboardCostChartProps) {
  const sources = useSourceOrder(usageData?.sources ?? []);
  const labels = usageData?.buckets.map((b) => b.label) ?? [];

  const datasets = React.useMemo(
    () =>
      sources.map((source) => ({
        label: getSourceLabel(source),
        data: usageData?.buckets.map((b) => b.costUsdBySource[source] ?? 0) ?? [],
        backgroundColor: getSourceColor(source),
        borderRadius: (ctx: import('chart.js').ScriptableContext<'bar'>) => getStackSegmentRadius(ctx),
        borderSkipped: false as const,
        inflateAmount: 0,
      })),
    [sources, usageData],
  );

  return (
    <StackedBarChart
      title="Cost over time"
      subtitle="Stacked by source"
      emptyMessage="No usage data for the selected filters."
      labels={labels}
      datasets={datasets}
    />
  );
}
