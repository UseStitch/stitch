import type { UsageDashboardResponse } from '@stitch/shared/usage/types';

import { StackedBarChart } from '@/components/usage/charts/stacked-bar-chart';
import { getSourceLabel, useSourceOrder } from '@/components/usage/utils/usage-dashboard-utils';
import { getChartColor } from '@/lib/chart-colors';

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
  return getChartColor(index);
}

type UsageDashboardCostChartProps = { usageData: UsageDashboardResponse | undefined };

export function UsageDashboardCostChart({ usageData }: UsageDashboardCostChartProps) {
  const sources = useSourceOrder(usageData?.sources ?? []);
  const labels = usageData?.buckets.map((b) => b.label) ?? [];

  const datasets = sources.map((source) => ({
    label: getSourceLabel(source),
    data: usageData?.buckets.map((b) => b.costUsdBySource[source] ?? 0) ?? [],
    color: getSourceColor(source),
  }));

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
