import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
  type TooltipItem,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

import { Text } from '@/components/primitives/text';
import { EmptyChart, useChartTheme } from '@/components/usage/charts/usage-chart-utils';
import { formatCost } from '@/components/usage/utils/usage-dashboard-utils';

ChartJS.register(BarController, CategoryScale, LinearScale, BarElement, Tooltip, Legend);

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

export function StackedBarChart({ title, subtitle, emptyMessage, labels, datasets }: StackedBarChartProps) {
  const { tickColor, gridColor } = useChartTheme();
  const hasData = labels.length > 0;

  const baseScales = {
    x: { stacked: true, grid: { display: false }, ticks: { color: tickColor }, border: { color: gridColor } },
    y: {
      stacked: true,
      beginAtZero: true,
      grid: { color: gridColor },
      ticks: { color: tickColor },
      border: { display: false },
    },
  };

  const baseLegend = {
    position: 'bottom' as const,
    labels: {
      usePointStyle: true,
      pointStyle: 'rectRounded' as const,
      color: tickColor,
      padding: 16,
      font: { size: 12 },
    },
  };

  const chartOptions = {
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
        ticks: { ...baseScales.y.ticks, callback: (value: string | number) => formatCost(Number(value)) },
      },
    },
  };

  return (
    <div className="rounded-xl bg-surface-sunken p-space-xl">
      <div className="mb-space-xl">
        <Text as="p" variant="body-strong">
          {title}
        </Text>
        <Text as="p" variant="caption" tone="muted">
          {subtitle}
        </Text>
      </div>
      <div className="h-64 md:h-96">
        {hasData ? <Bar data={{ labels, datasets }} options={chartOptions} /> : <EmptyChart message={emptyMessage} />}
      </div>
    </div>
  );
}
