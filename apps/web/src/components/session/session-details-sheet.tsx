import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
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
    <section className="border-t border-border/70 pt-4 first:border-t-0 first:pt-0">
      <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <p className="shrink-0 text-muted-foreground">{label}</p>
      <div className="min-w-0 text-right font-medium text-foreground [font-variant-numeric:tabular-nums]">
        {value}
      </div>
    </div>
  );
}

function SecondaryDetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 pl-4 text-sm">
      <p className="shrink-0 text-muted-foreground">{label}</p>
      <div className="min-w-0 text-right text-muted-foreground [font-variant-numeric:tabular-nums]">
        {value}
      </div>
    </div>
  );
}

function TruncatedValue({ value }: { value: string }) {
  return (
    <span className="block truncate" title={value}>
      {value}
    </span>
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
  const showSpend = hasContextUsage || currentSessionCostUsd > 0 || childSessionsCostUsd > 0;
  const messageSplit =
    userMessageCount > 0 || assistantMessageCount > 0
      ? `${formatNumber(messagesCount)} total, ${formatNumber(userMessageCount)} user / ${formatNumber(assistantMessageCount)} assistant`
      : `${formatNumber(messagesCount)} total`;

  return (
    <aside className={cn('h-full min-h-0 overflow-hidden bg-background', className)}>
      <div className="h-full border-l border-border/80">
        <div className="border-b border-border/70 px-5 py-4">
          <p className="text-base font-medium">Context</p>
          <p
            className="truncate text-sm text-muted-foreground"
            title={`${providerLabel} ${modelLabel}`}
          >
            {providerLabel !== '-' || modelLabel !== '-'
              ? `${providerLabel} · ${modelLabel}`
              : 'No model usage yet'}
          </p>
        </div>
        <ScrollArea className="h-[calc(100%-73px)]">
          <div className="space-y-6 px-5 py-5">
            <section className="space-y-3">
              {hasContextUsage ? (
                <>
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-3xl font-semibold tracking-tight text-foreground">
                        {usagePercent === '-' ? formatNumber(totalTokens) : usagePercent}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {usagePercent === '-' ? 'tokens in latest context' : 'context used'}
                      </p>
                    </div>
                    <p className="pb-1 text-right text-sm text-muted-foreground [font-variant-numeric:tabular-nums]">
                      {formatTokenRatio(totalTokens, contextLimit)}
                    </p>
                  </div>
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
                <div className="space-y-1">
                  <p className="text-lg font-medium text-foreground">No usage yet</p>
                  <p className="text-sm text-muted-foreground">
                    Send a message to see model, cost, and context usage.
                  </p>
                </div>
              )}
            </section>

            {hasContextUsage ? (
              <Section title="Latest Context">
                {contextLimit ? (
                  <DetailRow label="Context limit" value={formatNumber(contextLimit)} />
                ) : null}
                <DetailRow label="Input" value={formatNumber(inputTokens)} />
                <DetailRow label="Output" value={formatNumber(outputTokens)} />
                {reasoningTokens > 0 ? (
                  <DetailRow label="Reasoning" value={formatNumber(reasoningTokens)} />
                ) : null}
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
                <SecondaryDetailRow
                  label="Current session"
                  value={USD_FORMATTER.format(currentSessionCostUsd)}
                />
                <SecondaryDetailRow
                  label="Child sessions"
                  value={USD_FORMATTER.format(childSessionsCostUsd)}
                />
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
