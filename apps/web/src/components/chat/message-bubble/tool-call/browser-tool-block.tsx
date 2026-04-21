import { ChevronRightIcon, GlobeIcon } from 'lucide-react';
import * as React from 'react';

import type { ToolCallStatus } from '@stitch/shared/chat/realtime';

import { ToolCard, formatToolDisplayName } from './card-primitives';

import { cn } from '@/lib/utils';

function getBrowserArgs(args: unknown): {
  description: string | null;
  profile: string | null;
} {
  const value = args as Record<string, unknown> | null | undefined;
  if (!value) {
    return { description: null, profile: null };
  }

  return {
    description: typeof value.description === 'string' ? value.description : null,
    profile: typeof value.profile === 'string' ? value.profile : null,
  };
}

type BrowserToolBlockProps = {
  toolName: string;
  status: ToolCallStatus;
  args: unknown;
  result?: unknown;
  error?: string;
};

export function BrowserToolBlock({ toolName, status, args, result, error }: BrowserToolBlockProps) {
  const [open, setOpen] = React.useState(false);
  const browserArgs = getBrowserArgs(args);
  const profileBadge = browserArgs.profile === 'user' ? 'User profile' : null;
  const description = browserArgs.description;

  const resultOutput = (result as { output?: string } | undefined)?.output;
  const hasExpandableContent = Boolean(error || resultOutput);

  return (
    <ToolCard.Root status={status}>
      <ToolCard.Header>
        <button
          type="button"
          onClick={() => hasExpandableContent && setOpen((current) => !current)}
          aria-expanded={open}
          className={cn(
            'group flex min-w-0 flex-1 items-center justify-start gap-2 text-left text-foreground',
            !hasExpandableContent && 'cursor-default',
          )}
        >
          <ToolCard.StatusIndicator status={status} />
          <span className="min-w-0 flex-1 text-left">
            <span className="flex items-center gap-2">
              <ToolCard.Title>{formatToolDisplayName(toolName)}</ToolCard.Title>
              {profileBadge ? (
                <span className="inline-flex items-center gap-1 rounded-sm border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <GlobeIcon className="size-2.5" />
                  {profileBadge}
                </span>
              ) : null}
            </span>
            {description ? (
              <ToolCard.TitleContent truncate className="mt-1 block">
                {description}
              </ToolCard.TitleContent>
            ) : null}
          </span>
          {hasExpandableContent ? (
            <ChevronRightIcon
              className={cn(
                'size-3 shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-90',
              )}
            />
          ) : null}
        </button>
      </ToolCard.Header>

      <ToolCard.Content open={open}>
        <div className="space-y-1.5">
          {error ? (
            <>
              <div className="font-medium text-destructive">Error</div>
              <div className="font-mono text-xs break-all whitespace-pre-wrap text-muted-foreground">
                {error}
              </div>
            </>
          ) : null}
          {resultOutput ? (
            <>
              <div className="font-medium text-foreground">Output</div>
              <div className="max-h-64 overflow-auto font-mono text-xs break-all whitespace-pre-wrap text-muted-foreground">
                {resultOutput.length > 2000
                  ? `${resultOutput.slice(0, 2000)}\n\n[...truncated]`
                  : resultOutput}
              </div>
            </>
          ) : null}
        </div>
      </ToolCard.Content>
    </ToolCard.Root>
  );
}
