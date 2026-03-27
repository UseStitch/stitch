import { ChevronRightIcon } from 'lucide-react';
import * as React from 'react';

import type { ToolCallStatus } from '@stitch/shared/chat/realtime';

import { ToolCard, getToolCardState, truncateText } from './card-primitives';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function getBashArgs(args: unknown): {
  action: string | null;
  command: string | null;
} {
  const rawAction = (args as { description?: unknown })?.description;
  const rawCommand = (args as { command?: unknown })?.command;

  const action =
    typeof rawAction === 'string' && rawAction.trim().length > 0 ? rawAction.trim() : null;
  const command =
    typeof rawCommand === 'string' && rawCommand.trim().length > 0 ? rawCommand.trim() : null;

  return { action, command };
}

type BashToolBlockProps = {
  toolName: string;
  status: ToolCallStatus;
  args: unknown;
  onAbort?: () => void;
};

export function BashToolBlock({ toolName, status, args, onAbort }: BashToolBlockProps) {
  const { isActive } = getToolCardState(status);
  const { action, command } = getBashArgs(args);
  const [open, setOpen] = React.useState(false);
  const [showFullCommand, setShowFullCommand] = React.useState(false);
  const actionLabel = action ?? 'Run a shell command';
  const commandPreview = command ? truncateText(command, 180) : 'Waiting for command...';
  const canExpandCommand = Boolean(command && command.length > 180);

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
            <ToolCard.Title>{toolName}</ToolCard.Title>
            <ToolCard.TitleContent truncate className="mt-1 block">
              {actionLabel}
            </ToolCard.TitleContent>
          </span>
          <ChevronRightIcon
            className={cn(
              'size-3 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90',
            )}
          />
        </button>
        <ToolCard.Actions className="self-center">
          {isActive && onAbort ? <ToolCard.StopButton onAbort={onAbort} /> : null}
        </ToolCard.Actions>
      </ToolCard.Header>

      <ToolCard.Content open={open}>
        <div className="space-y-1.5">
          <div className="font-medium text-foreground">Command</div>
          <div className="font-mono text-xs break-all whitespace-pre-wrap text-muted-foreground">
            {showFullCommand ? (command ?? commandPreview) : commandPreview}
          </div>
          {canExpandCommand ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setShowFullCommand((current) => !current)}
              className="h-6 px-2 text-xs"
            >
              {showFullCommand ? 'Show less' : 'Show full command'}
            </Button>
          ) : null}
        </div>
      </ToolCard.Content>
    </ToolCard.Root>
  );
}
