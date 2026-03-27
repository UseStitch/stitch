import * as React from 'react';

import { keepPreviousData, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
  type TooltipItem,
} from 'chart.js';
import { BarChart3Icon } from 'lucide-react';
import { Bar } from 'react-chartjs-2';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { enabledProviderModelsQueryOptions } from '@/lib/queries/providers';
import { usageDashboardQueryOptions } from '@/lib/queries/usage';

import { USAGE_DATE_RANGES, USAGE_SOURCES, type UsageDateRange } from '@stitch/shared/usage/types';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const ALL_FILTER = 'all';

const RANGE_LABELS: Record<UsageDateRange, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '1y': 'Last 1 year',
  all: 'All time',
};

const SOURCE_LABELS: Record<string, string> = {
  chat: 'Chat',
  title_generation: 'Title Generation',
  transcription: 'Transcription',
};

const TOKEN_TYPE_KEYS = [
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
] as const;

type TokenTypeKey = (typeof TOKEN_TYPE_KEYS)[number];

const TOKEN_TYPE_LABELS: Record<TokenTypeKey, string> = {
  inputTokens: 'Input',
  outputTokens: 'Output',
  cacheReadTokens: 'Cache Read',
  cacheWriteTokens: 'Cache Write',
};

const TOKEN_TYPE_CHART_VARS = ['--chart-1', '--chart-3', '--chart-4', '--chart-2'] as const;

const FALLBACK_SOURCE_COLORS = ['#f97316', '#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#14b8a6'];
const FALLBACK_TOKEN_TYPE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#14b8a6'];

function getSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source.replaceAll('_', ' ');
}

function formatCost(costUsd: number): string {
  if (costUsd < 0.01) return `$${costUsd.toFixed(4)}`;
  return `$${costUsd.toFixed(2)}`;
}

function formatTokens(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

function encodeModelFilter(providerId: string, modelId: string): string {
  return `${providerId}::${modelId}`;
}

function decodeModelFilter(value: string): { providerId: string; modelId: string } | null {
  const separator = value.indexOf('::');
  if (separator <= 0) return null;
  return {
    providerId: value.slice(0, separator),
    modelId: value.slice(separator + 2),
  };
}

function resolveCssVar(varName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return value.length > 0 ? value : fallback;
}

function getSourceColors(count: number): string[] {
  if (typeof window === 'undefined') return FALLBACK_SOURCE_COLORS.slice(0, count);
  const vars = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'];
  const resolved = vars
    .map((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim())
    .filter((v) => v.length > 0);
  const palette = [...resolved, ...FALLBACK_SOURCE_COLORS];
  return Array.from({ length: count }, (_, i) => palette[i % palette.length] ?? '#6b7280');
}

function getTokenTypeColors(): Record<TokenTypeKey, string> {
  const keys = TOKEN_TYPE_KEYS;
  return Object.fromEntries(
    keys.map((key, i) => [
      key,
      resolveCssVar(TOKEN_TYPE_CHART_VARS[i] ?? '', FALLBACK_TOKEN_TYPE_COLORS[i] ?? '#6b7280'),
    ]),
  ) as Record<TokenTypeKey, string>;
}

function useSourceOrder(sources: string[]): string[] {
  return React.useMemo(() => {
    const order = new Map<string, number>(USAGE_SOURCES.map((source, index) => [source, index]));
    return [...sources].sort((a, b) => {
      const aOrder = order.get(a) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = order.get(b) ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.localeCompare(b);
    });
  }, [sources]);
}

function useChartTheme() {
  return React.useMemo(() => {
    const tickColor = resolveCssVar('--muted-foreground', '#71717a');
    const gridColor = resolveCssVar('--border', '#27272a');
    return { tickColor, gridColor };
  }, []);
}

export const Route = createFileRoute('/usage')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(enabledProviderModelsQueryOptions),
      context.queryClient.ensureQueryData(usageDashboardQueryOptions({ range: '30d' })),
    ]),
  component: UsageDashboardPage,
});

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

function UsageDashboardPage() {
  const { data: providerModels } = useSuspenseQuery(enabledProviderModelsQueryOptions);

  const [providerFilter, setProviderFilter] = React.useState<string>(ALL_FILTER);
  const [modelFilter, setModelFilter] = React.useState<string>(ALL_FILTER);
  const [rangeFilter, setRangeFilter] = React.useState<UsageDateRange>('30d');
  const [usageTab, setUsageTab] = React.useState<'cost' | 'tokens'>('cost');

  const { data: usageRangeData } = useQuery({
    ...usageDashboardQueryOptions({ range: rangeFilter }),
    placeholderData: keepPreviousData,
  });

  const providerById = React.useMemo(
    () => new Map(providerModels.map((provider) => [provider.providerId, provider] as const)),
    [providerModels],
  );

  const modelNameByKey = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const provider of providerModels) {
      for (const model of provider.models) {
        map.set(encodeModelFilter(provider.providerId, model.id), model.name);
      }
    }
    return map;
  }, [providerModels]);

  const availableProviders = React.useMemo(() => {
    const used = new Set(usageRangeData?.usedProviders ?? []);
    return providerModels
      .filter((provider) => used.has(provider.providerId))
      .map((provider) => ({ providerId: provider.providerId, providerName: provider.providerName }));
  }, [providerModels, usageRangeData?.usedProviders]);

  const availableModels = React.useMemo(() => {
    const usedModels = usageRangeData?.usedModels ?? [];
    return usedModels
      .filter((model) => providerFilter === ALL_FILTER || model.providerId === providerFilter)
      .map((model) => {
        const provider = providerById.get(model.providerId);
        const key = encodeModelFilter(model.providerId, model.modelId);
        return {
          providerId: model.providerId,
          providerName: provider?.providerName ?? model.providerId,
          modelId: model.modelId,
          modelName: modelNameByKey.get(key) ?? model.modelId,
        };
      });
  }, [modelNameByKey, providerById, providerFilter, usageRangeData?.usedModels]);

  React.useEffect(() => {
    if (providerFilter === ALL_FILTER) return;
    const stillAvailable = availableProviders.some((p) => p.providerId === providerFilter);
    if (!stillAvailable) {
      setProviderFilter(ALL_FILTER);
      setModelFilter(ALL_FILTER);
    }
  }, [availableProviders, providerFilter]);

  const providerLabelById = React.useMemo(
    () => new Map(availableProviders.map((p) => [p.providerId, p.providerName] as const)),
    [availableProviders],
  );

  const modelLabelByValue = React.useMemo(
    () =>
      new Map(
        availableModels.map(
          (model) =>
            [
              encodeModelFilter(model.providerId, model.modelId),
              `${model.providerName} · ${model.modelName}`,
            ] as const,
        ),
      ),
    [availableModels],
  );

  React.useEffect(() => {
    if (modelFilter === ALL_FILTER) return;
    const isStillAvailable = availableModels.some(
      (m) => encodeModelFilter(m.providerId, m.modelId) === modelFilter,
    );
    if (!isStillAvailable) setModelFilter(ALL_FILTER);
  }, [availableModels, modelFilter]);

  const usageFilters = React.useMemo(() => {
    const decodedModel = modelFilter === ALL_FILTER ? null : decodeModelFilter(modelFilter);
    const providerIdFromModel =
      providerFilter === ALL_FILTER ? decodedModel?.providerId : providerFilter;
    return {
      range: rangeFilter,
      providerId: providerIdFromModel,
      modelId: decodedModel?.modelId,
    };
  }, [modelFilter, providerFilter, rangeFilter]);

  const { data: usageData, isFetching } = useQuery({
    ...usageDashboardQueryOptions(usageFilters),
    placeholderData: keepPreviousData,
  });

  const sources = useSourceOrder(usageData?.sources ?? []);
  const sourceColors = React.useMemo(() => getSourceColors(sources.length), [sources.length]);
  const tokenTypeColors = React.useMemo(() => getTokenTypeColors(), []);
  const { tickColor, gridColor } = useChartTheme();

  const selectedProviderLabel =
    providerFilter === ALL_FILTER
      ? 'All providers'
      : (providerLabelById.get(providerFilter) ?? 'Provider');
  const selectedModelLabel =
    modelFilter === ALL_FILTER ? 'All models' : (modelLabelByValue.get(modelFilter) ?? 'Model');
  const selectedRangeLabel = RANGE_LABELS[rangeFilter];
  const granularityLabel = usageData?.range.granularity ?? 'day';

  const costChartData = React.useMemo(
    () => ({
      labels: usageData?.buckets.map((b) => b.label) ?? [],
      datasets: sources.map((source, i) => ({
        label: getSourceLabel(source),
        data: usageData?.buckets.map((b) => b.costUsdBySource[source] ?? 0) ?? [],
        backgroundColor:
          sourceColors[i] ?? FALLBACK_SOURCE_COLORS[i % FALLBACK_SOURCE_COLORS.length],
        borderRadius: 5,
        borderSkipped: false,
      })),
    }),
    [sourceColors, sources, usageData],
  );

  const tokenTypeChartsBySource = React.useMemo(() => {
    const labels = usageData?.buckets.map((b) => b.label) ?? [];
    return Object.fromEntries(
      sources.map((source) => {
        const datasets = TOKEN_TYPE_KEYS.map((key) => ({
          label: TOKEN_TYPE_LABELS[key],
          data:
            usageData?.buckets.map((b) => b.tokenMetricsBySource[source]?.[key] ?? 0) ?? [],
          backgroundColor: tokenTypeColors[key],
          borderRadius: 5,
          borderSkipped: false,
        }));
        return [source, { labels, datasets }];
      }),
    );
  }, [sources, tokenTypeColors, usageData]);

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

  const costChartOptions = React.useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: baseLegend,
        tooltip: {
          callbacks: {
            label: (ctx: TooltipItem<'bar'>) =>
              `${ctx.dataset.label}: ${formatCost(Number(ctx.raw ?? 0))}`,
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

  const tokenTypeChartOptions = React.useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: TooltipItem<'bar'>) =>
              `${ctx.dataset.label}: ${formatTokens(Number(ctx.raw ?? 0))} tokens`,
          },
        },
      },
      scales: {
        ...baseScales,
        y: {
          ...baseScales.y,
          ticks: {
            ...baseScales.y.ticks,
            callback: (value: string | number) => formatTokens(Number(value)),
          },
        },
      },
    }),
    [baseScales],
  );

  const hasData = !!usageData && usageData.buckets.length > 0;

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-6 pb-10">
      {/* Page header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
        <p className="text-sm text-muted-foreground">
          Cost and token analytics across providers, models, and sources.
        </p>
      </div>

      {/* Filter toolbar */}
      <div className="rounded-xl bg-muted/40 p-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Select
            value={providerFilter}
            onValueChange={(value) => setProviderFilter(value ?? ALL_FILTER)}
          >
            <SelectTrigger className="w-full bg-background">
              <SelectValue placeholder="Filter by provider">{selectedProviderLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>All providers</SelectItem>
              {availableProviders.map((provider) => (
                <SelectItem key={provider.providerId} value={provider.providerId}>
                  {provider.providerName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={modelFilter}
            onValueChange={(value) => setModelFilter(value ?? ALL_FILTER)}
          >
            <SelectTrigger className="w-full bg-background">
              <SelectValue placeholder="Filter by model">{selectedModelLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>All models</SelectItem>
              {availableModels.map((model) => (
                <SelectItem
                  key={`${model.providerId}:${model.modelId}`}
                  value={encodeModelFilter(model.providerId, model.modelId)}
                >
                  {model.providerName} · {model.modelName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Select
              value={rangeFilter}
              onValueChange={(value) => setRangeFilter((value ?? '30d'))}
            >
              <SelectTrigger className="w-full bg-background">
                <SelectValue placeholder="Select date range">{selectedRangeLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {USAGE_DATE_RANGES.map((range) => (
                  <SelectItem key={range} value={range}>
                    {RANGE_LABELS[range]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isFetching ? (
              <div className="size-4 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
            ) : null}
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader>
            <CardDescription>Total Cost</CardDescription>
            <CardTitle className="text-3xl font-bold tabular-nums">
              {formatCost(usageData?.totals.costUsd ?? 0)}
            </CardTitle>
            <p className="text-xs text-muted-foreground capitalize">
              {selectedRangeLabel} · {granularityLabel} buckets
            </p>
          </CardHeader>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardDescription>Total Tokens</CardDescription>
            <CardTitle className="text-3xl font-bold tabular-nums">
              {formatTokens(usageData?.totals.tokenMetrics.totalTokens ?? 0)}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {formatTokens(usageData?.totals.tokenMetrics.inputTokens ?? 0)} in ·{' '}
              {formatTokens(usageData?.totals.tokenMetrics.outputTokens ?? 0)} out
            </p>
          </CardHeader>
        </Card>
      </div>

      {/* Charts */}
      <Tabs
        value={usageTab}
        onValueChange={(value) => setUsageTab((value as 'cost' | 'tokens') ?? 'cost')}
      >
        <TabsList>
          <TabsTrigger value="cost">Cost</TabsTrigger>
          <TabsTrigger value="tokens">Tokens</TabsTrigger>
        </TabsList>

        <TabsContent value="cost" className="pt-4">
          <div className="rounded-xl bg-muted/20 p-4">
            <div className="mb-4">
              <p className="text-sm font-medium">Cost over time</p>
              <p className="text-xs text-muted-foreground">Stacked by source</p>
            </div>
            <div className="h-64 md:h-96">
              {hasData ? (
                <Bar data={costChartData} options={costChartOptions} />
              ) : (
                <EmptyChart message="No usage data for the selected filters." />
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="tokens" className="pt-4">
          {hasData ? (
            <div className="space-y-4">
              {/* Token type legend */}
              <div className="flex flex-wrap items-center gap-4">
                {TOKEN_TYPE_KEYS.map((key) => (
                  <span key={key} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className="inline-block size-2.5 rounded-sm"
                      style={{ backgroundColor: tokenTypeColors[key] }}
                    />
                    {TOKEN_TYPE_LABELS[key]}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {sources.map((source) => {
                  const sourceTotals = usageData?.totals.bySource[source]?.tokenMetrics;
                  const chartData = tokenTypeChartsBySource[source];

                  return (
                    <div key={source} className="rounded-xl bg-muted/20 p-4">
                      <div className="mb-4">
                        <p className="text-sm font-medium">{getSourceLabel(source)}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatTokens(sourceTotals?.totalTokens ?? 0)} total tokens
                        </p>
                      </div>
                      <div className="h-56">
                        {chartData ? (
                          <Bar data={chartData} options={tokenTypeChartOptions} />
                        ) : (
                          <EmptyChart message="No token data for this source." />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-muted/20 p-4">
              <div className="h-72">
                <EmptyChart message="No token data for the selected filters." />
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
