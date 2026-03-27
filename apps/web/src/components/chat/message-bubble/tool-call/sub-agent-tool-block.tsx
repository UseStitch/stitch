import { BotIcon, ExternalLinkIcon } from 'lucide-react';

import { useNavigate } from '@tanstack/react-router';

import type { ToolCallStatus } from '@stitch/shared/chat/realtime';

import { Button } from '@/components/ui/button';

import { ToolCard, getToolCardState, getToolLabel, truncateText } from './card-primitives';

function getSubAgentTask(args: unknown): string | null {
  const value = (args as { task?: unknown })?.task;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getSubAgentResult(result: unknown): {
  childSessionId: string | null;
  subAgentName: string | null;
} {
  if (!result || typeof result !== 'object') return { childSessionId: null, subAgentName: null };
  const value = result as Record<string, unknown>;
  return {
    childSessionId: typeof value.childSessionId === 'string' ? value.childSessionId : null,
    subAgentName: typeof value.subAgentName === 'string' ? value.subAgentName : null,
  };
}

type SubAgentToolBlockProps = {
  toolName: string;
  status: ToolCallStatus;
  args?: unknown;
  result?: unknown;
  error?: string;
};

export function SubAgentToolBlock({ toolName, status, args, result, error }: SubAgentToolBlockProps) {
  const navigate = useNavigate();
  const { isActive } = getToolCardState(status);
  const task = getSubAgentTask(args);
  const { childSessionId, subAgentName } = getSubAgentResult(result);
  const label = getToolLabel(status, error);

  const displayName = subAgentName ?? toolName.replace(/^subagent_/, '').replace(/_/g, ' ');
  const taskPreview = task ? truncateText(task, 120) : 'Waiting for task...';
  const canNavigate = childSessionId !== null;

  return (
    <ToolCard.Root status={status}>
      <ToolCard.Header>
        <ToolCard.StatusIndicator status={status} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <ToolCard.Title>{displayName}</ToolCard.Title>
            <span className="inline-flex items-center gap-1 rounded-sm border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              <BotIcon className="size-2.5" />
              Sub-agent
            </span>
          </div>
          <ToolCard.TitleContent truncate className="block">
            {label ?? (isActive ? taskPreview : 'Completed')}
          </ToolCard.TitleContent>
        </div>
        {canNavigate ? (
          <ToolCard.Actions className="self-center">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => {
                void navigate({ to: '/session/$id', params: { id: childSessionId } });
              }}
              className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLinkIcon className="size-3" />
              {isActive ? 'View live' : 'View session'}
            </Button>
          </ToolCard.Actions>
        ) : null}
      </ToolCard.Header>
    </ToolCard.Root>
  );
}
