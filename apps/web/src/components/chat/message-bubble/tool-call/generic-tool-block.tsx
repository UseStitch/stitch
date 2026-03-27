import type { ToolCallStatus } from '@stitch/shared/chat/realtime';

import { ToolCard, getToolLabel } from './card-primitives';

type GenericToolBlockProps = {
  toolName: string;
  status: ToolCallStatus;
  error?: string;
};

export function GenericToolBlock({ toolName, status, error }: GenericToolBlockProps) {
  const label = getToolLabel(status, error);

  return (
    <ToolCard.Root status={status}>
      <ToolCard.Header>
        <ToolCard.StatusIndicator status={status} />
        <div className="min-w-0 flex-1 space-y-1">
          <ToolCard.Title>{toolName}</ToolCard.Title>
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
