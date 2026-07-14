const CHART_FALLBACK_COLORS = ['#f97316', '#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#14b8a6'];
const CHART_TICK_FALLBACK = '#71717a';
const CHART_GRID_FALLBACK = '#27272a';

function resolveCssVar(varName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value.length > 0 ? value : fallback;
}

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
  return resolveCssVar(`--chart-${position + 1}`, fallback);
}

/** Resolves a chart color for an arbitrary series key by hashing it onto the chart palette. */
export function getChartColorForKey(key: string): string {
  return getChartColor(hashString(key));
}

export function getChartTickColor(): string {
  return resolveCssVar('--muted-foreground', CHART_TICK_FALLBACK);
}

export function getChartGridColor(): string {
  return resolveCssVar('--border', CHART_GRID_FALLBACK);
}
