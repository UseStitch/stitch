import { ChevronRightIcon } from 'lucide-react';
import * as React from 'react';

import type { ToolCallStatus } from '@stitch/shared/chat/realtime';

import {
  ToolCard,
  getToolCardState,
  truncateText,
  useStitchToolDisplayName,
} from './card-primitives';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const MAX_OUTPUT_PREVIEW = 400;

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

function getBashResult(result: unknown): { exitCode: number | null; output: string | null } {
  if (!result || typeof result !== 'object') return { exitCode: null, output: null };
  const r = result as { metadata?: { exit?: unknown }; output?: unknown };
  const exitCode = typeof r.metadata?.exit === 'number' ? r.metadata.exit : null;
  const output =
    typeof r.output === 'string' && r.output.trim().length > 0 ? r.output.trim() : null;
  return { exitCode, output };
}

type BashToolBlockProps = {
  toolName: string;
  status: ToolCallStatus;
  args: unknown;
  result?: unknown;
  onAbort?: () => void;
};

export function BashToolBlock({ toolName, status, args, result, onAbort }: BashToolBlockProps) {
  const { isActive, hasError } = getToolCardState(status);
  const { action, command } = getBashArgs(args);
  const { exitCode, output } = getBashResult(result);
  const displayName = useStitchToolDisplayName(toolName);
  const [open, setOpen] = React.useState(false);
  const [showFullCommand, setShowFullCommand] = React.useState(false);
  const actionLabel = action ?? 'Run a shell command';
  const commandPreview = command ? truncateText(command, 180) : 'Waiting for command...';
  const canExpandCommand = Boolean(command && command.length > 180);

  const outputPreview = output ? truncateText(output, MAX_OUTPUT_PREVIEW) : null;
  const canExpandOutput = Boolean(output && output.length > MAX_OUTPUT_PREVIEW);
  const [showFullOutput, setShowFullOutput] = React.useState(false);

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
            <ToolCard.Title>{displayName}</ToolCard.Title>
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
        <div className="space-y-3">
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

          {hasError && exitCode !== null ? (
            <div className="space-y-1.5">
              <div className="font-medium text-destructive">Exit code: {exitCode}</div>
              {outputPreview ? (
                <>
                  <div className="font-mono text-xs break-all whitespace-pre-wrap text-muted-foreground">
                    {showFullOutput ? output : outputPreview}
                  </div>
                  {canExpandOutput ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => setShowFullOutput((current) => !current)}
                      className="h-6 px-2 text-xs"
                    >
                      {showFullOutput ? 'Show less' : 'Show full output'}
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </ToolCard.Content>
    </ToolCard.Root>
  );
}
