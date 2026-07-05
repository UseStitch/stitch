import * as React from 'react';

import type { SttUsageDashboardResponse } from '@stitch/shared/usage/types';

import { StackedBarChart } from '@/components/usage/charts/stacked-bar-chart';
import { getStackSegmentRadius, hashString, resolveCssVar } from '@/components/usage/charts/usage-chart-utils';

const FALLBACK_COLORS = ['#f97316', '#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#14b8a6'];

const SERVICE_COLOR_CONFIG: Record<string, { cssVar: string; fallback: string }> = {
  'chat-input': { cssVar: '--chart-1', fallback: '#f97316' },
  'meeting-recording': { cssVar: '--chart-2', fallback: '#10b981' },
};

const SERVICE_LABELS: Record<string, string> = { 'chat-input': 'Chat Input', 'meeting-recording': 'Meeting Recording' };

function getServiceColor(service: string): string {
  const configured = SERVICE_COLOR_CONFIG[service];
  if (configured) return resolveCssVar(configured.cssVar, configured.fallback);
  return FALLBACK_COLORS[hashString(service) % FALLBACK_COLORS.length] ?? '#6b7280';
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
