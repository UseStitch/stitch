import {
  ArrowDownToLineIcon,
  ExternalLinkIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { McpRegistryServer } from '@stitch/shared/mcp/types';

import { McpServerLogo } from '@/components/mcp/mcp-server-logo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Input } from '@/components/ui/input';
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

  const filteredServers = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return registryServers;
    return registryServers.filter((server) => {
      const haystack = [server.name, server.description, server.tags.join(' '), server.id]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [registryServers, search]);

  const handleRefresh = async () => {
    try {
      await refreshRegistry.mutateAsync();
      toast.success('MCP registry refreshed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to refresh MCP registry');
    }
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">MCP Marketplace</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Install curated MCP servers or add your own custom endpoint
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => void handleRefresh()}
            aria-label="Refresh MCP registry"
            disabled={refreshRegistry.isPending}
          >
            <RefreshCwIcon
              className={`size-4 ${refreshRegistry.isPending ? 'animate-spin' : ''}`}
            />
          </Button>
          <Button size="sm" variant="outline" onClick={onAddCustom}>
            <PlusIcon className="size-4" />
            Add custom
          </Button>
        </div>
      </div>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search servers"
          className="pl-7"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-border/60">
        {filteredServers.length === 0 && (
          <p className="px-4 py-5 text-sm text-muted-foreground">No servers match your search.</p>
        )}

        {filteredServers.map((server) => (
          <div
            key={server.id}
            className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/20"
          >
            <div className="flex min-w-0 items-start gap-3">
              <McpServerLogo registryId={server.id} name={server.name} className="mt-0.5 size-5" />
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium">{server.name}</p>
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">{server.description}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {server.tags.slice(0, 4).map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="border-border/40 bg-background/60 text-[11px] text-muted-foreground capitalize"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <ButtonGroup className="shrink-0">
              <Button
                size="icon-sm"
                variant="outline"
                className="text-foreground"
                onClick={() => window.open(server.docsUrl, '_blank', 'noopener,noreferrer')}
                aria-label={`Open docs for ${server.name}`}
              >
                <ExternalLinkIcon className="size-3.5" />
              </Button>
              <Button
                size="icon-sm"
                onClick={() => onInstall(server)}
                aria-label={`Install ${server.name}`}
              >
                <ArrowDownToLineIcon className="size-3.5" />
              </Button>
            </ButtonGroup>
          </div>
        ))}
      </div>
    </div>
  );
}
