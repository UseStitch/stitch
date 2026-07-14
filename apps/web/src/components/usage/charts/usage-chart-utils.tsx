import { BarChart3Icon } from 'lucide-react';
import * as React from 'react';

import { getChartGridColor, getChartTickColor } from '@/lib/chart-colors';
import type { ScriptableContext } from 'chart.js';

function getNumericValue(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function getStackSegmentRadius(ctx: ScriptableContext<'bar'>, radius = 5) {
  const { datasetIndex, dataIndex } = ctx;
  const datasets = ctx.chart.data.datasets;

  const hasAbove = datasets.slice(datasetIndex + 1).some((dataset) => getNumericValue(dataset.data?.[dataIndex]) > 0);
  return { topLeft: hasAbove ? 0 : radius, topRight: hasAbove ? 0 : radius, bottomLeft: 0, bottomRight: 0 };
}

export function useChartTheme() {
  return React.useMemo(() => ({ tickColor: getChartTickColor(), gridColor: getChartGridColor() }), []);
}

export function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <BarChart3Icon className="size-8 text-muted-foreground/40" />
      <div>
        <p className="text-sm font-medium text-foreground/60">No data</p>
        <p className="text-xs text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
