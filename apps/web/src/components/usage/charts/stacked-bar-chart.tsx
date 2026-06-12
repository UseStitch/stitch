import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
  type TooltipItem,
} from 'chart.js';
import * as React from 'react';
import { Bar } from 'react-chartjs-2';

import { EmptyChart, useChartTheme } from '@/components/usage/charts/usage-chart-utils';
import { formatCost } from '@/components/usage/utils/usage-dashboard-utils';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

type StackedBarDataset = {
  label: string;
  data: number[];
  backgroundColor: string;
  borderRadius: (ctx: import('chart.js').ScriptableContext<'bar'>) => {
    topLeft: number;
    topRight: number;
    bottomLeft: number;
    bottomRight: number;
  };
  borderSkipped: false;
  inflateAmount: number;
};

type StackedBarChartProps = {
  title: string;
  subtitle: string;
  emptyMessage: string;
  labels: string[];
  datasets: StackedBarDataset[];
};

export function StackedBarChart({
  title,
  subtitle,
  emptyMessage,
  labels,
  datasets,
}: StackedBarChartProps) {
  const { tickColor, gridColor } = useChartTheme();
  const hasData = labels.length > 0;

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
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="h-64 md:h-96">
        {hasData ? (
          <Bar data={{ labels, datasets }} options={chartOptions} />
        ) : (
          <EmptyChart message={emptyMessage} />
        )}
      </div>
    </div>
  );
}
