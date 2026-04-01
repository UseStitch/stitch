import type { ToolCallStatus } from '@stitch/shared/chat/realtime';

import { ToolCard, formatToolDisplayName, getToolLabel } from './card-primitives';

type GenericToolBlockProps = {
  toolName: string;
  status: ToolCallStatus;
  args?: unknown;
  result?: unknown;
  error?: string;
};

function getUsedAccount(args: unknown, result: unknown): string | null {
  const inputAccount = (args as { account?: unknown } | undefined)?.account;
  if (typeof inputAccount === 'string' && inputAccount.trim().length > 0) {
    return inputAccount.trim();
  }

  const outputAccount = (result as { usedAccount?: unknown } | undefined)?.usedAccount;
  if (typeof outputAccount === 'string' && outputAccount.trim().length > 0) {
    return outputAccount.trim();
  }

  return null;
}

export function GenericToolBlock({ toolName, status, args, result, error }: GenericToolBlockProps) {
  const label = getToolLabel(status, error);
  const usedAccount = getUsedAccount(args, result);

  return (
    <ToolCard.Root status={status}>
      <ToolCard.Header>
        <ToolCard.StatusIndicator status={status} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <ToolCard.Title>{formatToolDisplayName(toolName)}</ToolCard.Title>
            {usedAccount ? (
              <span className="rounded-sm border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {usedAccount}
              </span>
            ) : null}
          </div>
          {label ? (
            <ToolCard.TitleContent truncate className="block">
              {label}
            </ToolCard.TitleContent>
          ) : null}
        </div>
      </ToolCard.Header>
    </ToolCard.Root>
  );
}
