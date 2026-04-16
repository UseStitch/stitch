import { tool } from 'ai';
import { z } from 'zod';

import { AGENDA_ITEM_PRIORITIES, AGENDA_ITEM_STATUSES } from '@stitch/shared/agenda/types';
import type { PrefixedString } from '@stitch/shared/id';

import {
  createAgendaItem,
  createAgendaList,
  getAgendaItem,
  getAgendaItems,
  getAgendaLists,
  updateAgendaItem,
} from '@/agenda/service.js';
import { listSettings } from '@/settings/service.js';
import type { ToolContext } from '@/tools/runtime/wrappers.js';
import type { Toolset } from '@/tools/toolsets/types.js';
import type { Tool } from 'ai';

const AGENDA_TOOLSET_ID = 'agenda';

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

async function getUserTimezone(): Promise<string> {
  const settings = await listSettings();
  return settings['profile.timezone'] || 'UTC';
}

const TOOL_SUMMARIES = [
  { name: 'agenda_add_item', description: 'Create a new agenda item in a list' },
  { name: 'agenda_update_item', description: 'Update an existing agenda item' },
  { name: 'agenda_list_items', description: 'List agenda items with optional filters' },
  { name: 'agenda_get_item', description: 'Get full details of a single agenda item' },
  { name: 'agenda_create_list', description: 'Create a new agenda list' },
  { name: 'agenda_list_lists', description: 'Show all agenda lists with counts' },
];

function createAgendaTools(context: ToolContext) {
  const agenda_add_item = tool({
    description: `Create a new agenda item. Requires a title. Optionally set priority (low/medium/high/urgent), dueAt (ISO date), listName (auto-creates list if missing), and description.

Use when the user asks to add a todo, task, or follow-up. Default priority is "medium" unless the user signals urgency. Only act on clear intent — do NOT automatically add items the user merely mentions.`,
    inputSchema: z.object({
      title: z.string().describe('Title for the new item'),
      description: z.string().optional().describe('Description or details for the item'),
      listName: z
        .string()
        .optional()
        .describe('Name of the agenda list. Auto-creates if it does not exist.'),
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
    }),
    execute: async (input) => {
      const userTimezone = await getUserTimezone();
      const dueAt = input.dueAt ? parseDueDate(input.dueAt, userTimezone) : null;
      if (input.dueAt && dueAt === null) {
        return { output: 'Invalid due date format. Use ISO 8601 (e.g. "2025-01-15T09:00:00Z").' };
      }

      const item = await createAgendaItem({
        title: input.title,
        description: input.description,
        priority: input.priority,
        dueAt,
        listName: input.listName,
        sourceSessionId: context.sessionId,
        sourceMessageId: context.messageId,
      });

      const parts = [
        `Added "${item.title}" (id: ${item.id})`,
        `List: ${item.listName ?? 'General'}`,
        `Priority: ${item.priority}`,
        `Status: ${item.status}`,
      ];
      if (item.dueAt) {
        parts.push(
          `Due: ${new Date(item.dueAt).toLocaleDateString('en-US', { timeZone: userTimezone })}`,
        );
      }

      return { output: parts.join('\n') };
    },
  });

  const agenda_update_item = tool({
    description: `Update an existing agenda item's status, priority, dueAt, title, or description. Provide the itemId and fields to change. Status changes are tracked automatically.

Use when the user asks to mark something as done, change priority, reschedule, or update task details.`,
    inputSchema: z.object({
      itemId: z.string().describe('The ID of the agenda item to update'),
      title: z.string().optional().describe('New title'),
      description: z.string().optional().describe('New description'),
      status: z.enum(AGENDA_ITEM_STATUSES).optional().describe('New status'),
      priority: z.enum(AGENDA_ITEM_PRIORITIES).optional().describe('New priority'),
      dueAt: z.string().optional().describe('New due date in ISO 8601, or empty string to clear'),
    }),
    execute: async (input) => {
      const userTimezone = await getUserTimezone();
      const dueAt = input.dueAt
        ? parseDueDate(input.dueAt, userTimezone)
        : input.dueAt === ''
          ? null
          : undefined;

      const item = await updateAgendaItem(
        input.itemId as PrefixedString<'aitm'>,
        {
          title: input.title,
          description: input.description,
          status: input.status,
          priority: input.priority,
          dueAt,
        },
        context.sessionId,
      );

      if (!item) {
        return { output: `No agenda item found with id: ${input.itemId}` };
      }

      return {
        output: `Updated "${item.title}" (id: ${item.id})\nStatus: ${item.status} | Priority: ${item.priority}`,
      };
    },
  });

  const agenda_list_items = tool({
    description: `Show agenda items. Filter by listName, status, or priority. Returns a summary with counts.

Use when the user asks about their tasks, what's pending, or what's due.`,
    inputSchema: z.object({
      listName: z.string().optional().describe('Filter by list name'),
      filterStatus: z.enum(AGENDA_ITEM_STATUSES).optional().describe('Filter by status'),
      filterPriority: z.enum(AGENDA_ITEM_PRIORITIES).optional().describe('Filter by priority'),
    }),
    execute: async (input) => {
      const userTimezone = await getUserTimezone();
      let listId: PrefixedString<'alist'> | undefined;
      if (input.listName) {
        const lists = await getAgendaLists();
        const match = lists.find((l) => l.name.toLowerCase() === input.listName!.toLowerCase());
        if (match) listId = match.id;
      }

      const result = await getAgendaItems({
        listId,
        status: input.filterStatus,
        priority: input.filterPriority,
        page: 1,
        pageSize: 50,
      });

      if (result.items.length === 0) {
        return { output: 'No agenda items found matching the filters.' };
      }

      const lines = result.items.map((item) => {
        const due = item.dueAt
          ? ` | Due: ${new Date(item.dueAt).toLocaleDateString('en-US', { timeZone: userTimezone })}`
          : '';
        return `- [${item.status}] [${item.priority}] ${item.title} (id: ${item.id}, list: ${item.listName ?? 'Unknown'}${due})`;
      });

      return {
        output: `${result.total} item(s) found\n${lines.join('\n')}`,
      };
    },
  });

  const agenda_get_item = tool({
    description: `Get full details for a single agenda item by itemId.

Use when the user wants to see the complete information about a specific item.`,
    inputSchema: z.object({
      itemId: z.string().describe('The ID of the agenda item'),
    }),
    execute: async (input) => {
      const userTimezone = await getUserTimezone();
      const detail = await getAgendaItem(input.itemId as PrefixedString<'aitm'>);
      if (!detail) {
        return { output: `No agenda item found with id: ${input.itemId}` };
      }

      const parts = [
        `Title: ${detail.title}`,
        `List: ${detail.listName ?? 'Unknown'}`,
        `Status: ${detail.status} | Priority: ${detail.priority}`,
      ];
      if (detail.description) parts.push(`Description: ${detail.description}`);
      if (detail.dueAt)
        parts.push(
          `Due: ${new Date(detail.dueAt).toLocaleDateString('en-US', { timeZone: userTimezone })}`,
        );
      if (detail.completedAt)
        parts.push(
          `Completed: ${new Date(detail.completedAt).toLocaleDateString('en-US', { timeZone: userTimezone })}`,
        );

      return { output: parts.join('\n') };
    },
  });

  const agenda_create_list = tool({
    description: `Create a new agenda list. Provide a name and optional description.

Use when the user wants to organize items into a new list/topic.`,
    inputSchema: z.object({
      name: z.string().describe('Name for the new list'),
      description: z.string().optional().describe('Optional description for the list'),
    }),
    execute: async (input) => {
      const list = await createAgendaList({
        name: input.name,
        description: input.description,
      });

      return { output: `Created list "${list.name}" (id: ${list.id})` };
    },
  });

  const agenda_list_lists = tool({
    description: `Show all agenda lists with open/in-progress/done counts.

Use when the user wants to see what lists exist or get an overview of their agenda.`,
    inputSchema: z.object({}),
    execute: async () => {
      const lists = await getAgendaLists();
      if (lists.length === 0) {
        return { output: 'No agenda lists yet. Create one with agenda_create_list.' };
      }

      const lines = lists.map((l) => {
        const c = l.itemCounts;
        return `- ${l.name} (id: ${l.id}) — ${c.open} open, ${c.in_progress} in progress, ${c.done} done, ${c.overdue} overdue`;
      });

      return { output: `${lists.length} list(s)\n${lines.join('\n')}` };
    },
  });

  return {
    agenda_add_item,
    agenda_update_item,
    agenda_list_items,
    agenda_get_item,
    agenda_create_list,
    agenda_list_lists,
  };
}

export function createAgendaToolset(): Toolset {
  return {
    id: AGENDA_TOOLSET_ID,
    name: 'Agenda',
    description:
      "Manage the user's agenda — a persistent system for tracking todos organized into lists. Activate to add items, update status, manage lists, and check what's pending or due.",
    instructions: [
      "Agenda tools manage the user's persistent task tracking system.",
      'When adding items, default priority is "medium" unless the user signals urgency.',
      'When the user mentions a list/topic name, match it to an existing list case-insensitively before creating a new one.',
      "If the user mentions something that sounds like a task but doesn't explicitly ask to track it, do NOT add it automatically — only act on clear intent.",
      'When updating status, briefly confirm what changed.',
    ].join('\n'),
    tools: () => TOOL_SUMMARIES,
    activate: async (context: ToolContext) => {
      return createAgendaTools(context) as unknown as Record<string, Tool>;
    },
  };
}
