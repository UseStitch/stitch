import { tool } from 'ai';
import { z } from 'zod';

import {
  AGENDA_ITEM_PRIORITIES,
  AGENDA_ITEM_STATUSES,
  AGENDA_ITEM_TYPES,
} from '@stitch/shared/agenda/types';
import type { PrefixedString } from '@stitch/shared/id';

import {
  addAgendaItemEvent,
  createAgendaItem,
  createAgendaList,
  getAgendaItem,
  getAgendaItems,
  getAgendaLists,
  updateAgendaItem,
} from '@/agenda/service.js';
import { listSettings } from '@/settings/service.js';
import type { ToolContext } from '@/tools/runtime/wrappers.js';

export const DISPLAY_NAME = 'Agenda';

const agendaInputSchema = z.object({
  action: z
    .enum([
      'add_item',
      'update_item',
      'list_items',
      'get_item',
      'add_comment',
      'create_list',
      'list_lists',
    ])
    .describe(
      'Action to perform: "add_item" to create a todo/reminder/checkup, "update_item" to change status/priority/details, "list_items" to show items with optional filters, "get_item" to get full detail + timeline, "add_comment" to add a note to an item, "create_list" to create a new agenda list, "list_lists" to show all lists with counts',
    ),
  title: z.string().optional().describe('Title for a new item or list name for create_list'),
  description: z
    .string()
    .optional()
    .describe('Description or details for the item or list'),
  itemId: z.string().optional().describe('The ID of an existing agenda item (for update_item, get_item, add_comment)'),
  listName: z
    .string()
    .optional()
    .describe('Name of the agenda list. Auto-creates if it does not exist when adding items.'),
  type: z
    .enum(AGENDA_ITEM_TYPES)
    .optional()
    .describe('Item type: "todo" for tasks, "reminder" for time-sensitive follow-ups, "checkup" for periodic checks'),
  status: z
    .enum(AGENDA_ITEM_STATUSES)
    .optional()
    .describe('Item status: "open", "in_progress", "done", or "cancelled"'),
  priority: z
    .enum(AGENDA_ITEM_PRIORITIES)
    .optional()
    .describe('Priority level: "low", "medium", "high", or "urgent"'),
  dueAt: z
    .string()
    .optional()
    .describe('Due date in ISO 8601 format (e.g. "2025-01-15T09:00:00Z")'),
  content: z.string().optional().describe('Comment text when using add_comment'),
  filterStatus: z
    .enum(AGENDA_ITEM_STATUSES)
    .optional()
    .describe('Filter items by status when using list_items'),
  filterPriority: z
    .enum(AGENDA_ITEM_PRIORITIES)
    .optional()
    .describe('Filter items by priority when using list_items'),
  filterType: z
    .enum(AGENDA_ITEM_TYPES)
    .optional()
    .describe('Filter items by type when using list_items'),
});

const DESCRIPTION = `Manage the user's agenda — a persistent system for tracking todos, reminders, and checkups organized into lists.

Use this tool when the user:
- Asks to add a todo, reminder, or follow-up ("remind me to...", "add a todo to...", "I need to check on...")
- Asks about their tasks, what's pending, or what's due
- Wants to update the status of something ("mark X as done", "cancel the deploy task")
- Wants to organize items into lists/topics ("move this to the DevOps list", "create a list for Q3")
- Asks to comment on or add context to an existing item

Actions:
- "add_item": Create a new agenda item. Requires title. Optionally set type (todo/reminder/checkup), priority (low/medium/high/urgent), dueAt (ISO date), listName (auto-creates list if missing), and description.
- "update_item": Update an existing item's status, priority, dueAt, title, or description. Provide the itemId and fields to change. Status changes are tracked automatically.
- "list_items": Show agenda items. Filter by listName, status, priority, or type. Returns a summary with counts.
- "get_item": Get full details and timeline for a single item by itemId.
- "add_comment": Add a note or context to an item. Provide itemId and content.
- "create_list": Create a new agenda list. Provide title (used as name) and optional description.
- "list_lists": Show all agenda lists with open/in-progress/done counts.

Behavior:
- When adding items, always infer the type from context: explicit tasks are "todo", time-sensitive follow-ups are "reminder", periodic checks are "checkup".
- When the user mentions a list/topic name, match it to an existing list case-insensitively before creating a new one.
- Default priority is "medium" unless the user signals urgency.
- When updating status, briefly confirm what changed.
- If the user mentions something that sounds like a task but doesn't explicitly ask to track it, do NOT add it automatically — only act on clear intent.`;

function parseDueDate(dateStr: string, timeZone: string): number | null {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  if (isDateOnly) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const utcNoon = Date.UTC(year, month - 1, day, 12, 0, 0);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      day: '2-digit',
      hour12: false,
    });
    const utcFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      hour: '2-digit',
      day: '2-digit',
      hour12: false,
    });

    const probe = new Date(utcNoon);
    const tzParts = formatter.formatToParts(probe);
    const utcParts = utcFormatter.formatToParts(probe);

    const tzHour = Number(tzParts.find((p) => p.type === 'hour')?.value ?? 0);
    const utcHour = Number(utcParts.find((p) => p.type === 'hour')?.value ?? 0);
    const tzDay = Number(tzParts.find((p) => p.type === 'day')?.value ?? 0);
    const utcDay = Number(utcParts.find((p) => p.type === 'day')?.value ?? 0);

    let offsetHours = utcHour - tzHour;
    if (utcDay > tzDay) offsetHours += 24;
    else if (utcDay < tzDay) offsetHours -= 24;

    return Date.UTC(year, month - 1, day, 12 + offsetHours, 0, 0);
  }

  const ms = new Date(dateStr).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function createAgendaTool(context: ToolContext) {
  return tool({
    description: DESCRIPTION,
    inputSchema: agendaInputSchema,
    execute: async (input) => {
      const settings = await listSettings();
      const userTimezone = settings['profile.timezone'] || 'UTC';

      switch (input.action) {
        case 'add_item': {
          if (!input.title) {
            return { output: 'Please provide a title for the agenda item.' };
          }

          const dueAt = input.dueAt ? parseDueDate(input.dueAt, userTimezone) : null;
          if (input.dueAt && dueAt === null) {
            return { output: 'Invalid due date format. Use ISO 8601 (e.g. "2025-01-15T09:00:00Z").' };
          }

          const item = await createAgendaItem({
            title: input.title,
            description: input.description,
            type: input.type,
            priority: input.priority,
            dueAt,
            listName: input.listName,
            sourceSessionId: context.sessionId,
            sourceMessageId: context.messageId,
          });

          const parts = [
            `Added "${item.title}" (id: ${item.id})`,
            `List: ${item.listName ?? 'General'}`,
            `Type: ${item.type}`,
            `Priority: ${item.priority}`,
            `Status: ${item.status}`,
          ];
          if (item.dueAt) {
            parts.push(`Due: ${new Date(item.dueAt).toLocaleDateString('en-US', { timeZone: userTimezone })}`);
          }

          return { output: parts.join('\n') };
        }

        case 'update_item': {
          if (!input.itemId) {
            return { output: 'Please provide the itemId to update.' };
          }

          const dueAt = input.dueAt ? parseDueDate(input.dueAt, userTimezone) : input.dueAt === '' ? null : undefined;

          const item = await updateAgendaItem(
            input.itemId as PrefixedString<'aitm'>,
            {
              title: input.title,
              description: input.description,
              type: input.type,
              status: input.status,
              priority: input.priority,
              dueAt: dueAt,
            },
            context.sessionId,
          );

          if (!item) {
            return { output: `No agenda item found with id: ${input.itemId}` };
          }

          return {
            output: `Updated "${item.title}" (id: ${item.id})\nStatus: ${item.status} | Priority: ${item.priority} | Type: ${item.type}`,
          };
        }

        case 'list_items': {
          let listId: PrefixedString<'alist'> | undefined;
          if (input.listName) {
            const lists = await getAgendaLists();
            const match = lists.find(
              (l) => l.name.toLowerCase() === input.listName!.toLowerCase(),
            );
            if (match) listId = match.id;
          }

          const result = await getAgendaItems({
            listId,
            status: input.filterStatus,
            priority: input.filterPriority,
            type: input.filterType,
            page: 1,
            pageSize: 50,
          });

          if (result.items.length === 0) {
            return { output: 'No agenda items found matching the filters.' };
          }

          const lines = result.items.map((item) => {
            const due = item.dueAt ? ` | Due: ${new Date(item.dueAt).toLocaleDateString('en-US', { timeZone: userTimezone })}` : '';
            return `- [${item.status}] [${item.priority}] ${item.title} (id: ${item.id}, list: ${item.listName ?? 'Unknown'}, type: ${item.type}${due})`;
          });

          return {
            output: `${result.total} item(s) found:\n${lines.join('\n')}`,
          };
        }

        case 'get_item': {
          if (!input.itemId) {
            return { output: 'Please provide the itemId.' };
          }

          const detail = await getAgendaItem(input.itemId as PrefixedString<'aitm'>);
          if (!detail) {
            return { output: `No agenda item found with id: ${input.itemId}` };
          }

          const parts = [
            `Title: ${detail.title}`,
            `List: ${detail.listName ?? 'Unknown'}`,
            `Type: ${detail.type} | Status: ${detail.status} | Priority: ${detail.priority}`,
          ];
          if (detail.description) parts.push(`Description: ${detail.description}`);
          if (detail.dueAt) parts.push(`Due: ${new Date(detail.dueAt).toLocaleDateString('en-US', { timeZone: userTimezone })}`);
          if (detail.completedAt) parts.push(`Completed: ${new Date(detail.completedAt).toLocaleDateString('en-US', { timeZone: userTimezone })}`);

          if (detail.events.length > 0) {
            parts.push('\nTimeline:');
            for (const event of detail.events) {
              const time = new Date(event.createdAt).toLocaleString('en-US', { timeZone: userTimezone });
              parts.push(`  - [${time}] ${event.type}: ${event.content}`);
            }
          }

          return { output: parts.join('\n') };
        }

        case 'add_comment': {
          if (!input.itemId) {
            return { output: 'Please provide the itemId.' };
          }
          if (!input.content) {
            return { output: 'Please provide the comment content.' };
          }

          const event = await addAgendaItemEvent(
            input.itemId as PrefixedString<'aitm'>,
            { content: input.content, sessionId: context.sessionId },
          );

          if (!event) {
            return { output: `No agenda item found with id: ${input.itemId}` };
          }

          return { output: `Comment added to item ${input.itemId}.` };
        }

        case 'create_list': {
          if (!input.title) {
            return { output: 'Please provide a name for the list (use the title field).' };
          }

          const list = await createAgendaList({
            name: input.title,
            description: input.description,
          });

          return { output: `Created list "${list.name}" (id: ${list.id})` };
        }

        case 'list_lists': {
          const lists = await getAgendaLists();
          if (lists.length === 0) {
            return { output: 'No agenda lists yet. Create one with "create_list".' };
          }

          const lines = lists.map((l) => {
            const c = l.itemCounts;
            return `- ${l.name} (id: ${l.id}) — ${c.open} open, ${c.in_progress} in progress, ${c.done} done, ${c.overdue} overdue`;
          });

          return { output: `${lists.length} list(s):\n${lines.join('\n')}` };
        }
      }
    },
  });
}

export function createRegisteredTool(context: ToolContext) {
  return createAgendaTool(context);
}
