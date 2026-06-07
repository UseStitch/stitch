import type { UsageDashboardResponse } from '@stitch/shared/usage/types';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCost, formatTokens } from '@/components/usage/usage-dashboard-utils';

type UsageDashboardSummaryCardsProps = {
  rangeLabel: string;
  usageData: UsageDashboardResponse | undefined;
};

export function UsageDashboardSummaryCards({
  rangeLabel,
  usageData,
}: UsageDashboardSummaryCardsProps) {
  const granularityLabel = usageData?.range.granularity ?? 'day';

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Card className="shadow-sm">
        <CardHeader>
          <CardDescription>Total Cost</CardDescription>
          <CardTitle className="text-3xl font-bold tabular-nums">
            {formatCost(usageData?.totals.costUsd ?? 0)}
          </CardTitle>
          <p className="text-xs text-muted-foreground capitalize">
            {rangeLabel} · {granularityLabel} buckets
          </p>
        </CardHeader>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardDescription>Total Tokens</CardDescription>
          <CardTitle className="text-3xl font-bold tabular-nums">
            {formatTokens(usageData?.totals.tokenMetrics.totalTokens ?? 0)}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {formatTokens(usageData?.totals.tokenMetrics.inputTokens ?? 0)} in ·{' '}
            {formatTokens(usageData?.totals.tokenMetrics.outputTokens ?? 0)} out
          </p>
        </CardHeader>
      </Card>
    </div>
  );
}
