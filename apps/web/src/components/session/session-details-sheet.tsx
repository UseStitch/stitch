import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type SessionDetailsSheetProps = {
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
  maximumFractionDigits: 2,
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

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground [font-variant-numeric:tabular-nums]">
        {value}
      </p>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/80 bg-background/80 p-4 shadow-sm backdrop-blur-sm sm:p-5">
      <div className="space-y-1 border-b border-border/70 pb-3">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-[13px] text-muted-foreground">{description}</p>
      </div>
      <div className="pt-3">{children}</div>
    </section>
  );
}

function SplitRow({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1',
        emphasize && 'pt-2',
      )}
    >
      <p className={cn('text-sm text-muted-foreground', emphasize && 'text-foreground')}>{label}</p>
      <p
        className={cn(
          'text-right text-sm font-medium text-foreground [font-variant-numeric:tabular-nums]',
          emphasize && 'text-base',
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function SessionDetailsSheet({
  sessionTitle,
  providerLabel,
  modelLabel,
  contextLimit,
  messagesCount,
  usagePercent,
  totalTokens,
  currentSessionTokens,
  childSessionsTokens,
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
  const totalUsageTokens = currentSessionTokens + childSessionsTokens;

  return (
    <aside
      className={cn(
        'h-full min-h-0 overflow-hidden bg-linear-to-b from-muted/60 to-muted/35',
        className,
      )}
    >
      <div className="h-full border-l border-foreground/20 bg-transparent">
        <div className="border-b border-border/80 bg-background/65 px-5 py-3.5 backdrop-blur-sm">
          <p className="text-base font-medium">Context</p>
          <p className="text-sm text-muted-foreground">Session metadata and token usage.</p>
        </div>
        <ScrollArea className="h-[calc(100%-74px)]">
          <div className="space-y-4 px-5 pt-4 pb-6 sm:space-y-5">
            <Section title="At a Glance" description="Quick summary of this conversation.">
              <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
                <div className="min-w-40 flex-1">
                  <DetailItem label="Total Spend" value={USD_FORMATTER.format(totalCostUsd)} />
                </div>
                <div className="min-w-40 flex-1">
                  <DetailItem label="Total AI Usage" value={formatNumber(totalUsageTokens)} />
                </div>
                <div className="min-w-40 flex-1">
                  <DetailItem label="Context Used" value={usagePercent} />
                </div>
              </div>
            </Section>

            <Section title="Session Overview" description="Basic details for this session.">
              <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                <DetailItem label="Session" value={sessionTitle} />
                <DetailItem label="Messages" value={formatNumber(messagesCount)} />
                <DetailItem label="Provider" value={providerLabel} />
                <DetailItem label="Model" value={modelLabel} />
                <DetailItem label="Session Created" value={formatDate(sessionCreatedAt)} />
                <DetailItem label="Last Activity" value={formatDate(lastActivityAt)} />
                <DetailItem label="User Messages" value={formatNumber(userMessageCount)} />
                <DetailItem
                  label="Assistant Messages"
                  value={formatNumber(assistantMessageCount)}
                />
              </div>
            </Section>

            <Section title="Spending (USD)" description="Where money was spent.">
              <div className="space-y-2.5">
                <SplitRow
                  label="This session"
                  value={USD_FORMATTER.format(currentSessionCostUsd)}
                />
                <SplitRow
                  label="Child sessions"
                  value={USD_FORMATTER.format(childSessionsCostUsd)}
                />
                <div className="border-t border-border/70" />
                <SplitRow label="Total" value={USD_FORMATTER.format(totalCostUsd)} emphasize />
              </div>
            </Section>

            <Section title="AI Usage (Tokens)" description="How much AI processing was used.">
              <div className="space-y-2.5">
                <SplitRow label="This session" value={formatNumber(currentSessionTokens)} />
                <SplitRow label="Child sessions" value={formatNumber(childSessionsTokens)} />
                <div className="border-t border-border/70" />
                <SplitRow label="Total" value={formatNumber(totalUsageTokens)} emphasize />
                <p className="pt-1 text-[13px] text-muted-foreground">
                  Tokens = AI processing units.
                </p>
              </div>
            </Section>

            <Section
              title="Current Message Context"
              description="Usage for the active context window right now."
            >
              <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                <DetailItem label="Context Used" value={usagePercent} />
                <DetailItem label="Tokens in Current Context" value={formatNumber(totalTokens)} />
                <DetailItem
                  label="Context Limit"
                  value={contextLimit ? formatNumber(contextLimit) : '-'}
                />
                <DetailItem label="Input Tokens" value={formatNumber(inputTokens)} />
                <DetailItem label="Output Tokens" value={formatNumber(outputTokens)} />
                <DetailItem label="Reasoning Tokens" value={formatNumber(reasoningTokens)} />
                <DetailItem label="Cache Read" value={formatNumber(cacheReadTokens)} />
                <DetailItem label="Cache Write" value={formatNumber(cacheWriteTokens)} />
              </div>
            </Section>
          </div>
        </ScrollArea>
      </div>
    </aside>
  );
}
