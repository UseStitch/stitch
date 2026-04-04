export const USAGE_SOURCES = ['chat', 'automation', 'title_generation', 'transcription'] as const;

export type UsageSource = (typeof USAGE_SOURCES)[number] | (string & {});

export const USAGE_DATE_RANGES = ['7d', '30d', '90d', '1y', 'all'] as const;

export type UsageDateRange = (typeof USAGE_DATE_RANGES)[number];

export type UsageBucketGranularity = 'hour' | 'day' | 'week' | 'month';

export type UsageTokenMetrics = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
};

export type UsageBucket = {
  start: number;
  end: number;
  label: string;
  costUsdBySource: Record<string, number>;
  tokensBySource: Record<string, number>;
  tokenMetricsBySource: Record<string, UsageTokenMetrics>;
};

export type UsageTotalsBySource = {
  costUsd: number;
  tokenMetrics: UsageTokenMetrics;
};

export type UsageDashboardResponse = {
  range: {
    from: number;
    to: number;
    granularity: UsageBucketGranularity;
    bucketCount: number;
  };
  filters: {
    providerId: string | null;
    modelId: string | null;
  };
  usedProviders: string[];
  usedModels: Array<{ providerId: string; modelId: string }>;
  sources: string[];
  totals: {
    costUsd: number;
    tokenMetrics: UsageTokenMetrics;
    bySource: Record<string, UsageTotalsBySource>;
  };
  buckets: UsageBucket[];
};
