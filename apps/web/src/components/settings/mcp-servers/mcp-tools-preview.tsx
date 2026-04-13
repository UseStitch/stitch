import { ArrowLeftIcon, WrenchIcon } from 'lucide-react';

import { useQuery } from '@tanstack/react-query';

import type { McpServer } from '@stitch/shared/mcp/types';

import { Button } from '@/components/ui/button';
import { mcpToolsQueryOptions } from '@/lib/queries/mcp';

export function McpToolsPreview({ server, onBack }: { server: McpServer; onBack: () => void }) {
  const { data: tools, isLoading, isError, error } = useQuery(mcpToolsQueryOptions(server.id));

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to MCP servers">
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div>
          <h2 className="text-base font-bold">{server.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Available tools</p>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Connecting to server...</p>}

      {isError && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Failed to load tools'}
        </p>
      )}

      {tools && tools.length === 0 && (
        <p className="text-sm text-muted-foreground">No tools exposed by this server.</p>
      )}

      {tools && tools.length > 0 && (
        <ul className="space-y-2">
          {tools.map((tool) => (
            <li
              key={tool.name}
              className="flex items-start gap-3 rounded-lg border border-border/60 px-3 py-2.5"
            >
              <WrenchIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{tool.name}</p>
                {tool.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{tool.description}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
