import { ChevronRightIcon } from 'lucide-react';
import * as React from 'react';

import type { ToolCallStatus } from '@stitch/shared/chat/realtime';

import { ToolCard, formatToolDisplayName, getToolCardState, truncateText } from './card-primitives';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type SearchToolBlockProps = {
  toolName: string;
  status: ToolCallStatus;
  args: unknown;
  result?: unknown;
  onAbort?: () => void;
};

function getSearchArgs(args: unknown): { query: string | null; account: string | null } {
  const value = args as { query?: unknown; account?: unknown } | undefined;
  const query = typeof value?.query === 'string' && value.query.trim().length > 0 ? value.query.trim() : null;
  const account =
    typeof value?.account === 'string' && value.account.trim().length > 0 ? value.account.trim() : null;
  return { query, account };
}

function getUsedAccount(args: unknown, result: unknown): string | null {
  const { account } = getSearchArgs(args);
  if (account) return account;
  const value = (result as { usedAccount?: unknown } | undefined)?.usedAccount;
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return null;
}

export function SearchToolBlock({ toolName, status, args, result, onAbort }: SearchToolBlockProps) {
  const { isActive } = getToolCardState(status);
  const { query } = getSearchArgs(args);
  const usedAccount = getUsedAccount(args, result);
  const [open, setOpen] = React.useState(false);
  const [showFullQuery, setShowFullQuery] = React.useState(false);
  const queryPreview = query ? truncateText(query, 180) : 'Waiting for query...';
  const canExpand = Boolean(query && query.length > 180);

  return (
    <ToolCard.Root status={status}>
      <ToolCard.Header>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="group flex min-w-0 flex-1 items-center justify-start gap-2 text-left text-foreground"
        >
          <ToolCard.StatusIndicator status={status} />
          <span className="min-w-0 flex-1 text-left">
            <div className="flex items-center gap-2">
              <ToolCard.Title>{formatToolDisplayName(toolName)}</ToolCard.Title>
              {usedAccount ? (
                <span className="rounded-sm border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {usedAccount}
                </span>
              ) : null}
            </div>
            <ToolCard.TitleContent truncate className="mt-1 block">
              Search query: {queryPreview}
            </ToolCard.TitleContent>
          </span>
          <ChevronRightIcon
            className={cn('size-3 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
          />
        </button>
        <ToolCard.Actions className="self-center">
          {isActive && onAbort ? <ToolCard.StopButton onAbort={onAbort} /> : null}
        </ToolCard.Actions>
      </ToolCard.Header>

      <ToolCard.Content open={open}>
        <div className="space-y-1.5">
          <div className="font-medium text-foreground">Query</div>
          <div className="font-mono text-xs break-all whitespace-pre-wrap text-muted-foreground">
            {showFullQuery ? (query ?? queryPreview) : queryPreview}
          </div>
          {canExpand ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setShowFullQuery((current) => !current)}
              className="h-6 px-2 text-xs"
            >
              {showFullQuery ? 'Show less' : 'Show full query'}
            </Button>
          ) : null}
        </div>
      </ToolCard.Content>
    </ToolCard.Root>
  );
}
