import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { AGENDA_ITEM_PRIORITIES, AGENDA_ITEM_STATUSES } from '@stitch/shared/agenda/types';
import type { PrefixedString } from '@stitch/shared/id';

import {
  createAgendaItem,
  createAgendaList,
  deleteAgendaItem,
  deleteAgendaList,
  getAgendaItems,
  getAgendaLists,
  mergeAgendaLists,
  reorderAgendaItems,
  reorderAgendaLists,
  updateAgendaItem,
  updateAgendaList,
} from '@/agenda/service.js';
import { unwrapResult } from '@/lib/route-helpers.js';
import { paginationQuerySchema } from '@/lib/route-schemas.js';
import { isServiceError } from '@/lib/service-result.js';

const createListSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  color: z.string().max(50).optional(),
});

const updateListSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  color: z.string().max(50).nullable().optional(),
  isArchived: z.boolean().optional(),
});

const createItemSchema = z.object({
  listId: z.string().optional(),
  listName: z.string().optional(),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(5000).optional(),
  status: z.enum(AGENDA_ITEM_STATUSES).optional(),
  priority: z.enum(AGENDA_ITEM_PRIORITIES).optional(),
  dueAt: z.number().nullable().optional(),
  sourceSessionId: z.string().nullable().optional(),
  sourceMessageId: z.string().nullable().optional(),
});

const updateItemSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(AGENDA_ITEM_STATUSES).optional(),
  priority: z.enum(AGENDA_ITEM_PRIORITIES).optional(),
  dueAt: z.number().nullable().optional(),
  listId: z.string().optional(),
});

const reorderSchema = z.object({
  orderedIds: z.array(z.string()).min(1),
});

export const agendaRouter = new Hono();

// --- Lists ---

agendaRouter.get('/lists', (c) => {
  const includeArchived = c.req.query('includeArchived') === 'true';
  const result = getAgendaLists({ includeArchived });
  if (isServiceError(result)) return unwrapResult(c, result);
  return c.json({ lists: result.data });
});

agendaRouter.post('/lists', zValidator('json', createListSchema), (c) => {
  const body = c.req.valid('json');
  const result = createAgendaList(body);
  return unwrapResult(c, result, 201);
});

agendaRouter.post('/lists/reorder', zValidator('json', reorderSchema), (c) => {
  const { orderedIds } = c.req.valid('json');
  const result = reorderAgendaLists(orderedIds as PrefixedString<'alist'>[]);
  return unwrapResult(c, result, 204);
});

agendaRouter.patch('/lists/:id', zValidator('json', updateListSchema), (c) => {
  const id = c.req.param('id') as PrefixedString<'alist'>;
  const body = c.req.valid('json');
  const result = updateAgendaList(id, body);
  return unwrapResult(c, result);
});

agendaRouter.delete('/lists/:id', (c) => {
  const id = c.req.param('id') as PrefixedString<'alist'>;
  const result = deleteAgendaList(id);
  return unwrapResult(c, result, 204);
});

agendaRouter.post(
  '/lists/:id/merge',
  zValidator('json', z.object({ sourceId: z.string().min(1) })),
  (c) => {
    const targetId = c.req.param('id') as PrefixedString<'alist'>;
    const { sourceId } = c.req.valid('json');
    const result = mergeAgendaLists(targetId, sourceId as PrefixedString<'alist'>);
    return unwrapResult(c, result);
  },
);

// --- Items ---

agendaRouter.post('/items/reorder', zValidator('json', reorderSchema), (c) => {
  const { orderedIds } = c.req.valid('json');
  const result = reorderAgendaItems(orderedIds as PrefixedString<'aitm'>[]);
  return unwrapResult(c, result, 204);
});

agendaRouter.get(
  '/items',
  zValidator('query', paginationQuerySchema({ pageSize: 20 })),
  async (c) => {
    const { page, pageSize } = c.req.valid('query');
    const listId = c.req.query('listId') as PrefixedString<'alist'> | undefined;
    const status = c.req.query('status') as (typeof AGENDA_ITEM_STATUSES)[number] | undefined;
    const priority = c.req.query('priority') as (typeof AGENDA_ITEM_PRIORITIES)[number] | undefined;
    const result = await getAgendaItems({ listId, status, priority, page, pageSize });
    return unwrapResult(c, result);
  },
);

agendaRouter.post('/items', zValidator('json', createItemSchema), (c) => {
  const body = c.req.valid('json');
  const result = createAgendaItem({
    ...body,
    listId: body.listId as PrefixedString<'alist'> | undefined,
    sourceSessionId: body.sourceSessionId as PrefixedString<'ses'> | null | undefined,
    sourceMessageId: body.sourceMessageId as PrefixedString<'msg'> | null | undefined,
  });
  return unwrapResult(c, result, 201);
});

agendaRouter.patch('/items/:id', zValidator('json', updateItemSchema), (c) => {
  const id = c.req.param('id') as PrefixedString<'aitm'>;
  const body = c.req.valid('json');
  const result = updateAgendaItem(id, {
    ...body,
    listId: body.listId as PrefixedString<'alist'> | undefined,
  });
  return unwrapResult(c, result);
});

agendaRouter.delete('/items/:id', (c) => {
  const id = c.req.param('id') as PrefixedString<'aitm'>;
  const result = deleteAgendaItem(id);
  return unwrapResult(c, result, 204);
});
