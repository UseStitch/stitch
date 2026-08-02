import type { ChartTheme } from '@tanstack/charts';

const CHART_FALLBACK_COLORS = ['#f97316', '#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#14b8a6'];

export const CHART_THEME = {
  foreground: 'var(--muted-foreground)',
  muted: 'color-mix(in oklab, var(--muted-foreground) 65%, transparent)',
  grid: 'var(--border)',
  background: 'transparent',
  palette: CHART_FALLBACK_COLORS.map((fallback, index) => `var(--chart-${index + 1}, ${fallback})`),
} satisfies Partial<ChartTheme>;

export const CHART_CLASS_NAME = 'stitch-chart';
export const CHART_TOOLTIP_CLASS_NAME = 'stitch-chart-tooltip';

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Resolves the color for series `index`, cycling through `--chart-1`..`--chart-6`. */
export function getChartColor(index: number): string {
  const position = index % CHART_FALLBACK_COLORS.length;
  const fallback = CHART_FALLBACK_COLORS[position] ?? '#6b7280';
  return `var(--chart-${position + 1}, ${fallback})`;
}

/** Resolves a chart color for an arbitrary series key by hashing it onto the chart palette. */
export function getChartColorForKey(key: string): string {
  return getChartColor(hashString(key));
}
