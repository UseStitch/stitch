import { EyeIcon, KeyIcon, LogOutIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { McpAuthStatus, McpServer } from '@stitch/shared/mcp/types';

import { McpServerLogo } from '@/components/mcp/mcp-server-logo';
import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { SettingsIconButtonTooltip } from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { StatusDot, statusDotVariants } from '@/components/ui/status-dot';
import { getErrorMessage } from '@/lib/errors';
import {
  mcpServersQueryOptions,
  useDeleteMcpServer,
  useMcpLogout,
  useRefreshMcpServers,
  useStartMcpAuth,
} from '@/lib/queries/mcp';
import type { VariantProps } from 'class-variance-authority';

const AUTH_STATUS_BADGE: Record<
  McpAuthStatus,
  { dotColor: NonNullable<VariantProps<typeof statusDotVariants>['color']>; label: string } | null
> = {
  none: null,
  connected: { dotColor: 'success', label: 'Connected' },
  awaiting_auth: { dotColor: 'warning', label: 'Awaiting authorization' },
  reauthorization_required: { dotColor: 'warning', label: 'Re-authorization required' },
  client_registration_required: { dotColor: 'warning', label: 'Client registration required' },
  error: { dotColor: 'destructive', label: 'Error' },
};

export function McpServerList({ onAdd, onPreview }: { onAdd: () => void; onPreview: (server: McpServer) => void }) {
  const { data: servers } = useSuspenseQuery(mcpServersQueryOptions);
  const deleteServer = useDeleteMcpServer();
  const refreshServers = useRefreshMcpServers();
  const startAuth = useStartMcpAuth();
  const logout = useMcpLogout();

  const handleDelete = async (server: McpServer) => {
    try {
      await deleteServer.mutateAsync(server.id);
      toast.success(`${server.name} removed`, { id: 'mcp-server-delete' });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to remove MCP server'), { id: 'mcp-server-delete' });
    }
  };

  const handleRefresh = async () => {
    try {
      await refreshServers.mutateAsync();
      toast.success('MCP servers refreshed', { id: 'mcp-server-refresh' });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to refresh MCP servers'), { id: 'mcp-server-refresh' });
    }
  };

  const handleAuth = async (server: McpServer) => {
    try {
      await startAuth.mutateAsync(server.id);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to start authorization'), { id: 'mcp-server-auth' });
    }
  };

  const handleLogout = async (server: McpServer) => {
    try {
      await logout.mutateAsync(server.id);
      toast.success(`${server.name} disconnected`, { id: 'mcp-server-logout' });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to disconnect'), { id: 'mcp-server-logout' });
    }
  };

  return (
    <Stack gap="xl">
      <Stack direction="row" align="center" justify="end" gap="m">
        <div className="h-8 flex-1" aria-hidden />
        <SettingsIconButtonTooltip label="Refresh MCP servers">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => void handleRefresh()}
            aria-label="Refresh MCP servers"
            disabled={refreshServers.isPending}>
            <span className={refreshServers.isPending ? 'animate-spin' : undefined}>
              <Icon as={RefreshCwIcon} size="m" />
            </span>
          </Button>
        </SettingsIconButtonTooltip>
        <Button size="sm" variant="outline" onClick={onAdd} aria-label="Add MCP server">
          <Icon as={PlusIcon} size="m" />
          Add custom
        </Button>
      </Stack>

      <div className="overflow-hidden rounded-lg border border-border-subtle">
        {servers.length === 0 && (
          <div className="px-space-xl py-space-xl">
            <Text tone="muted">No MCP servers configured.</Text>
          </div>
        )}

        {servers.map((server) => {
          const badge = AUTH_STATUS_BADGE[server.authStatus];
          const isOAuth = server.authStatus !== 'none';
          const isConnected = server.authStatus === 'connected';
          return (
            <div key={server.id} className="border-b border-border-subtle px-space-xl py-space-l last:border-b-0">
              <Stack direction="row" align="center" justify="between" gap="l">
                <div className="min-w-0">
                  <Stack gap="2xs">
                    <Stack direction="row" align="center" gap="m">
                      <McpServerLogo serverId={server.id} name={server.name} className="size-4" />
                      <Text variant="body-strong" truncate>
                        {server.name}
                      </Text>
                      {badge && (
                        <Stack direction="row" align="center" gap="xs">
                          <StatusDot color={badge.dotColor} size="sm" aria-hidden />
                          <Text variant="caption" tone="muted">
                            {badge.label}
                          </Text>
                        </Stack>
                      )}
                    </Stack>
                    <Text variant="caption" tone="muted" truncate>
                      {server.url}
                    </Text>
                  </Stack>
                </div>
                <ButtonGroup className="shrink-0">
                  {isOAuth &&
                    (isConnected ? (
                      <SettingsIconButtonTooltip label={`Disconnect Server`}>
                        <Button
                          size="icon-sm"
                          variant="outline"
                          className="text-foreground"
                          onClick={() => void handleLogout(server)}
                          disabled={logout.isPending}
                          aria-label={`Disconnect ${server.name}`}>
                          <Icon as={LogOutIcon} size="s" />
                        </Button>
                      </SettingsIconButtonTooltip>
                    ) : (
                      <SettingsIconButtonTooltip label={`Authenticate ${server.name}`}>
                        <Button
                          size="icon-sm"
                          variant="outline"
                          className="text-foreground"
                          onClick={() => void handleAuth(server)}
                          disabled={startAuth.isPending}
                          aria-label={`Authenticate ${server.name}`}>
                          <Icon as={KeyIcon} size="s" />
                        </Button>
                      </SettingsIconButtonTooltip>
                    ))}
                  <SettingsIconButtonTooltip label={`Preview tools`}>
                    <Button
                      size="icon-sm"
                      variant="outline"
                      className="text-foreground"
                      onClick={() => onPreview(server)}
                      aria-label={`Preview tools`}>
                      <Icon as={EyeIcon} size="s" />
                    </Button>
                  </SettingsIconButtonTooltip>
                  <SettingsIconButtonTooltip label={`Delete Server`}>
                    <Button
                      size="icon-sm"
                      variant="destructive"
                      onClick={() => void handleDelete(server)}
                      disabled={deleteServer.isPending}
                      aria-label={`Delete Server`}>
                      <Icon as={Trash2Icon} size="s" />
                    </Button>
                  </SettingsIconButtonTooltip>
                </ButtonGroup>
              </Stack>
            </div>
          );
        })}
      </div>
    </Stack>
  );
}
