import * as React from 'react';

import type { UsageDashboardResponse } from '@stitch/shared/usage/types';

import { StackedBarChart } from '@/components/usage/charts/stacked-bar-chart';
import {
  getStackSegmentRadius,
  hashString,
  resolveCssVar,
} from '@/components/usage/charts/usage-chart-utils';
import { getSourceLabel, useSourceOrder } from '@/components/usage/utils/usage-dashboard-utils';

const FALLBACK_COLORS = ['#f97316', '#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#14b8a6'];

const SOURCE_COLOR_CONFIG: Record<string, { cssVar: string; fallback: string }> = {
  chat: { cssVar: '--chart-1', fallback: '#f97316' },
  automation: { cssVar: '--chart-2', fallback: '#10b981' },
  automation_generation: { cssVar: '--chart-5', fallback: '#8b5cf6' },
  title_generation: { cssVar: '--chart-3', fallback: '#3b82f6' },
  memory_extraction: { cssVar: '--chart-4', fallback: '#ec4899' },
  recording_analysis: { cssVar: '--chart-5', fallback: '#14b8a6' },
};

function getSourceColor(source: string): string {
  const configured = SOURCE_COLOR_CONFIG[source];
  if (configured) return resolveCssVar(configured.cssVar, configured.fallback);
  return FALLBACK_COLORS[hashString(source) % FALLBACK_COLORS.length] ?? '#6b7280';
}

type UsageDashboardCostChartProps = {
  usageData: UsageDashboardResponse | undefined;
};

export function UsageDashboardCostChart({ usageData }: UsageDashboardCostChartProps) {
  const sources = useSourceOrder(usageData?.sources ?? []);
  const labels = usageData?.buckets.map((b) => b.label) ?? [];

  const datasets = React.useMemo(
    () =>
      sources.map((source) => ({
        label: getSourceLabel(source),
        data: usageData?.buckets.map((b) => b.costUsdBySource[source] ?? 0) ?? [],
        backgroundColor: getSourceColor(source),
        borderRadius: getStackSegmentRadius,
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
