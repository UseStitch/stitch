import { WrenchIcon } from 'lucide-react';
import * as React from 'react';

import { useQueryClient } from '@tanstack/react-query';

import type { ToolCallStatus } from '@stitch/shared/chat/realtime';
import { parseMcpToolName } from '@stitch/shared/mcp/types';
import type { McpServer } from '@stitch/shared/mcp/types';

import { ToolCard, getToolLabel } from './card-primitives';

type McpToolBlockProps = {
  toolName: string;
  status: ToolCallStatus;
  error?: string;
};

export function McpToolBlock({ toolName, status, error }: McpToolBlockProps) {
  const queryClient = useQueryClient();
  const parsed = parseMcpToolName(toolName);
  const label = getToolLabel(status, error);

  const serverName = React.useMemo(() => {
    if (!parsed) return null;
    const servers = queryClient.getQueryData<McpServer[]>(['mcp', 'list']);
    return servers?.find((server) => server.id === parsed.serverId)?.name ?? null;
  }, [parsed, queryClient]);

  const displayName = parsed?.toolName ?? toolName;

  return (
    <ToolCard.Root status={status}>
      <ToolCard.Header>
        <ToolCard.StatusIndicator status={status} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <ToolCard.Title>{displayName}</ToolCard.Title>
            <span className="inline-flex items-center gap-1 rounded-sm border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              <WrenchIcon className="size-2.5" />
              {serverName ?? 'MCP'}
            </span>
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
