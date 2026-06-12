import type { UsageDashboardResponse } from '@stitch/shared/usage/types';

import { UsageSummaryCards } from '@/components/usage/cards/usage-summary-cards';
import { formatCost, formatTokens } from '@/components/usage/utils/usage-dashboard-utils';

type UsageDashboardSummaryCardsProps = {
  rangeLabel: string;
  usageData: UsageDashboardResponse | undefined;
};

export function UsageDashboardSummaryCards({
  rangeLabel,
  usageData,
}: UsageDashboardSummaryCardsProps) {
  const granularityLabel = usageData?.range.granularity ?? 'day';
  const totals = usageData?.totals;

  return (
    <UsageSummaryCards
      cards={[
        {
          label: 'Total Cost',
          value: formatCost(totals?.costUsd ?? 0),
          description: `${rangeLabel} · ${granularityLabel} buckets`,
        },
        {
          label: 'Total Tokens',
          value: formatTokens(totals?.tokenMetrics.totalTokens ?? 0),
          description: `${formatTokens(totals?.tokenMetrics.inputTokens ?? 0)} in · ${formatTokens(totals?.tokenMetrics.outputTokens ?? 0)} out`,
        },
      ]}
    />
  );
}
