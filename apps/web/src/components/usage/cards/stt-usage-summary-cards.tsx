import type { SttUsageDashboardResponse } from '@stitch/shared/usage/types';

import { UsageSummaryCards } from '@/components/usage/cards/usage-summary-cards';
import { formatCost } from '@/components/usage/utils/usage-dashboard-utils';

type SttUsageSummaryCardsProps = {
  rangeLabel: string;
  usageData: SttUsageDashboardResponse | undefined;
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function SttUsageSummaryCards({ rangeLabel, usageData }: SttUsageSummaryCardsProps) {
  const granularityLabel = usageData?.range.granularity ?? 'day';

  return (
    <UsageSummaryCards
      cards={[
        {
          label: 'Total Cost',
          value: formatCost(usageData?.totals.costUsd ?? 0),
          description: `${rangeLabel} · ${granularityLabel} buckets`,
        },
        {
          label: 'Total Duration',
          value: formatDuration(usageData?.totals.durationMs ?? 0),
          description: 'Audio transcribed',
        },
      ]}
    />
  );
}
