import { cn } from 'cnfast';

import { barY, defineChart, group, lineY } from '@tanstack/charts';
import { scaleBand } from '@tanstack/charts-scales/band';
import { scaleLinear } from '@tanstack/charts-scales/linear';
import { scalePoint } from '@tanstack/charts-scales/point';
import { polar, radialArc } from '@tanstack/charts/polar';
import { tooltip } from '@tanstack/charts/tooltip';
import { Chart } from '@tanstack/react-charts';

import type { LiquidUiNode } from '@stitch/shared/liquid-ui/schema';

import { Stack } from '@/components/primitives/stack.js';
import { Text } from '@/components/primitives/text.js';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { CHART_CLASS_NAME, CHART_THEME, CHART_TOOLTIP_CLASS_NAME, getChartColor } from '@/lib/chart-colors';

type RenderChildren = (children: string[]) => React.ReactNode;
type LiquidUiRendererProps<TNode extends LiquidUiNode> = { node: TNode; renderChildren: RenderChildren };

const spacingClasses = {
  none: 'gap-space-none',
  xs: 'gap-space-xs',
  sm: 'gap-space-m',
  md: 'gap-space-l',
  lg: 'gap-space-xl',
} as const;

const stackGaps = { none: 'none', xs: 'xs', sm: 'm', md: 'l', lg: 'xl' } as const;

const gridClasses = {
  '1': 'grid-cols-1',
  '2': 'grid-cols-1 sm:grid-cols-2',
  '3': 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  '4': 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
} as const;

const badgeVariantClasses = {
  default: '',
  success: 'bg-success-subtle text-success border-success',
  warning: 'bg-warning-subtle text-warning border-warning',
  destructive: '',
  info: 'bg-info-subtle text-info border-info',
} as const;

const chartSwatchClasses = [
  'bg-chart-1',
  'bg-chart-2',
  'bg-chart-3',
  'bg-chart-4',
  'bg-chart-5',
  'bg-chart-6',
] as const;

const textVariants = {
  body: { variant: 'body', tone: 'default' },
  muted: { variant: 'body', tone: 'muted' },
  heading: { variant: 'heading-s', tone: 'default' },
  caption: { variant: 'caption', tone: 'muted' },
} as const;

function LiquidStack({ node, renderChildren }: LiquidUiRendererProps<Extract<LiquidUiNode, { component: 'Stack' }>>) {
  return <Stack gap={stackGaps[node.spacing]}>{renderChildren(node.children)}</Stack>;
}

function LiquidGrid({ node, renderChildren }: LiquidUiRendererProps<Extract<LiquidUiNode, { component: 'Grid' }>>) {
  return (
    <div className={cn('grid', gridClasses[node.columns], spacingClasses[node.gap])}>
      {renderChildren(node.children)}
    </div>
  );
}

function LiquidRow({ node, renderChildren }: LiquidUiRendererProps<Extract<LiquidUiNode, { component: 'Row' }>>) {
  const align = node.align === 'between' ? 'center' : node.align;
  const justify = node.align === 'between' ? 'between' : node.align;
  return (
    <Stack direction="row" gap={stackGaps[node.gap]} align={align} justify={justify} wrap>
      {renderChildren(node.children)}
    </Stack>
  );
}

function LiquidCard({ node, renderChildren }: LiquidUiRendererProps<Extract<LiquidUiNode, { component: 'Card' }>>) {
  return (
    <Card size="sm" className="w-full">
      {(node.title || node.description) && (
        <CardHeader>
          {node.title && <CardTitle>{node.title}</CardTitle>}
          {node.description && <CardDescription>{node.description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent className="flex flex-col gap-space-l">{renderChildren(node.children)}</CardContent>
    </Card>
  );
}

function LiquidBadge({ node }: LiquidUiRendererProps<Extract<LiquidUiNode, { component: 'Badge' }>>) {
  return (
    <Badge
      variant={node.variant === 'destructive' ? 'destructive' : 'outline'}
      className={badgeVariantClasses[node.variant]}>
      {node.text}
    </Badge>
  );
}

function LiquidStat({ node }: LiquidUiRendererProps<Extract<LiquidUiNode, { component: 'Stat' }>>) {
  const trendText = node.trend ? node.trend : null;

  return (
    <div className="rounded-lg border bg-card p-space-l">
      <Text as="div" variant="label" tone="muted">
        {node.label}
      </Text>
      <div className="mt-space-xs">
        <Text as="div" variant="metric">
          {node.value}
        </Text>
      </div>
      {(node.caption || trendText) && (
        <div className="mt-space-xs">
          <Text as="div" variant="caption" tone="muted">
            {[node.caption, trendText].filter(Boolean).join(' · ')}
          </Text>
        </div>
      )}
    </div>
  );
}

function LiquidKeyValue({ node }: LiquidUiRendererProps<Extract<LiquidUiNode, { component: 'KeyValue' }>>) {
  return (
    <div className="flex items-start justify-between gap-space-xl rounded-md border bg-surface-sunken px-space-l py-space-m">
      <Text as="span" variant="body" tone="muted">
        {node.label}
      </Text>
      <span className="text-right">
        <Text as="span" variant="body-strong">
          {node.value}
        </Text>
      </span>
    </div>
  );
}

function LiquidText({ node }: LiquidUiRendererProps<Extract<LiquidUiNode, { component: 'Text' }>>) {
  const text = textVariants[node.variant];
  return (
    <Text as="p" variant={text.variant} tone={text.tone}>
      {node.text}
    </Text>
  );
}

function LiquidDivider() {
  return <Separator className="my-space-xs" />;
}

type LiquidChartNode = Extract<LiquidUiNode, { component: 'Chart' }>;

function getLiquidChartRows(node: LiquidChartNode) {
  return node.datasets.flatMap((dataset, datasetIndex) =>
    node.labels.map((label, labelIndex) => ({
      id: `${datasetIndex}:${labelIndex}`,
      label,
      series: dataset.label,
      value: dataset.data[labelIndex] ?? 0,
      color: getChartColor(datasetIndex),
    })),
  );
}

function LiquidBarChart({ node }: { node: LiquidChartNode }) {
  const rows = getLiquidChartRows(node);
  const definition = defineChart({
    marks: [
      barY(rows, {
        x: 'label',
        y: 'value',
        z: 'series',
        key: 'id',
        fill: (row) => row.color,
        layout: group({ padding: 0.15 }),
        radius: 4,
      }),
    ],
    x: { scale: () => scaleBand().padding(0.15) },
    y: { scale: scaleLinear, nice: true, grid: true },
    theme: CHART_THEME,
    focus: 'group-x',
    tooltip: { use: tooltip, className: CHART_TOOLTIP_CLASS_NAME, anchor: 'group-center', offset: 8 },
  });

  return (
    <Chart className={CHART_CLASS_NAME} definition={definition} height={220} ariaLabel={node.title ?? 'Bar chart'} />
  );
}

function LiquidLineChart({ node }: { node: LiquidChartNode }) {
  const rows = getLiquidChartRows(node);
  const definition = defineChart({
    marks: [
      lineY(rows, {
        x: 'label',
        y: 'value',
        z: 'series',
        key: 'id',
        stroke: (row) => row.color,
        strokeWidth: 2,
        points: true,
      }),
    ],
    x: { scale: scalePoint },
    y: { scale: scaleLinear, nice: true, grid: true },
    theme: CHART_THEME,
    focus: 'group-x',
    tooltip: { use: tooltip, className: CHART_TOOLTIP_CLASS_NAME, anchor: 'group-center', offset: 8 },
  });

  return (
    <Chart className={CHART_CLASS_NAME} definition={definition} height={220} ariaLabel={node.title ?? 'Line chart'} />
  );
}

function LiquidPieChart({ node }: { node: LiquidChartNode }) {
  const ringCount = node.datasets.length;
  const marks = node.datasets.map((dataset, datasetIndex) => {
    const total = dataset.data.reduce((sum, value) => sum + Math.max(0, value), 0);
    let angle = 0;
    const arcs = node.labels.map((label, labelIndex) => {
      const value = dataset.data[labelIndex] ?? 0;
      const startAngle = angle;
      angle += total === 0 ? 0 : (Math.max(0, value) / total) * Math.PI * 2;
      return {
        id: `${datasetIndex}:${labelIndex}`,
        label,
        series: dataset.label,
        value,
        startAngle,
        endAngle: angle,
        color: getChartColor(labelIndex),
      };
    });
    const ringWidth = 1 / Math.max(ringCount, 1);
    const outerRatio = 1 - datasetIndex * ringWidth;
    const innerRatio = outerRatio - ringWidth;

    return radialArc(arcs, {
      key: 'id',
      fill: (arc) => arc.color,
      innerRadius: ({ radius }) => radius * innerRatio,
      outerRadius: ({ radius }) => radius * outerRatio,
      cornerRadius: 3,
    });
  });

  const definition = defineChart({
    marks: [polar({ marks, inset: 4 })],
    guides: false,
    theme: CHART_THEME,
    tooltip: {
      use: tooltip,
      className: CHART_TOOLTIP_CLASS_NAME,
      offset: 8,
      format: (point) => `${point.datum.label}: ${point.datum.value.toLocaleString()}`,
    },
  });

  return (
    <Chart className={CHART_CLASS_NAME} definition={definition} height={220} ariaLabel={node.title ?? 'Pie chart'} />
  );
}

function LiquidChartLegend({ node }: { node: LiquidChartNode }) {
  const labels = node.kind === 'pie' ? node.labels : node.datasets.map((dataset) => dataset.label);

  return (
    <Stack direction="row" gap="l" justify="center" wrap>
      {labels.map((label, index) => (
        <Stack key={label} direction="row" gap="xs" align="center">
          <span
            className={cn('inline-block rounded-sm p-space-xs', chartSwatchClasses[index % chartSwatchClasses.length])}
          />
          <Text as="span" variant="caption" tone="muted">
            {label}
          </Text>
        </Stack>
      ))}
    </Stack>
  );
}

function LiquidChart({ node }: LiquidUiRendererProps<LiquidChartNode>) {
  const chart =
    node.kind === 'line' ? (
      <LiquidLineChart node={node} />
    ) : node.kind === 'bar' ? (
      <LiquidBarChart node={node} />
    ) : (
      <LiquidPieChart node={node} />
    );

  return (
    <div className="rounded-lg border bg-card p-space-l">
      {node.title && (
        <div className="mb-space-l">
          <Text as="div" variant="body-strong">
            {node.title}
          </Text>
        </div>
      )}
      {chart}
      <LiquidChartLegend node={node} />
    </div>
  );
}

export function renderLiquidUiNode(node: LiquidUiNode, renderChildren: RenderChildren): React.ReactNode {
  switch (node.component) {
    case 'Stack':
      return <LiquidStack node={node} renderChildren={renderChildren} />;
    case 'Grid':
      return <LiquidGrid node={node} renderChildren={renderChildren} />;
    case 'Row':
      return <LiquidRow node={node} renderChildren={renderChildren} />;
    case 'Card':
      return <LiquidCard node={node} renderChildren={renderChildren} />;
    case 'Badge':
      return <LiquidBadge node={node} renderChildren={renderChildren} />;
    case 'Stat':
      return <LiquidStat node={node} renderChildren={renderChildren} />;
    case 'KeyValue':
      return <LiquidKeyValue node={node} renderChildren={renderChildren} />;
    case 'Text':
      return <LiquidText node={node} renderChildren={renderChildren} />;
    case 'Divider':
      return <LiquidDivider />;
    case 'Chart':
      return <LiquidChart node={node} renderChildren={renderChildren} />;
  }
}
