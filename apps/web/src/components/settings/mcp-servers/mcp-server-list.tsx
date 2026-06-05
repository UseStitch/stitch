import { EyeIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { McpServer } from '@stitch/shared/mcp/types';

import { McpServerLogo } from '@/components/mcp/mcp-server-logo';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  mcpServersQueryOptions,
  useDeleteMcpServer,
  useRefreshMcpServers,
} from '@/lib/queries/mcp';

export function McpServerList({
  onAdd,
  onPreview,
}: {
  onAdd: () => void;
  onPreview: (server: McpServer) => void;
}) {
  const { data: servers } = useSuspenseQuery(mcpServersQueryOptions);
  const deleteServer = useDeleteMcpServer();
  const refreshServers = useRefreshMcpServers();

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
    <div className="flex flex-col gap-3">
      <div className="flex justify-end gap-1">
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
                <McpServerLogo serverId={server.id} name={server.name} className="size-4" />
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
