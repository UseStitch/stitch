import type { ChartTheme } from '@tanstack/charts';

const PALETTE_SIZE = 6;

export const CHART_THEME = {
  foreground: 'var(--muted-foreground)',
  muted: 'color-mix(in oklab, var(--muted-foreground) 65%, transparent)',
  grid: 'var(--border)',
  background: 'transparent',
  palette: Array.from({ length: PALETTE_SIZE }, (_, i) => `var(--chart-${i + 1})`),
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
  return `var(--chart-${(index % PALETTE_SIZE) + 1})`;
}

/** Resolves a chart color for an arbitrary series key by hashing it onto the chart palette. */
export function getChartColorForKey(key: string): string {
  return getChartColor(hashString(key));
}
