import { PackageIcon, PackagePlusIcon, PackageMinusIcon, PackageSearchIcon } from 'lucide-react';

import type { ToolCallStatus } from '@stitch/shared/chat/realtime';

import { ToolCard, getToolCardState, getToolLabel } from './card-primitives';

import { ConnectorIcon } from '@/components/connectors/connector-icon';

const TOOLSET_TOOL_CONFIG: Record<
  string,
  { label: string; icon: typeof PackageIcon; verb: string }
> = {
  list_toolsets: { label: 'List Toolset', icon: PackageSearchIcon, verb: 'Inspecting' },
  activate_toolset: { label: 'Activate Toolset', icon: PackagePlusIcon, verb: 'Activating' },
  deactivate_toolset: { label: 'Deactivate Toolset', icon: PackageMinusIcon, verb: 'Deactivating' },
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

function getResultIcon(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const value = (result as Record<string, unknown>).icon;
  return typeof value === 'string' ? value : null;
}

type ToolsetToolBlockProps = {
  toolName: string;
  status: ToolCallStatus;
  args?: unknown;
  result?: unknown;
  error?: string;
};

export function ToolsetToolBlock({ toolName, status, args, result, error }: ToolsetToolBlockProps) {
  const { isActive } = getToolCardState(status);
  const config = TOOLSET_TOOL_CONFIG[toolName] ?? {
    label: 'Toolset',
    icon: PackageIcon,
    verb: 'Managing',
  };
  const Icon = config.icon;
  const toolsetId = getToolsetId(args);
  const resultMessage = getResultMessage(result);
  const resultIcon = getResultIcon(result);
  const label = getToolLabel(status, error);

  const description = isActive
    ? toolsetId
      ? `${config.verb} "${toolsetId}"...`
      : `${config.verb}...`
    : (resultMessage ?? label ?? 'Done');

  return (
    <ToolCard.Root status={status}>
      <ToolCard.Header>
        <ToolCard.StatusIndicator status={status} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <ToolCard.Title>{config.label}</ToolCard.Title>
            {toolsetId ? (
              <span className="inline-flex items-center gap-1 rounded-sm border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {resultIcon ? (
                  <ConnectorIcon icon={resultIcon} className="size-2.5" />
                ) : (
                  <Icon className="size-2.5" />
                )}
                {toolsetId}
              </span>
            ) : null}
          </div>
          <ToolCard.TitleContent truncate className="block">
            {description}
          </ToolCard.TitleContent>
        </div>
      </ToolCard.Header>
    </ToolCard.Root>
  );
}
