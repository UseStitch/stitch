import type { SttUsageDashboardResponse } from '@stitch/shared/usage/types';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCost } from '@/components/usage/usage-dashboard-utils';

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
          <CardDescription>Total Duration</CardDescription>
          <CardTitle className="text-3xl font-bold tabular-nums">
            {formatDuration(usageData?.totals.durationMs ?? 0)}
          </CardTitle>
          <p className="text-xs text-muted-foreground">Audio transcribed</p>
        </CardHeader>
      </Card>
    </div>
  );
}
