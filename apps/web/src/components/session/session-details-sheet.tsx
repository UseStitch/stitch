import { cn } from '@/lib/utils';

type SessionDetailsSheetProps = {
  sessionTitle: string;
  providerLabel: string;
  modelLabel: string;
  contextLimit: number | null;
  messagesCount: number;
  usagePercent: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  userMessageCount: number;
  assistantMessageCount: number;
  totalCostUsd: number;
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
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <p className="text-sm font-medium text-foreground">{value}</p>
        {sublabel && <p className="text-[13px] text-muted-foreground">{sublabel}</p>}
      </div>
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
  inputTokens,
  outputTokens,
  reasoningTokens,
  cacheReadTokens,
  cacheWriteTokens,
  userMessageCount,
  assistantMessageCount,
  totalCostUsd,
  sessionCreatedAt,
  lastActivityAt,
  className,
}: SessionDetailsSheetProps) {
  return (
    <aside className={cn('h-full min-h-0 overflow-hidden bg-muted/45', className)}>
      <div className="h-full border-l border-foreground/25 bg-muted/45">
        <div className="border-b border-border/80 px-5 py-3.5">
          <p className="text-base font-medium">Context</p>
          <p className="text-sm text-muted-foreground">Session metadata and token usage.</p>
        </div>

        <div className="h-[calc(100%-74px)] overflow-y-auto px-5 pt-4 pb-6">
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
            <DetailItem label="Session" value={sessionTitle} />
            <DetailItem label="Messages" value={formatNumber(messagesCount)} />
            <DetailItem label="Provider" value={providerLabel} />
            <DetailItem label="Model" value={modelLabel} />
            <DetailItem label="Session Created" value={formatDate(sessionCreatedAt)} />
            <DetailItem label="Last Activity" value={formatDate(lastActivityAt)} />
            <DetailItem label="User Messages" value={formatNumber(userMessageCount)} />
            <DetailItem label="Assistant Messages" value={formatNumber(assistantMessageCount)} />
            <DetailItem
              label="Context Limit"
              value={contextLimit ? formatNumber(contextLimit) : '-'}
            />
            <DetailItem label="Reasoning Tokens" value={formatNumber(reasoningTokens)} />
            <DetailItem label="Input Tokens" value={formatNumber(inputTokens)} />
            <DetailItem label="Output Tokens" value={formatNumber(outputTokens)} />
            <DetailItem label="Cache Read" value={formatNumber(cacheReadTokens)} />
            <DetailItem label="Cache Write" value={formatNumber(cacheWriteTokens)} />
            <DetailRow
              label="Total Tokens"
              value={formatNumber(totalTokens)}
              sublabel={`(${usagePercent})`}
            />
            <DetailItem label="Total Cost" value={USD_FORMATTER.format(totalCostUsd)} />
          </div>
        </div>
      </div>
    </aside>
  );
}
