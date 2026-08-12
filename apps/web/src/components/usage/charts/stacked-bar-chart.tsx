import { barY, colorLegend, defineChart } from '@tanstack/charts';
import { scaleBand } from '@tanstack/charts-scales/band';
import { scaleLinear } from '@tanstack/charts-scales/linear';
import { tooltip } from '@tanstack/charts/tooltip';
import { Chart } from '@tanstack/react-charts';

import { Text } from '@/components/primitives/text';
import { EmptyChart } from '@/components/usage/charts/usage-chart-utils';
import { formatCost } from '@/components/usage/utils/usage-dashboard-utils';
import { CHART_CLASS_NAME, CHART_THEME, CHART_TOOLTIP_CLASS_NAME } from '@/lib/chart-colors';

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
  const rows = datasets.flatMap((dataset) =>
    labels.map((label, index) => ({
      id: `${label}:${dataset.label}`,
      label,
      series: dataset.label,
      value: dataset.data[index] ?? 0,
    })),
  );

  const definition = defineChart({
    marks: [barY(rows, { x: 'label', y: 'value', color: 'series', key: 'id' })],
    x: { scale: () => scaleBand().padding(0.12) },
    y: { scale: scaleLinear, nice: true, grid: true, axis: { ticks: { format: (value) => formatCost(value) } } },
    color: {
      domain: datasets.map((dataset) => dataset.label),
      range: datasets.map((dataset) => dataset.color),
      legend: colorLegend(),
    },
    theme: CHART_THEME,
    focus: 'group-x',
    tooltip: {
      use: tooltip,
      className: CHART_TOOLTIP_CLASS_NAME,
      anchor: 'group-center',
      placement: ['top', 'right', 'left', 'bottom'],
      offset: 8,
      items: ['x', { channel: 'y', text: (point) => formatCost(point.yValue) }, 'group'],
    },
  });

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
          <Chart
            className={CHART_CLASS_NAME}
            definition={definition}
            height={320}
            ariaLabel={`${title}. ${subtitle}.`}
          />
        ) : (
          <EmptyChart message={emptyMessage} />
        )}
      </div>
    </div>
  );
}
