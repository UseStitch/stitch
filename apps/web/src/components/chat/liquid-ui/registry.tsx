import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  ArcElement,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Bar, Line, Pie } from 'react-chartjs-2';

import type { LiquidUiNode } from '@stitch/shared/liquid-ui/schema';

import { Stack } from '@/components/primitives/stack.js';
import { Text } from '@/components/primitives/text.js';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { getChartColor } from '@/lib/chart-colors';
import { cn } from '@/lib/utils';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend);

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

function LiquidChart({ node }: LiquidUiRendererProps<Extract<LiquidUiNode, { component: 'Chart' }>>) {
  const chartData = {
    labels: node.labels,
    datasets: node.datasets.map((dataset, index) => {
      const color = getChartColor(index);
      return {
        ...dataset,
        backgroundColor: node.kind === 'pie' ? dataset.data.map((_, itemIndex) => getChartColor(itemIndex)) : color,
        borderColor: color,
        tension: 0.35,
      };
    }),
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' as const } },
  };
  const chart =
    node.kind === 'line' ? (
      <Line data={chartData} options={options} />
    ) : node.kind === 'bar' ? (
      <Bar data={chartData} options={options} />
    ) : (
      <Pie data={chartData} options={options} />
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
      <div className="h-64">{chart}</div>
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
