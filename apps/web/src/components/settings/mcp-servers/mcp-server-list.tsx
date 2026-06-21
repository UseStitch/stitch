import { EyeIcon, KeyIcon, LogOutIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { McpAuthStatus, McpServer } from '@stitch/shared/mcp/types';

import { McpServerLogo } from '@/components/mcp/mcp-server-logo';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  mcpServersQueryOptions,
  useDeleteMcpServer,
  useMcpLogout,
  useRefreshMcpServers,
  useStartMcpAuth,
} from '@/lib/queries/mcp';

const AUTH_STATUS_BADGE: Record<McpAuthStatus, { dotClass: string; label: string } | null> = {
  none: null,
  connected: { dotClass: 'bg-success', label: 'Connected' },
  awaiting_auth: { dotClass: 'bg-warning', label: 'Awaiting authorization' },
  reauthorization_required: { dotClass: 'bg-warning', label: 'Re-authorization required' },
  client_registration_required: { dotClass: 'bg-warning', label: 'Client registration required' },
  error: { dotClass: 'bg-destructive', label: 'Error' },
};

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
  const startAuth = useStartMcpAuth();
  const logout = useMcpLogout();

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

  const handleAuth = async (server: McpServer) => {
    try {
      await startAuth.mutateAsync(server.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start authorization');
    }
  };

  const handleLogout = async (server: McpServer) => {
    try {
      await logout.mutateAsync(server.id);
      toast.success(`${server.name} disconnected`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to disconnect');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end gap-2">
        <div className="h-8 flex-1" aria-hidden />
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

        {servers.map((server) => {
          const badge = AUTH_STATUS_BADGE[server.authStatus];
          const isOAuth = server.authStatus !== 'none';
          const isConnected = server.authStatus === 'connected';
          return (
            <div
              key={server.id}
              className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3 last:border-b-0"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <McpServerLogo serverId={server.id} name={server.name} className="size-4" />
                  <p className="truncate text-sm font-medium">{server.name}</p>
                  {badge && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span className={`size-1.5 rounded-full ${badge.dotClass}`} aria-hidden />
                      {badge.label}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">{server.url}</p>
              </div>
              <ButtonGroup className="shrink-0">
                {isOAuth &&
                  (isConnected ? (
                    <Button
                      size="icon-sm"
                      variant="outline"
                      className="text-foreground"
                      onClick={() => void handleLogout(server)}
                      disabled={logout.isPending}
                      aria-label={`Disconnect ${server.name}`}
                    >
                      <LogOutIcon className="size-3.5" />
                    </Button>
                  ) : (
                    <Button
                      size="icon-sm"
                      variant="outline"
                      className="text-foreground"
                      onClick={() => void handleAuth(server)}
                      disabled={startAuth.isPending}
                      aria-label={`Authenticate ${server.name}`}
                    >
                      <KeyIcon className="size-3.5" />
                    </Button>
                  ))}
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
          );
        })}
      </div>
    </div>
  );
}
