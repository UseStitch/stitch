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

/** Resolves the color for series `index`, cycling through `--chart-1`..`--chart-6`. */
export function getChartColor(index: number): string {
  return `var(--chart-${(index % PALETTE_SIZE) + 1})`;
}
