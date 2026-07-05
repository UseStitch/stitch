import type { EmbeddingUsageDashboardResponse } from '@stitch/shared/usage/types';

import { UsageSummaryCards } from '@/components/usage/cards/usage-summary-cards';
import { formatCost, formatTokens } from '@/components/usage/utils/usage-dashboard-utils';

type EmbeddingUsageSummaryCardsProps = { rangeLabel: string; usageData: EmbeddingUsageDashboardResponse | undefined };

export function EmbeddingUsageSummaryCards({ rangeLabel, usageData }: EmbeddingUsageSummaryCardsProps) {
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
          label: 'Total Tokens',
          value: formatTokens(usageData?.totals.totalTokens ?? 0),
          description: 'Tokens embedded',
        },
      ]}
    />
  );
}
