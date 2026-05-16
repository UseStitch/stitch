import {
  ChevronRightIcon,
  PackageIcon,
  PackagePlusIcon,
  PackageMinusIcon,
  PackageSearchIcon,
} from 'lucide-react';
import * as React from 'react';

import { useQuery } from '@tanstack/react-query';

import type { ToolCallStatus } from '@stitch/shared/chat/realtime';
import type { ConnectorIconSource } from '@stitch/shared/connectors/types';

import { ToolCard, getToolCardState, getToolLabel } from './card-primitives';

import { ConnectorIcon } from '@/components/connectors/connector-icon';
import { knownToolsetsQueryOptions } from '@/lib/queries/tools';
import { cn } from '@/lib/utils';

const TOOLSET_TOOL_CONFIG: Record<
  string,
  { label: string; icon: typeof PackageIcon; verb: string }
> = {
  list_toolsets: { label: 'List Toolsets', icon: PackageSearchIcon, verb: 'Inspecting' },
  activate_toolset: { label: 'Activate Toolset', icon: PackagePlusIcon, verb: 'Activating' },
  deactivate_toolset: { label: 'Deactivate Toolset', icon: PackageMinusIcon, verb: 'Deactivating' },
};

type ToolsetCatalogItem = {
  id?: string;
  name: string;
  description: string;
};

type ToolsetTool = {
  name: string;
  displayName?: string;
  description: string;
};

type ToolsetDetail = {
  toolsetId?: string;
  name: string;
  description: string;
  tools: ToolsetTool[];
};

function getToolsetId(args: unknown): string | null {
  const value = (args as { toolsetId?: unknown })?.toolsetId;
  return typeof value === 'string' ? value : null;
}

function getResultMessage(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const value = (result as Record<string, unknown>).message;
  return typeof value === 'string' ? value : null;
}

function getResultToolsetName(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const value = (result as Record<string, unknown>).toolsetName;
  return typeof value === 'string' ? value : null;
}

function getResultIcon(result: unknown): ConnectorIconSource | null {
  if (!result || typeof result !== 'object') return null;
  const value = (result as Record<string, unknown>).icon;
  if (!value || typeof value !== 'object') return null;
  const typed = value as { type?: unknown; slug?: unknown; svgString?: unknown };
  if (typed.type === 'simpleIcons' && typeof typed.slug === 'string') {
    return { type: 'simpleIcons', slug: typed.slug };
  }
  if (typed.type === 'svgString' && typeof typed.svgString === 'string') {
    return { type: 'svgString', svgString: typed.svgString };
  }
  return null;
}

function getToolsetCatalog(result: unknown): ToolsetCatalogItem[] | null {
  if (!result || typeof result !== 'object') return null;
  const value = (result as { toolsets?: unknown }).toolsets;
  if (!Array.isArray(value)) return null;

  const items: ToolsetCatalogItem[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;

    const typed = item as Record<string, unknown>;
    const id = typeof typed.id === 'string' ? typed.id : undefined;
    const name = typeof typed.name === 'string' ? typed.name : null;
    const description = typeof typed.description === 'string' ? typed.description : null;

    if (!name || !description) continue;

    items.push({
      id,
      name,
      description,
    });
  }

  return items;
}

function getToolsetDetail(result: unknown): ToolsetDetail | null {
  if (!result || typeof result !== 'object') return null;

  const typed = result as Record<string, unknown>;
  const toolsetId = typeof typed.toolsetId === 'string' ? typed.toolsetId : undefined;
  const name = typeof typed.name === 'string' ? typed.name : null;
  const description = typeof typed.description === 'string' ? typed.description : null;
  const toolsValue = typed.tools;

  if (!name || !description || !Array.isArray(toolsValue)) return null;

  const tools: ToolsetTool[] = [];

  for (const tool of toolsValue) {
    if (!tool || typeof tool !== 'object') continue;
    const toolRecord = tool as Record<string, unknown>;
    const toolName = typeof toolRecord.name === 'string' ? toolRecord.name : null;
    const toolDescription =
      typeof toolRecord.description === 'string' ? toolRecord.description : null;

    if (!toolName || !toolDescription) continue;

    tools.push({
      name: toolName,
      displayName: typeof toolRecord.displayName === 'string' ? toolRecord.displayName : undefined,
      description: toolDescription,
    });
  }

  return {
    toolsetId,
    name,
    description,
    tools,
  };
}

type ToolsetToolBlockProps = {
  toolName: string;
  status: ToolCallStatus;
  args?: unknown;
  result?: unknown;
  error?: string;
};

export function ToolsetToolBlock({ toolName, status, args, result, error }: ToolsetToolBlockProps) {
  const { data: knownToolsets } = useQuery(knownToolsetsQueryOptions);
  const { isActive } = getToolCardState(status);
  const config = TOOLSET_TOOL_CONFIG[toolName] ?? {
    label: 'Toolset',
    icon: PackageIcon,
    verb: 'Managing',
  };
  const Icon = config.icon;
  const toolsetId = getToolsetId(args);
  const knownToolset = toolsetId
    ? knownToolsets?.find((toolset) => toolset.id === toolsetId)
    : undefined;
  const toolsetDisplayName = getResultToolsetName(result) ?? knownToolset?.name ?? toolsetId;
  const resultMessage = getResultMessage(result);
  const resultIcon = getResultIcon(result);
  const catalog = toolName === 'list_toolsets' ? getToolsetCatalog(result) : null;
  const detail = toolName === 'list_toolsets' ? getToolsetDetail(result) : null;
  const label = getToolLabel(status, error);
  const hasExpandedResults = toolName === 'list_toolsets' && (catalog?.length || detail);
  const [open, setOpen] = React.useState(false);

  const description = isActive
    ? toolsetId
      ? `${config.verb} "${toolsetDisplayName}"...`
      : `${config.verb}...`
    : detail
      ? `${detail.tools.length} tool${detail.tools.length === 1 ? '' : 's'} fetched`
      : catalog
        ? `${catalog.length} toolset${catalog.length === 1 ? '' : 's'} available`
        : (resultMessage ?? label ?? 'Done');

  return (
    <ToolCard.Root status={status}>
      <ToolCard.Header>
        {hasExpandedResults ? (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            className="group flex min-w-0 flex-1 items-center gap-2 text-left text-foreground"
          >
            <ToolCard.StatusIndicator status={status} />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <ToolCard.Title>{config.label}</ToolCard.Title>
                {toolsetDisplayName ? (
                  <span className="inline-flex items-center gap-1 rounded-sm border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    <span className="inline-flex items-center gap-1" title={toolsetId ?? undefined}>
                      {resultIcon ? (
                        <ConnectorIcon icon={resultIcon} className="size-2.5" />
                      ) : (
                        <Icon className="size-2.5" />
                      )}
                      {toolsetDisplayName}
                    </span>
                  </span>
                ) : null}
              </div>
              <ToolCard.TitleContent truncate className="block">
                {description}
              </ToolCard.TitleContent>
            </div>
            <ChevronRightIcon
              className={cn(
                'size-3 shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-90',
              )}
            />
          </button>
        ) : (
          <>
            <ToolCard.StatusIndicator status={status} />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <ToolCard.Title>{config.label}</ToolCard.Title>
                {toolsetDisplayName ? (
                  <span className="inline-flex items-center gap-1 rounded-sm border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    <span className="inline-flex items-center gap-1" title={toolsetId ?? undefined}>
                      {resultIcon ? (
                        <ConnectorIcon icon={resultIcon} className="size-2.5" />
                      ) : (
                        <Icon className="size-2.5" />
                      )}
                      {toolsetDisplayName}
                    </span>
                  </span>
                ) : null}
              </div>
              <ToolCard.TitleContent truncate className="block">
                {description}
              </ToolCard.TitleContent>
            </div>
          </>
        )}
      </ToolCard.Header>

      <ToolCard.Content open={open && Boolean(hasExpandedResults)}>
        {detail ? (
          <div className="space-y-3">
            <div className="rounded-md border border-border/50 bg-muted/20 p-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">{detail.name}</div>
                <div className="text-xs text-muted-foreground">{detail.description}</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-foreground">Tools</div>
              <div className="space-y-2">
                {detail.tools.map((tool) => (
                  <div
                    key={tool.name}
                    className="rounded-md border border-border/50 bg-background/60 p-3"
                  >
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-foreground">
                        {tool.displayName ?? tool.name}
                      </div>
                      <div className="text-xs text-muted-foreground">{tool.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : catalog ? (
          <div className="space-y-2">
            {catalog.map((item) => (
              <div
                key={`${item.name}-${item.description}`}
                className="rounded-md border border-border/50 bg-background/60 p-3"
              >
                <div className="space-y-1">
                  <div className="text-sm font-medium text-foreground">{item.name}</div>
                  <div className="text-xs text-muted-foreground">{item.description}</div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </ToolCard.Content>
    </ToolCard.Root>
  );
}
