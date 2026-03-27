import type { ToolCallStatus } from '@stitch/shared/chat/realtime';

import { ToolCard, getToolCardState, getToolLabel, truncateText } from './card-primitives';

function getWebfetchUrl(args: unknown): string | null {
  const value = (args as { url?: unknown })?.url;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type WebfetchToolBlockProps = {
  toolName: string;
  status: ToolCallStatus;
  args: unknown;
  error?: string;
  onAbort?: () => void;
};

export function WebfetchToolBlock({
  toolName,
  status,
  args,
  error,
  onAbort,
}: WebfetchToolBlockProps) {
  const { isActive } = getToolCardState(status);
  const label = getToolLabel(status, error);
  const url = getWebfetchUrl(args);
  const displayUrl = url ? truncateText(url) : 'Waiting for URL...';

  return (
    <ToolCard.Root status={status}>
      <ToolCard.Header>
        <ToolCard.StatusIndicator status={status} />
        <div className="min-w-0 flex-1 space-y-1">
          <ToolCard.Title>{toolName}</ToolCard.Title>
          <ToolCard.TitleContent truncate mono className="block">
            {label ? `${displayUrl} - ${label}` : displayUrl}
          </ToolCard.TitleContent>
        </div>
        {isActive && onAbort ? (
          <ToolCard.Actions className="self-center">
            <ToolCard.StopButton onAbort={onAbort} />
          </ToolCard.Actions>
        ) : null}
      </ToolCard.Header>
    </ToolCard.Root>
  );
}
