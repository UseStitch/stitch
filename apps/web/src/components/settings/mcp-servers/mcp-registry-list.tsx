import { ArrowDownToLineIcon, ExternalLinkIcon, PlusIcon, RefreshCwIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { McpRegistryServer } from '@stitch/shared/mcp/types';

import { McpServerLogo } from '@/components/mcp/mcp-server-logo';
import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { SettingsIconButtonTooltip } from '@/components/settings/settings-ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { SearchInput } from '@/components/ui/search-input';
import { getErrorMessage } from '@/lib/errors';
import { mcpRegistryQueryOptions, useRefreshMcpRegistry } from '@/lib/queries/mcp';

export function McpRegistryList({
  onAddCustom,
  onInstall,
}: {
  onAddCustom: () => void;
  onInstall: (server: McpRegistryServer) => void;
}) {
  const { data: registryServers } = useSuspenseQuery(mcpRegistryQueryOptions);
  const refreshRegistry = useRefreshMcpRegistry();
  const [search, setSearch] = React.useState('');

  const query = search.trim().toLowerCase();
  const filteredServers = !query
    ? registryServers
    : registryServers.filter((server) => {
        const haystack = [server.name, server.description, server.tags.join(' '), server.id].join(' ').toLowerCase();
        return haystack.includes(query);
      });

  const handleRefresh = async () => {
    try {
      await refreshRegistry.mutateAsync();
      toast.success('MCP registry refreshed', { id: 'mcp-registry-refresh' });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to refresh MCP registry'), { id: 'mcp-registry-refresh' });
    }
  };

  return (
    <Stack gap="xl">
      <Stack direction="row" align="center" gap="m">
        <SearchInput
          containerClassName="flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search servers"
        />
        <SettingsIconButtonTooltip label="Refresh MCP registry">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => void handleRefresh()}
            aria-label="Refresh MCP registry"
            disabled={refreshRegistry.isPending}>
            <span className={refreshRegistry.isPending ? 'animate-spin' : undefined}>
              <Icon as={RefreshCwIcon} size="m" />
            </span>
          </Button>
        </SettingsIconButtonTooltip>
        <Button size="sm" variant="outline" onClick={onAddCustom}>
          <Icon as={PlusIcon} size="m" />
          Add custom
        </Button>
      </Stack>

      <div className="overflow-hidden rounded-lg border border-border-subtle">
        {filteredServers.length === 0 && (
          <div className="px-space-xl py-space-xl">
            <Text tone="muted">No servers match your search.</Text>
          </div>
        )}

        {filteredServers.map((server) => (
          <div
            key={server.id}
            className="border-b border-border-subtle px-space-xl py-space-l transition-colors last:border-b-0 hover:bg-surface-sunken">
            <Stack direction="row" align="center" justify="between" gap="l">
              <div className="min-w-0">
                <Stack direction="row" align="start" gap="l">
                  <McpServerLogo registryId={server.id} name={server.name} className="mt-space-2xs size-5" />
                  <div className="min-w-0 space-y-space-2xs">
                    <Stack direction="row" align="center" gap="m" wrap>
                      <Text variant="body-strong" truncate>
                        {server.name}
                      </Text>
                      {server.tags.slice(0, 4).map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          size="sm"
                          className="border-border-subtle bg-background text-muted-foreground capitalize">
                          {tag}
                        </Badge>
                      ))}
                    </Stack>
                    <div className="line-clamp-2">
                      <Text variant="caption" tone="muted">
                        {server.description}
                      </Text>
                    </div>
                  </div>
                </Stack>
              </div>

              <ButtonGroup className="shrink-0">
                <SettingsIconButtonTooltip label={`Open docs`}>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    className="text-foreground"
                    onClick={() => window.open(server.docsUrl, '_blank', 'noopener,noreferrer')}
                    aria-label={`Open Docs`}>
                    <Icon as={ExternalLinkIcon} size="s" />
                  </Button>
                </SettingsIconButtonTooltip>
                <SettingsIconButtonTooltip label={`Install Server`}>
                  <Button size="icon-sm" onClick={() => onInstall(server)} aria-label={`Install Server`}>
                    <Icon as={ArrowDownToLineIcon} size="s" />
                  </Button>
                </SettingsIconButtonTooltip>
              </ButtonGroup>
            </Stack>
          </div>
        ))}
      </div>
    </Stack>
  );
}
