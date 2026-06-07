import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  type ScriptableContext,
  Tooltip,
  type TooltipItem,
} from 'chart.js';
import { BarChart3Icon } from 'lucide-react';
import * as React from 'react';
import { Bar } from 'react-chartjs-2';

import type { UsageDashboardResponse } from '@stitch/shared/usage/types';

import {
  formatCost,
  getSourceLabel,
  useSourceOrder,
} from '@/components/usage/usage-dashboard-utils';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const FALLBACK_SOURCE_COLORS = ['#f97316', '#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#14b8a6'];

const SOURCE_COLOR_CONFIG: Record<string, { cssVar: string; fallback: string }> = {
  chat: { cssVar: '--chart-1', fallback: '#f97316' },
  automation: { cssVar: '--chart-2', fallback: '#10b981' },
  automation_generation: { cssVar: '--chart-5', fallback: '#8b5cf6' },
  title_generation: { cssVar: '--chart-3', fallback: '#3b82f6' },
  transcription: { cssVar: '--chart-4', fallback: '#f59e0b' },
  memory_extraction: { cssVar: '--chart-4', fallback: '#ec4899' },
  recording_analysis: { cssVar: '--chart-5', fallback: '#14b8a6' },
};

type UsageDashboardCostChartProps = {
  usageData: UsageDashboardResponse | undefined;
};

function resolveCssVar(varName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value.length > 0 ? value : fallback;
}

function hashSource(source: string): number {
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function getSourceColor(source: string): string {
  const configured = SOURCE_COLOR_CONFIG[source];
  if (configured) {
    return resolveCssVar(configured.cssVar, configured.fallback);
  }

  const fallback = FALLBACK_SOURCE_COLORS[hashSource(source) % FALLBACK_SOURCE_COLORS.length];
  return fallback ?? '#6b7280';
}

function getNumericValue(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getStackSegmentRadius(ctx: ScriptableContext<'bar'>, radius = 5) {
  const datasetIndex = ctx.datasetIndex;
  const dataIndex = ctx.dataIndex;
  const datasets = ctx.chart.data.datasets;

  const hasAbove = datasets
    .slice(datasetIndex + 1)
    .some((dataset) => getNumericValue(dataset.data?.[dataIndex]) > 0);
  const hasBelow = datasets
    .slice(0, datasetIndex)
    .some((dataset) => getNumericValue(dataset.data?.[dataIndex]) > 0);

  return {
    topLeft: hasAbove ? 0 : radius,
    topRight: hasAbove ? 0 : radius,
    bottomLeft: hasBelow ? 0 : radius,
    bottomRight: hasBelow ? 0 : radius,
  };
}

function useChartTheme() {
  return React.useMemo(() => {
    const tickColor = resolveCssVar('--muted-foreground', '#71717a');
    const gridColor = resolveCssVar('--border', '#27272a');
    return { tickColor, gridColor };
  }, []);
}

function EmptyChart({ message }: { message: string }) {
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

export function UsageDashboardCostChart({ usageData }: UsageDashboardCostChartProps) {
  const sources = useSourceOrder(usageData?.sources ?? []);
  const sourceColors = React.useMemo(
    () => Object.fromEntries(sources.map((source) => [source, getSourceColor(source)])),
    [sources],
  );
  const { tickColor, gridColor } = useChartTheme();
  const hasData = !!usageData && usageData.buckets.length > 0;

  const chartData = React.useMemo(
    () => ({
      labels: usageData?.buckets.map((b) => b.label) ?? [],
      datasets: sources.map((source) => ({
        label: getSourceLabel(source),
        data: usageData?.buckets.map((b) => b.costUsdBySource[source] ?? 0) ?? [],
        backgroundColor: sourceColors[source] ?? '#6b7280',
        borderRadius: (ctx: ScriptableContext<'bar'>) => getStackSegmentRadius(ctx),
        borderSkipped: false,
        inflateAmount: 0,
      })),
    }),
    [sourceColors, sources, usageData],
  );

  const baseScales = React.useMemo(
    () => ({
      x: {
        stacked: true,
        grid: { display: false },
        ticks: { color: tickColor },
        border: { color: gridColor },
      },
      y: {
        stacked: true,
        beginAtZero: true,
        grid: { color: gridColor },
        ticks: { color: tickColor },
        border: { display: false },
      },
    }),
    [gridColor, tickColor],
  );

  const baseLegend = React.useMemo(
    () => ({
      position: 'bottom' as const,
      labels: {
        usePointStyle: true,
        pointStyle: 'rectRounded' as const,
        color: tickColor,
        padding: 16,
        font: { size: 12 },
      },
    }),
    [tickColor],
  );

  const chartOptions = React.useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: baseLegend,
        tooltip: {
          callbacks: {
            label: (ctx: TooltipItem<'bar'>) => {
              const value = Number(ctx.raw ?? 0);
              if (value === 0) return [];
              return `${ctx.dataset.label}: ${formatCost(value)}`;
            },
          },
        },
      },
      scales: {
        ...baseScales,
        y: {
          ...baseScales.y,
          ticks: {
            ...baseScales.y.ticks,
            callback: (value: string | number) => formatCost(Number(value)),
          },
        },
      },
    }),
    [baseScales, baseLegend],
  );

  return (
    <div className="rounded-xl bg-muted/20 p-4">
      <div className="mb-4">
        <p className="text-sm font-medium">Cost over time</p>
        <p className="text-xs text-muted-foreground">Stacked by source</p>
      </div>
      <div className="h-64 md:h-96">
        {hasData ? (
          <Bar data={chartData} options={chartOptions} />
        ) : (
          <EmptyChart message="No usage data for the selected filters." />
        )}
      </div>
    </div>
  );
}
