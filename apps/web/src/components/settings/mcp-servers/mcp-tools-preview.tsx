import { ChevronRightIcon, WrenchIcon } from 'lucide-react';

import { useQuery } from '@tanstack/react-query';

import type { McpServer } from '@stitch/shared/mcp/types';

import ChatMarkdown from '@/components/chat/chat-markdown';
import { Icon } from '@/components/primitives/icon';
import { Text } from '@/components/primitives/text';
import { SettingSubPage } from '@/components/settings/settings-ui';
import { getErrorMessage } from '@/lib/errors';
import { mcpToolsQueryOptions } from '@/lib/queries/mcp';

export function McpToolsPreview({ server, onBack }: { server: McpServer; onBack: () => void }) {
  const {
    data: tools,
    isLoading,
    isError,
    error,
  } = useQuery({
    ...mcpToolsQueryOptions(server.id),
    select: (data) => data.map((tool) => ({ name: tool.name, title: tool.title, description: tool.description })),
  });

  return (
    <SettingSubPage title={server.name} onBack={onBack} backLabel="Back to MCP servers">
      {isLoading && <Text tone="muted">Connecting to server...</Text>}

      {isError && <Text tone="destructive">{getErrorMessage(error, 'Failed to load tools')}</Text>}

      {tools && tools.length === 0 && <Text tone="muted">No tools exposed by this server.</Text>}

      {tools && tools.length > 0 && (
        <ul className="overflow-hidden rounded-lg border border-border-subtle">
          {tools.map((tool) => (
            <li key={tool.name} className="border-b border-border-subtle last:border-b-0">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-space-m px-space-l py-space-m hover:bg-surface-sunken">
                  <span className="inline-flex transition-transform group-open:rotate-90">
                    <Text as="span" tone="muted">
                      <Icon as={ChevronRightIcon} size="s" />
                    </Text>
                  </span>
                  <Text as="div" tone="muted">
                    <Icon as={WrenchIcon} size="s" />
                  </Text>
                  <Text as="span" variant="body-strong">
                    {tool.title ?? tool.name}
                  </Text>
                  {tool.title && (
                    <Text variant="caption" tone="faint">
                      {tool.name}
                    </Text>
                  )}
                </summary>
                {tool.description && (
                  <div className="px-space-3xl pt-space-xs pb-space-l">
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
