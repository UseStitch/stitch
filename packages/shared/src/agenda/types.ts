import type { PrefixedString } from '../id/index.js';

export const AGENDA_ITEM_STATUSES = ['open', 'in_progress', 'done', 'cancelled'] as const;
export type AgendaItemStatus = (typeof AGENDA_ITEM_STATUSES)[number];

export const AGENDA_ITEM_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type AgendaItemPriority = (typeof AGENDA_ITEM_PRIORITIES)[number];

export const AGENDA_EVENT_TYPES = ['created', 'status_change', 'updated', 'comment'] as const;
export type AgendaEventType = (typeof AGENDA_EVENT_TYPES)[number];

export type AgendaList = {
  id: PrefixedString<'alist'>;
  name: string;
  description: string;
  color: string | null;
  position: number;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
};

export type AgendaItem = {
  id: PrefixedString<'aitm'>;
  listId: PrefixedString<'alist'>;
  listName?: string;
  title: string;
  description: string;
  status: AgendaItemStatus;
  priority: AgendaItemPriority;
  dueAt: number | null;
  completedAt: number | null;
  sourceSessionId: PrefixedString<'ses'> | null;
  sourceMessageId: PrefixedString<'msg'> | null;
  position: number;
  createdAt: number;
  updatedAt: number;
};

export type AgendaItemEvent = {
  id: PrefixedString<'aevt'>;
  itemId: PrefixedString<'aitm'>;
  type: AgendaEventType;
  fromStatus: AgendaItemStatus | null;
  toStatus: AgendaItemStatus | null;
  content: string;
  sessionId: PrefixedString<'ses'> | null;
  createdAt: number;
};

export type CreateAgendaListInput = {
  name: string;
  description?: string;
  color?: string;
};

export type UpdateAgendaListInput = {
  name?: string;
  description?: string;
  color?: string | null;
  isArchived?: boolean;
};

export type CreateAgendaItemInput = {
  listId?: PrefixedString<'alist'>;
  listName?: string;
  title: string;
  description?: string;
  status?: AgendaItemStatus;
  priority?: AgendaItemPriority;
  dueAt?: number | null;
  sourceSessionId?: PrefixedString<'ses'> | null;
  sourceMessageId?: PrefixedString<'msg'> | null;
};

export type UpdateAgendaItemInput = {
  title?: string;
  description?: string;
  status?: AgendaItemStatus;
  priority?: AgendaItemPriority;
  dueAt?: number | null;
  listId?: PrefixedString<'alist'>;
};

export type AgendaListWithCounts = AgendaList & {
  itemCounts: {
    open: number;
    in_progress: number;
    done: number;
    cancelled: number;
    total: number;
    overdue: number;
    dueSoon: number;
  };
};

export type ListAgendaItemsResponse = {
  items: AgendaItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type AgendaItemDetail = AgendaItem & {
  events: AgendaItemEvent[];
};
