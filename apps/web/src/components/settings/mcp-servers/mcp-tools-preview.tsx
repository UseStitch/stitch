import { ChevronRightIcon, WrenchIcon } from 'lucide-react';

import { useQuery } from '@tanstack/react-query';

import type { McpServer } from '@stitch/shared/mcp/types';

import ChatMarkdown from '@/components/chat/chat-markdown';
import { SettingSubPage } from '@/components/settings/settings-ui';
import { getErrorMessage } from '@/lib/errors';
import { mcpToolsQueryOptions } from '@/lib/queries/mcp';

export function McpToolsPreview({ server, onBack }: { server: McpServer; onBack: () => void }) {
  const { data: tools, isLoading, isError, error } = useQuery(mcpToolsQueryOptions(server.id));

  return (
    <SettingSubPage title={server.name} onBack={onBack} backLabel="Back to MCP servers">
      {isLoading && <p className="text-sm text-muted-foreground">Connecting to server...</p>}

      {isError && <p className="text-sm text-destructive">{getErrorMessage(error, 'Failed to load tools')}</p>}

      {tools && tools.length === 0 && <p className="text-sm text-muted-foreground">No tools exposed by this server.</p>}

      {tools && tools.length > 0 && (
        <ul className="overflow-hidden rounded-lg border border-border/60">
          {tools.map((tool) => (
            <li key={tool.name} className="border-b border-border/50 last:border-b-0">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-2.5 hover:bg-muted/20">
                  <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                  <WrenchIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium">{tool.title ?? tool.name}</span>
                  {tool.title && <span className="text-xs text-muted-foreground/60">{tool.name}</span>}
                </summary>
                {tool.description && (
                  <div className="px-9 pt-1 pb-3">
                    <ChatMarkdown text={tool.description} className="text-xs [&_.prose]:text-xs" />
                  </div>
                )}
              </details>
            </li>
          ))}
        </ul>
      )}
    </SettingSubPage>
  );
}
