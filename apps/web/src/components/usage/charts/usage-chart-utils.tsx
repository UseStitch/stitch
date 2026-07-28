import { BarChart3Icon } from 'lucide-react';

import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { getChartGridColor, getChartTickColor } from '@/lib/chart-colors';
import type { ScriptableContext } from 'chart.js';

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
  return { tickColor: getChartTickColor(), gridColor: getChartGridColor() };
}

export function EmptyChart({ message }: { message: string }) {
  return (
    <div className="grid h-full place-items-center text-center">
      <Stack gap="l" align="center">
        <div className="[&_svg]:size-3xl text-text-faint">
          <BarChart3Icon />
        </div>
        <div>
          <Text as="p" variant="body-strong" tone="faint">
            No data
          </Text>
          <Text as="p" variant="caption" tone="muted">
            {message}
          </Text>
        </div>
      </Stack>
    </div>
  );
}
