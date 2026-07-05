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

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend);

type RenderChildren = (children: string[]) => React.ReactNode;
type LiquidUiRendererProps<TNode extends LiquidUiNode> = { node: TNode; renderChildren: RenderChildren };

const spacingClasses = { none: 'gap-0', xs: 'gap-1', sm: 'gap-2', md: 'gap-3', lg: 'gap-4' } as const;

const gridClasses = {
  '1': 'grid-cols-1',
  '2': 'grid-cols-1 sm:grid-cols-2',
  '3': 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  '4': 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
} as const;

const alignClasses = {
  start: 'items-start justify-start',
  center: 'items-center justify-center',
  end: 'items-end justify-end',
  between: 'items-center justify-between',
} as const;

const badgeVariantClasses = {
  default: '',
  success: 'bg-success/10 text-success border-success/20',
  warning: 'bg-warning/10 text-warning border-warning/20',
  destructive: '',
  info: 'bg-info/10 text-info border-info/20',
} as const;

const textVariantClasses = {
  body: 'text-sm text-foreground',
  muted: 'text-sm text-muted-foreground',
  heading: 'text-base font-semibold text-foreground',
  caption: 'text-xs text-muted-foreground',
} as const;

const chartFallbackColors = ['#f97316', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6'];

function resolveCssVar(varName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value.length > 0 ? value : fallback;
}

function getChartColor(index: number): string {
  const fallback = chartFallbackColors[index % chartFallbackColors.length] ?? '#6b7280';
  return resolveCssVar(`--chart-${(index % 5) + 1}`, fallback);
}

function LiquidStack({ node, renderChildren }: LiquidUiRendererProps<Extract<LiquidUiNode, { component: 'Stack' }>>) {
  return <div className={cn('flex flex-col', spacingClasses[node.spacing])}>{renderChildren(node.children)}</div>;
}

function LiquidGrid({ node, renderChildren }: LiquidUiRendererProps<Extract<LiquidUiNode, { component: 'Grid' }>>) {
  return (
    <div className={cn('grid', gridClasses[node.columns], spacingClasses[node.gap])}>
      {renderChildren(node.children)}
    </div>
  );
}

function LiquidRow({ node, renderChildren }: LiquidUiRendererProps<Extract<LiquidUiNode, { component: 'Row' }>>) {
  return (
    <div className={cn('flex flex-wrap', spacingClasses[node.gap], alignClasses[node.align])}>
      {renderChildren(node.children)}
    </div>
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
      <CardContent className="flex flex-col gap-3">{renderChildren(node.children)}</CardContent>
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
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs font-medium text-muted-foreground">{node.label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{node.value}</div>
      {(node.caption || trendText) && (
        <div className="mt-1 text-xs text-muted-foreground">
          {[node.caption, trendText].filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  );
}

function LiquidKeyValue({ node }: LiquidUiRendererProps<Extract<LiquidUiNode, { component: 'KeyValue' }>>) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border bg-muted/30 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{node.label}</span>
      <span className="text-right font-medium text-foreground">{node.value}</span>
    </div>
  );
}

function LiquidText({ node }: LiquidUiRendererProps<Extract<LiquidUiNode, { component: 'Text' }>>) {
  return <p className={textVariantClasses[node.variant]}>{node.text}</p>;
}

function LiquidDivider() {
  return <Separator className="my-1" />;
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
    <div className="rounded-lg border bg-card p-3">
      {node.title && <div className="mb-3 text-sm font-medium text-foreground">{node.title}</div>}
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
