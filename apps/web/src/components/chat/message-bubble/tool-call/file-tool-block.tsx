import type { ToolCallStatus } from '@stitch/shared/chat/realtime';

import { ToolCard, getToolLabel, truncateText } from './card-primitives';

function getFilePathFromArgs(args: unknown): string | null {
  const value = (args as { filePath?: unknown })?.filePath;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type FileToolBlockProps = {
  toolName: string;
  status: ToolCallStatus;
  args: unknown;
  error?: string;
};

export function FileToolBlock({ toolName, status, args, error }: FileToolBlockProps) {
  const label = getToolLabel(status, error);
  const filePath = getFilePathFromArgs(args);
  const displayPath = filePath ? truncateText(filePath) : 'Waiting for path...';

  return (
    <ToolCard.Root status={status}>
      <ToolCard.Header>
        <ToolCard.StatusIndicator status={status} />
        <div className="min-w-0 flex-1 space-y-1">
          <ToolCard.Title>{toolName}</ToolCard.Title>
          <ToolCard.TitleContent truncate mono className="block">
            {label ? `${displayPath} - ${label}` : displayPath}
          </ToolCard.TitleContent>
        </div>
        {filePath ? (
          <ToolCard.Actions className="self-center">
            <ToolCard.CopyButton value={filePath} />
          </ToolCard.Actions>
        ) : null}
      </ToolCard.Header>
    </ToolCard.Root>
  );
}
