import { PlusIcon, ServerIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { McpServer } from '@stitch/shared/mcp/types';

import { Button } from '@/components/ui/button';
import {
  agentMcpServersQueryOptions,
  useAddMcpServerToAgent,
  useRemoveMcpServerFromAgent,
} from '@/lib/queries/agents';
import { mcpServersQueryOptions } from '@/lib/queries/mcp';

type AgentMcpServersProps = {
  agentId: string;
};

export function AgentMcpServers({ agentId }: AgentMcpServersProps) {
  const { data: linked } = useSuspenseQuery(agentMcpServersQueryOptions(agentId));
  const { data: allServers } = useSuspenseQuery(mcpServersQueryOptions);
  const addServer = useAddMcpServerToAgent();
  const removeServer = useRemoveMcpServerFromAgent();

  const linkedIds = new Set(linked.map((server) => server.id));
  const available = allServers.filter((server) => !linkedIds.has(server.id));

  const handleAdd = async (server: McpServer) => {
    try {
      await addServer.mutateAsync({ agentId, mcpServerId: server.id });
      toast.success(`${server.name} added`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add MCP server');
    }
  };

  const handleRemove = async (server: McpServer) => {
    try {
      await removeServer.mutateAsync({ agentId, mcpServerId: server.id });
      toast.success(`${server.name} removed`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove MCP server');
    }
  };

  return (
    <div className="space-y-4">
      {linked.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border/50">
          {linked.map((server) => (
            <div
              key={server.id}
              className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-2">
                <ServerIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{server.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{server.url}</p>
                </div>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => void handleRemove(server)}
                disabled={removeServer.isPending}
                aria-label={`Remove ${server.name}`}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2Icon className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {linked.length === 0 && (
        <p className="text-sm text-muted-foreground">No MCP servers linked to this agent.</p>
      )}

      {available.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Add server</p>
          <div className="overflow-hidden rounded-md border border-border/50">
            {available.map((server) => (
              <div
                key={server.id}
                className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2 last:border-b-0"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <ServerIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{server.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{server.url}</p>
                  </div>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => void handleAdd(server)}
                  disabled={addServer.isPending}
                  aria-label={`Add ${server.name}`}
                  className="shrink-0"
                >
                  <PlusIcon className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {available.length === 0 && allServers.length > 0 && linked.length === allServers.length && (
        <p className="text-xs text-muted-foreground">All configured MCP servers are linked.</p>
      )}

      {allServers.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No MCP servers configured. Add one in the MCP Servers settings.
        </p>
      )}
    </div>
  );
}
