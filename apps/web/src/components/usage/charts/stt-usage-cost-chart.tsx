import * as React from 'react';

import type { SttUsageDashboardResponse } from '@stitch/shared/usage/types';

import { StackedBarChart } from '@/components/usage/charts/stacked-bar-chart';
import { getStackSegmentRadius } from '@/components/usage/charts/usage-chart-utils';
import { getChartColor, getChartColorForKey } from '@/lib/chart-colors';

const SERVICE_COLOR_INDEX: Record<string, number> = { 'chat-input': 0, 'meeting-recording': 1 };

const SERVICE_LABELS: Record<string, string> = { 'chat-input': 'Chat Input', 'meeting-recording': 'Meeting Recording' };

function getServiceColor(service: string): string {
  const index = SERVICE_COLOR_INDEX[service];
  if (index !== undefined) return getChartColor(index);
  return getChartColorForKey(service);
}

function getServiceLabel(service: string): string {
  return SERVICE_LABELS[service] ?? service.replaceAll('-', ' ');
}

type SttUsageCostChartProps = { usageData: SttUsageDashboardResponse | undefined };

export function SttUsageCostChart({ usageData }: SttUsageCostChartProps) {
  const services = React.useMemo(
    () => [...(usageData?.services ?? [])].sort((a, b) => a.localeCompare(b)),
    [usageData?.services],
  );
  const labels = usageData?.buckets.map((b) => b.label) ?? [];

  const datasets = React.useMemo(
    () =>
      services.map((service) => ({
        label: getServiceLabel(service),
        data: usageData?.buckets.map((b) => b.costUsdByService[service] ?? 0) ?? [],
        backgroundColor: getServiceColor(service),
        borderRadius: (ctx: import('chart.js').ScriptableContext<'bar'>) => getStackSegmentRadius(ctx),
        borderSkipped: false as const,
        inflateAmount: 0,
      })),
    [services, usageData],
  );

  return (
    <StackedBarChart
      title="Cost over time"
      subtitle="Stacked by service"
      emptyMessage="No STT usage data for the selected filters."
      labels={labels}
      datasets={datasets}
    />
  );
}
