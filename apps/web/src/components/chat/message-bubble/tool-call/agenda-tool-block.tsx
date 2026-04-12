import {
  ClipboardListIcon,
  ListPlusIcon,
  ListTodoIcon,
  PencilIcon,
  SearchIcon,
} from 'lucide-react';

import type { ToolCallStatus } from '@stitch/shared/chat/realtime';

import { ToolCard, getToolCardState, getToolLabel, truncateText } from './card-primitives';

const AGENDA_TOOL_CONFIG: Record<
  string,
  { label: string; icon: typeof ListTodoIcon; verb: string }
> = {
  agenda_add_item: { label: 'Add Item', icon: ListPlusIcon, verb: 'Adding' },
  agenda_update_item: { label: 'Update Item', icon: PencilIcon, verb: 'Updating' },
  agenda_list_items: { label: 'List Items', icon: ClipboardListIcon, verb: 'Listing' },
  agenda_get_item: { label: 'Get Item', icon: SearchIcon, verb: 'Fetching' },
  agenda_create_list: { label: 'Create List', icon: ListPlusIcon, verb: 'Creating' },
  agenda_list_lists: { label: 'List Lists', icon: ListTodoIcon, verb: 'Listing' },
};

function getAgendaArgs(args: unknown): { title?: string; itemId?: string; name?: string; listName?: string } {
  const value = args as Record<string, unknown> | undefined;
  return {
    title: typeof value?.title === 'string' ? value.title : undefined,
    itemId: typeof value?.itemId === 'string' ? value.itemId : undefined,
    name: typeof value?.name === 'string' ? value.name : undefined,
    listName: typeof value?.listName === 'string' ? value.listName : undefined,
  };
}

function getResultOutput(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const value = (result as Record<string, unknown>).output;
  return typeof value === 'string' ? value : null;
}

type AgendaToolBlockProps = {
  toolName: string;
  status: ToolCallStatus;
  args?: unknown;
  result?: unknown;
  error?: string;
};

export function AgendaToolBlock({ toolName, status, args, result, error }: AgendaToolBlockProps) {
  const { isActive } = getToolCardState(status);
  const config = AGENDA_TOOL_CONFIG[toolName] ?? {
    label: 'Agenda',
    icon: ListTodoIcon,
    verb: 'Managing',
  };
  const Icon = config.icon;
  const { title, itemId, name, listName } = getAgendaArgs(args);
  const resultOutput = getResultOutput(result);
  const label = getToolLabel(status, error);

  const subject = title ?? name ?? listName ?? itemId;
  const description = isActive
    ? subject
      ? `${config.verb} "${truncateText(subject, 60)}"...`
      : `${config.verb}...`
    : (label ?? (resultOutput ? truncateText(resultOutput.split('\n')[0], 80) : 'Done'));

  return (
    <ToolCard.Root status={status}>
      <ToolCard.Header>
        <ToolCard.StatusIndicator status={status} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2">
            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
            <ToolCard.Title>{config.label}</ToolCard.Title>
            {subject && !isActive ? (
              <span className="inline-flex items-center gap-1 rounded-sm border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {truncateText(subject, 30)}
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
