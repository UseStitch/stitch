import { EyeIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { McpServer } from '@stitch/shared/mcp/types';

import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  mcpServersQueryOptions,
  useDeleteMcpServer,
  useRefreshMcpServers,
} from '@/lib/queries/mcp';
import { knownMcpToolsQueryOptions } from '@/lib/queries/tools';

export function McpServerList({
  onAdd,
  onPreview,
}: {
  onAdd: () => void;
  onPreview: (server: McpServer) => void;
}) {
  const { data: servers } = useSuspenseQuery(mcpServersQueryOptions);
  const { data: knownMcpTools } = useSuspenseQuery(knownMcpToolsQueryOptions);
  const deleteServer = useDeleteMcpServer();
  const refreshServers = useRefreshMcpServers();

  const serverIconById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const tool of knownMcpTools) {
      if (tool.serverIconPath && !map.has(tool.serverId)) {
        map.set(tool.serverId, tool.serverIconPath);
      }
    }
    return map;
  }, [knownMcpTools]);

  const handleDelete = async (server: McpServer) => {
    try {
      await deleteServer.mutateAsync(server.id);
      toast.success(`${server.name} removed`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove MCP server');
    }
  };

  const handleRefresh = async () => {
    try {
      await refreshServers.mutateAsync();
      toast.success('MCP servers refreshed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to refresh MCP servers');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">Configured MCP Servers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage servers currently connected to your workspace
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => void handleRefresh()}
            aria-label="Refresh MCP servers"
            disabled={refreshServers.isPending}
          >
            <RefreshCwIcon className={`size-4 ${refreshServers.isPending ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" variant="outline" onClick={onAdd} aria-label="Add MCP server">
            <PlusIcon className="size-4" />
            Add custom
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/60">
        {servers.length === 0 && (
          <p className="px-4 py-5 text-sm text-muted-foreground">No MCP servers configured.</p>
        )}

        {servers.map((server) => (
          <div
            key={server.id}
            className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3 last:border-b-0"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                {serverIconById.get(server.id) ? (
                  <img
                    src={serverIconById.get(server.id)}
                    alt=""
                    className="size-4 shrink-0 rounded-sm"
                    loading="lazy"
                  />
                ) : null}
                <p className="truncate text-sm font-medium">{server.name}</p>
              </div>
              <p className="truncate text-xs text-muted-foreground">{server.url}</p>
            </div>
            <ButtonGroup className="shrink-0">
              <Button
                size="icon-sm"
                variant="outline"
                className="text-foreground"
                onClick={() => onPreview(server)}
                aria-label={`Preview tools for ${server.name}`}
              >
                <EyeIcon className="size-3.5" />
              </Button>
              <Button
                size="icon-sm"
                variant="destructive"
                onClick={() => void handleDelete(server)}
                disabled={deleteServer.isPending}
                aria-label={`Delete ${server.name}`}
              >
                <Trash2Icon className="size-3.5" />
              </Button>
            </ButtonGroup>
          </div>
        ))}
      </div>
    </div>
  );
}
