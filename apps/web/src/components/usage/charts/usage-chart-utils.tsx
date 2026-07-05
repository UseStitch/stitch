import { BarChart3Icon } from 'lucide-react';
import * as React from 'react';

import type { ScriptableContext } from 'chart.js';

export function resolveCssVar(varName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value.length > 0 ? value : fallback;
}

export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

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
  return React.useMemo(() => {
    const tickColor = resolveCssVar('--muted-foreground', '#71717a');
    const gridColor = resolveCssVar('--border', '#27272a');
    return { tickColor, gridColor };
  }, []);
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
