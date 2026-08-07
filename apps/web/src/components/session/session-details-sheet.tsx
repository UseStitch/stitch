import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from 'cnfast';

import type { ReactNode } from 'react';

type SessionDetailsSheetProps = {
  sessionId: string;
  sessionTitle: string;
  providerLabel: string;
  modelLabel: string;
  contextLimit: number | null;
  messagesCount: number;
  usagePercent: string;
  totalTokens: number;
  currentSessionTokens: number;
  childSessionsTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  userMessageCount: number;
  assistantMessageCount: number;
  totalCostUsd: number;
  currentSessionCostUsd: number;
  childSessionsCostUsd: number;
  sessionCreatedAt: number | null | undefined;
  lastActivityAt: number | null | undefined;
  className?: string;
};

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

function formatNumber(value: number) {
  return value.toLocaleString();
}

function formatDate(value: number | null | undefined) {
  if (!value) return '-';
  return DATE_TIME_FORMATTER.format(new Date(value));
}

function formatTokenRatio(tokens: number, limit: number | null) {
  if (!limit) return `${formatNumber(tokens)} tokens`;
  return `${formatNumber(tokens)} / ${formatNumber(limit)} tokens`;
}

function parsePercent(value: string) {
  const percent = Number.parseInt(value.replace('%', ''), 10);
  if (Number.isNaN(percent)) return 0;
  return Math.max(0, Math.min(100, percent));
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border-subtle pt-space-xl first:border-t-0 first:pt-space-none">
      <div className="mb-space-l">
        <Text variant="label" tone="muted">
          {title.toUpperCase()}
        </Text>
      </div>
      <div className="space-y-space-m">{children}</div>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-space-xl">
      <Text as="span" variant="body" tone="muted">
        {label}
      </Text>
      <Text as="div" variant="body-strong" align="right" tabular>
        {value}
      </Text>
    </div>
  );
}

function SecondaryDetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-space-xl pl-space-xl">
      <Text as="span" variant="body" tone="muted">
        {label}
      </Text>
      <Text as="div" variant="body" tone="muted" align="right" tabular>
        {value}
      </Text>
    </div>
  );
}

function TruncatedValue({ value }: { value: string }) {
  return (
    <Text as="div" variant="body" truncate title={value}>
      {value}
    </Text>
  );
}

export function SessionDetailsSheet({
  sessionId,
  sessionTitle,
  providerLabel,
  modelLabel,
  contextLimit,
  messagesCount,
  usagePercent,
  totalTokens,
  inputTokens,
  outputTokens,
  reasoningTokens,
  cacheReadTokens,
  cacheWriteTokens,
  userMessageCount,
  assistantMessageCount,
  totalCostUsd,
  currentSessionCostUsd,
  childSessionsCostUsd,
  sessionCreatedAt,
  lastActivityAt,
  className,
}: SessionDetailsSheetProps) {
  const hasContextUsage = totalTokens > 0;
  const usageValue = parsePercent(usagePercent);
  const showSpend = messagesCount > 0 || currentSessionCostUsd > 0 || childSessionsCostUsd > 0;
  const messageSplit =
    userMessageCount > 0 || assistantMessageCount > 0
      ? `${formatNumber(messagesCount)} total, ${formatNumber(userMessageCount)} user / ${formatNumber(assistantMessageCount)} assistant`
      : `${formatNumber(messagesCount)} total`;

  return (
    <aside className={cn('h-full min-h-0 overflow-hidden bg-background', className)}>
      <div className="h-full border-l border-border-subtle">
        <div className="border-b border-border-subtle px-space-xl py-space-xl">
          <Text variant="heading-s">Context</Text>
          <Text variant="body" tone="muted" truncate title={`${providerLabel} ${modelLabel}`}>
            {providerLabel !== '-' || modelLabel !== '-' ? `${providerLabel} · ${modelLabel}` : 'No model usage yet'}
          </Text>
        </div>
        <ScrollArea className="h-[calc(100%-73px)]">
          <div className="space-y-space-2xl px-space-xl py-space-xl">
            <section className="space-y-space-l">
              {hasContextUsage ? (
                <>
                  <Stack direction="row" align="end" justify="between" gap="xl">
                    <div>
                      <Text variant="metric">{usagePercent === '-' ? formatNumber(totalTokens) : usagePercent}</Text>
                      <Text variant="body" tone="muted">
                        {usagePercent === '-' ? 'tokens in latest context' : 'context used'}
                      </Text>
                    </div>
                    <div className="pb-space-xs text-right">
                      <Text variant="body" tone="muted" tabular>
                        {formatTokenRatio(totalTokens, contextLimit)}
                      </Text>
                    </div>
                  </Stack>
                  {contextLimit ? (
                    <progress
                      className="h-1.5 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
                      value={usageValue}
                      max={100}
                      aria-label="Context used"
                    />
                  ) : null}
                </>
              ) : (
                <div className="space-y-space-xs">
                  <Text variant="heading-s">No usage yet</Text>
                  <Text variant="body" tone="muted">
                    Send a message to see model, cost, and context usage.
                  </Text>
                </div>
              )}
            </section>

            {hasContextUsage ? (
              <Section title="Latest Context">
                {contextLimit ? <DetailRow label="Context limit" value={formatNumber(contextLimit)} /> : null}
                <DetailRow label="Input" value={formatNumber(inputTokens)} />
                <DetailRow label="Output" value={formatNumber(outputTokens)} />
                {reasoningTokens > 0 ? <DetailRow label="Reasoning" value={formatNumber(reasoningTokens)} /> : null}
                {cacheReadTokens > 0 || cacheWriteTokens > 0 ? (
                  <DetailRow
                    label="Cache"
                    value={`${formatNumber(cacheReadTokens)} read / ${formatNumber(cacheWriteTokens)} write`}
                  />
                ) : null}
              </Section>
            ) : null}

            {showSpend ? (
              <Section title="Spend">
                <DetailRow label="Total cost" value={USD_FORMATTER.format(totalCostUsd)} />
                <SecondaryDetailRow label="Current session" value={USD_FORMATTER.format(currentSessionCostUsd)} />
                <SecondaryDetailRow label="Child sessions" value={USD_FORMATTER.format(childSessionsCostUsd)} />
              </Section>
            ) : null}

            <Section title="Session">
              <DetailRow label="Title" value={<TruncatedValue value={sessionTitle} />} />
              <DetailRow label="Messages" value={messageSplit} />
              <DetailRow label="Created" value={formatDate(sessionCreatedAt)} />
              <DetailRow label="Last activity" value={formatDate(lastActivityAt)} />
              <DetailRow label="ID" value={<TruncatedValue value={sessionId} />} />
            </Section>
          </div>
        </ScrollArea>
      </div>
    </aside>
  );
}
