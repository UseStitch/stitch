import { and, asc, eq, gte, lt } from 'drizzle-orm';

import {
  USAGE_SOURCES,
  type UsageDashboardResponse,
  type UsageBucketGranularity,
  type UsageDateRange,
  type UsageSource,
  type UsageTokenMetrics,
} from '@stitch/shared/usage/types';

import { getDb } from '@/db/client.js';
import { llmUsageEvents, sessions } from '@/db/schema.js';
import type { LanguageModelUsage } from 'ai';

type GetUsageDashboardInput = {
  providerId?: string;
  modelId?: string;
  range?: UsageDateRange;
  from?: number;
  to?: number;
};

type TimeWindow = {
  from: number;
  to: number;
};

type BucketRange = {
  start: number;
  end: number;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const EMPTY_TOKEN_METRICS: UsageTokenMetrics = {
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 0,
};

function cloneEmptyTokenMetrics(): UsageTokenMetrics {
  return { ...EMPTY_TOKEN_METRICS };
}

function addTokenMetrics(
  target: UsageTokenMetrics,
  usage: LanguageModelUsage | null | undefined,
): void {
  if (!usage) return;

  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const reasoningTokens = usage.outputTokenDetails?.reasoningTokens ?? 0;
  const cacheReadTokens = usage.inputTokenDetails?.cacheReadTokens ?? 0;
  const cacheWriteTokens = usage.inputTokenDetails?.cacheWriteTokens ?? 0;
  const totalTokens = usage.totalTokens ?? inputTokens + outputTokens + reasoningTokens;

  target.inputTokens += inputTokens;
  target.outputTokens += outputTokens;
  target.reasoningTokens += reasoningTokens;
  target.cacheReadTokens += cacheReadTokens;
  target.cacheWriteTokens += cacheWriteTokens;
  target.totalTokens += totalTokens;
}

function isValidTimestamp(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function startOfHour(timestamp: number): number {
  const date = new Date(timestamp);
  date.setMinutes(0, 0, 0);
  return date.getTime();
}

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function startOfWeek(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const offset = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - offset);
  return date.getTime();
}

function startOfMonth(timestamp: number): number {
  const date = new Date(timestamp);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function addHour(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(date.getHours() + 1);
  return date.getTime();
}

function addDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + 1);
  return date.getTime();
}

function addWeek(timestamp: number): number {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + 7);
  return date.getTime();
}

function addMonth(timestamp: number): number {
  const date = new Date(timestamp);
  date.setMonth(date.getMonth() + 1);
  return date.getTime();
}

function floorToGranularity(timestamp: number, granularity: UsageBucketGranularity): number {
  switch (granularity) {
    case 'hour':
      return startOfHour(timestamp);
    case 'day':
      return startOfDay(timestamp);
    case 'week':
      return startOfWeek(timestamp);
    case 'month':
      return startOfMonth(timestamp);
  }
}

function addGranularity(timestamp: number, granularity: UsageBucketGranularity): number {
  switch (granularity) {
    case 'hour':
      return addHour(timestamp);
    case 'day':
      return addDay(timestamp);
    case 'week':
      return addWeek(timestamp);
    case 'month':
      return addMonth(timestamp);
  }
}

function estimateBucketCount(window: TimeWindow, granularity: UsageBucketGranularity): number {
  const duration = Math.max(1, window.to - window.from);
  switch (granularity) {
    case 'hour':
      return Math.ceil(duration / HOUR_MS);
    case 'day':
      return Math.ceil(duration / DAY_MS);
    case 'week':
      return Math.ceil(duration / (7 * DAY_MS));
    case 'month':
      return Math.max(1, Math.ceil(duration / (30 * DAY_MS)));
  }
}

function inferGranularity(window: TimeWindow): UsageBucketGranularity {
  const candidates: UsageBucketGranularity[] = ['hour', 'day', 'week', 'month'];

  for (const granularity of candidates) {
    if (estimateBucketCount(window, granularity) <= 48) {
      return granularity;
    }
  }

  return 'month';
}

function formatBucketLabel(range: BucketRange, granularity: UsageBucketGranularity): string {
  if (granularity === 'hour') {
    return new Date(range.start).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
    });
  }

  if (granularity === 'day') {
    return new Date(range.start).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  }

  if (granularity === 'week') {
    const start = new Date(range.start).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    const end = new Date(range.end - 1).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    return `${start} - ${end}`;
  }

  return new Date(range.start).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });
}

function buildBucketRanges(window: TimeWindow, granularity: UsageBucketGranularity): BucketRange[] {
  const ranges: BucketRange[] = [];
  let currentStart = floorToGranularity(window.from, granularity);

  while (currentStart < window.to) {
    const currentEnd = addGranularity(currentStart, granularity);
    ranges.push({ start: currentStart, end: currentEnd });
    currentStart = currentEnd;
  }

  return ranges;
}

function resolveRangeStart(now: number, range: UsageDateRange): number {
  if (range === '7d') return now - 7 * DAY_MS;
  if (range === '30d') return now - 30 * DAY_MS;
  if (range === '90d') return now - 90 * DAY_MS;
  if (range === '1y') return now - 365 * DAY_MS;
  return 0;
}

async function getEarliestUsageTimestamp(): Promise<number | null> {
  const db = getDb();

  const firstEvent = await db
    .select({ createdAt: llmUsageEvents.createdAt })
    .from(llmUsageEvents)
    .orderBy(asc(llmUsageEvents.createdAt))
    .limit(1);

  const timestamps = [firstEvent[0]?.createdAt].filter(
    (value): value is number => typeof value === 'number',
  );

  if (timestamps.length === 0) return null;
  return Math.min(...timestamps);
}

async function resolveWindow(input: GetUsageDashboardInput): Promise<TimeWindow> {
  const now = Date.now();
  const range = input.range ?? '30d';
  const fromInput = isValidTimestamp(input.from) ? input.from : undefined;
  const toInput = isValidTimestamp(input.to) ? input.to : undefined;

  let from = fromInput;
  let to = toInput ?? now;

  if (from === undefined) {
    if (range === 'all') {
      const earliest = await getEarliestUsageTimestamp();
      from = earliest ?? now - 30 * DAY_MS;
    } else {
      from = resolveRangeStart(to, range);
    }
  }

  if (to <= from) {
    to = from + HOUR_MS;
  }

  return { from, to };
}

function normalizeEventSource(source: string, sessionType: 'chat' | 'automation' | null): UsageSource {
  if (source === 'title_generation') {
    return 'title_generation';
  }

  if (source.startsWith('transcription')) {
    return 'transcription';
  }

  if (sessionType === 'automation') {
    return 'automation';
  }

  return 'chat';
}

export async function getUsageDashboard(
  input: GetUsageDashboardInput,
): Promise<UsageDashboardResponse> {
  const db = getDb();
  const window = await resolveWindow(input);
  const granularity = inferGranularity(window);
  const bucketRanges = buildBucketRanges(window, granularity);

  const buckets = bucketRanges.map((range) => ({
    start: range.start,
    end: range.end,
    label: formatBucketLabel(range, granularity),
    costUsdBySource: {} as Record<string, number>,
    tokensBySource: {} as Record<string, number>,
    tokenMetricsBySource: {} as Record<string, UsageTokenMetrics>,
  }));

  const bucketIndexByStart = new Map(bucketRanges.map((range, index) => [range.start, index]));

  const totalsBySource: Record<string, { costUsd: number; tokenMetrics: UsageTokenMetrics }> = {};
  const sourceSet = new Set<string>(USAGE_SOURCES);

  const ensureSource = (source: string) => {
    if (!totalsBySource[source]) {
      totalsBySource[source] = { costUsd: 0, tokenMetrics: cloneEmptyTokenMetrics() };
    }
    sourceSet.add(source);
    return totalsBySource[source];
  };

  const eventConditions = [
    gte(llmUsageEvents.startedAt, window.from),
    lt(llmUsageEvents.startedAt, window.to),
    eq(llmUsageEvents.isAttributable, true),
    eq(llmUsageEvents.status, 'succeeded'),
  ];
  if (input.providerId) {
    eventConditions.push(eq(llmUsageEvents.providerId, input.providerId));
  }
  if (input.modelId) {
    eventConditions.push(eq(llmUsageEvents.modelId, input.modelId));
  }

  const eventRows = await db
    .select({
      createdAt: llmUsageEvents.startedAt,
      costUsd: llmUsageEvents.costUsd,
      usage: llmUsageEvents.usage,
      providerId: llmUsageEvents.providerId,
      modelId: llmUsageEvents.modelId,
      source: llmUsageEvents.source,
      sessionType: sessions.type,
    })
    .from(llmUsageEvents)
    .leftJoin(sessions, eq(llmUsageEvents.sessionId, sessions.id))
    .where(and(...eventConditions));

  const usedProviderIds = new Set<string>();
  const usedModelKeys = new Set<string>();

  const addUsageRow = (args: {
    createdAt: number;
    source: string;
    usage: LanguageModelUsage | null | undefined;
    costUsd: number | null | undefined;
  }) => {
    const sourceTotals = ensureSource(args.source);
    const costUsd = args.costUsd ?? 0;

    sourceTotals.costUsd += costUsd;
    addTokenMetrics(sourceTotals.tokenMetrics, args.usage);

    const bucketStart = floorToGranularity(args.createdAt, granularity);
    const bucketIndex = bucketIndexByStart.get(bucketStart);
    if (bucketIndex === undefined) {
      return;
    }

    const bucket = buckets[bucketIndex];
    if (!bucket) {
      return;
    }

    bucket.costUsdBySource[args.source] = (bucket.costUsdBySource[args.source] ?? 0) + costUsd;
    bucket.tokensBySource[args.source] =
      (bucket.tokensBySource[args.source] ?? 0) +
      (args.usage
        ? (args.usage.totalTokens ??
          (args.usage.inputTokens ?? 0) +
            (args.usage.outputTokens ?? 0) +
            (args.usage.outputTokenDetails?.reasoningTokens ?? 0))
        : 0);

    const bucketMetrics = bucket.tokenMetricsBySource[args.source] ?? cloneEmptyTokenMetrics();
    addTokenMetrics(bucketMetrics, args.usage);
    bucket.tokenMetricsBySource[args.source] = bucketMetrics;
  };

  for (const row of eventRows) {
    usedProviderIds.add(row.providerId);
    usedModelKeys.add(`${row.providerId}::${row.modelId}`);

    addUsageRow({
      createdAt: row.createdAt,
      source: normalizeEventSource(row.source, row.sessionType ?? null),
      usage: row.usage,
      costUsd: row.costUsd,
    });
  }

  const sourceOrder = new Map<string, number>(
    USAGE_SOURCES.map((source, index) => [source, index]),
  );
  const sources = Array.from(sourceSet).sort((a, b) => {
    const aIndex = sourceOrder.get(a) ?? Number.MAX_SAFE_INTEGER;
    const bIndex = sourceOrder.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return a.localeCompare(b);
  });

  for (const source of sources) {
    ensureSource(source);
  }

  const totals = Object.values(totalsBySource).reduce(
    (acc, entry) => {
      acc.costUsd += entry.costUsd;
      acc.tokenMetrics.inputTokens += entry.tokenMetrics.inputTokens;
      acc.tokenMetrics.outputTokens += entry.tokenMetrics.outputTokens;
      acc.tokenMetrics.reasoningTokens += entry.tokenMetrics.reasoningTokens;
      acc.tokenMetrics.cacheReadTokens += entry.tokenMetrics.cacheReadTokens;
      acc.tokenMetrics.cacheWriteTokens += entry.tokenMetrics.cacheWriteTokens;
      acc.tokenMetrics.totalTokens += entry.tokenMetrics.totalTokens;
      return acc;
    },
    { costUsd: 0, tokenMetrics: cloneEmptyTokenMetrics() },
  );

  return {
    range: {
      from: window.from,
      to: window.to,
      granularity,
      bucketCount: buckets.length,
    },
    filters: {
      providerId: input.providerId ?? null,
      modelId: input.modelId ?? null,
    },
    usedProviders: Array.from(usedProviderIds).sort((a, b) => a.localeCompare(b)),
    usedModels: Array.from(usedModelKeys)
      .map((key) => {
        const separator = key.indexOf('::');
        return {
          providerId: key.slice(0, separator),
          modelId: key.slice(separator + 2),
        };
      })
      .sort(
        (a, b) => a.providerId.localeCompare(b.providerId) || a.modelId.localeCompare(b.modelId),
      ),
    sources,
    totals: {
      costUsd: totals.costUsd,
      tokenMetrics: totals.tokenMetrics,
      bySource: totalsBySource,
    },
    buckets,
  };
}

export const usageServiceInternals = {
  inferGranularity,
  buildBucketRanges,
  floorToGranularity,
};
