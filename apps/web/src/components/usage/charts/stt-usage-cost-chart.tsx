import type { SttUsageDashboardResponse } from '@stitch/shared/usage/types';

import { StackedBarChart } from '@/components/usage/charts/stacked-bar-chart';
import { getChartColor } from '@/lib/chart-colors';

const SERVICE_COLOR_INDEX = new Map([
  ['chat-input', 0],
  ['meeting-recording', 1],
]);

const SERVICE_LABELS = new Map([
  ['chat-input', 'Chat Input'],
  ['meeting-recording', 'Meeting Recording'],
]);

function getServiceColor(service: string): string {
  const index = SERVICE_COLOR_INDEX.get(service);
  return getChartColor(index ?? 0);
}

function getServiceLabel(service: string): string {
  return SERVICE_LABELS.get(service) ?? service.replaceAll('-', ' ');
}

type SttUsageCostChartProps = { usageData: SttUsageDashboardResponse | undefined };

export function SttUsageCostChart({ usageData }: SttUsageCostChartProps) {
  const services = [...(usageData?.services ?? [])].toSorted((a, b) => a.localeCompare(b));
  const labels = usageData?.buckets.map((b) => b.label) ?? [];

  const datasets = services.map((service) => ({
    label: getServiceLabel(service),
    data: usageData?.buckets.map((b) => b.costUsdByService[service] ?? 0) ?? [],
    color: getServiceColor(service),
  }));

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
