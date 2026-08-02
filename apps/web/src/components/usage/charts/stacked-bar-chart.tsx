import { useMemo } from 'react';

import { barY, colorLegend, defineChart } from '@tanstack/charts';
import { scaleBand } from '@tanstack/charts-scales/band';
import { scaleLinear } from '@tanstack/charts-scales/linear';
import { tooltip } from '@tanstack/charts/tooltip';
import { Chart } from '@tanstack/react-charts';

import { Text } from '@/components/primitives/text';
import { EmptyChart } from '@/components/usage/charts/usage-chart-utils';
import { formatCost } from '@/components/usage/utils/usage-dashboard-utils';

type StackedBarDataset = { label: string; data: number[]; color: string };

type StackedBarChartProps = {
  title: string;
  subtitle: string;
  emptyMessage: string;
  labels: string[];
  datasets: StackedBarDataset[];
};

export function StackedBarChart({ title, subtitle, emptyMessage, labels, datasets }: StackedBarChartProps) {
  const hasData = labels.length > 0;
  const definition = useMemo(() => {
    const rows = datasets.flatMap((dataset) =>
      labels.map((label, index) => ({
        id: `${label}:${dataset.label}`,
        label,
        series: dataset.label,
        value: dataset.data[index] ?? 0,
      })),
    );

    return defineChart({
      marks: [barY(rows, { x: 'label', y: 'value', color: 'series', key: 'id' })],
      x: { scale: () => scaleBand().padding(0.12) },
      y: { scale: scaleLinear, nice: true, grid: true, axis: { ticks: { format: (value) => formatCost(value) } } },
      color: {
        domain: datasets.map((dataset) => dataset.label),
        range: datasets.map((dataset) => dataset.color),
        legend: colorLegend(),
      },
      focus: 'group-x',
      tooltip: { use: tooltip, items: ['x', { channel: 'y', text: (point) => formatCost(point.yValue) }, 'group'] },
    });
  }, [datasets, labels]);

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
      <div className="h-80">
        {hasData ? (
          <Chart definition={definition} height={320} ariaLabel={`${title}. ${subtitle}.`} />
        ) : (
          <EmptyChart message={emptyMessage} />
        )}
      </div>
    </div>
  );
}
