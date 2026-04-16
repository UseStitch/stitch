import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { AGENDA_ITEM_PRIORITIES, AGENDA_ITEM_STATUSES } from '@stitch/shared/agenda/types';
import type { PrefixedString } from '@stitch/shared/id';

import {
  addAgendaItemEvent,
  createAgendaItem,
  createAgendaList,
  deleteAgendaItem,
  deleteAgendaList,
  getAgendaItem,
  getAgendaItemEvents,
  getAgendaItems,
  getAgendaLists,
  mergeAgendaLists,
  reorderAgendaItems,
  reorderAgendaLists,
  updateAgendaItem,
  updateAgendaList,
} from '@/agenda/service.js';
import { requireFound, unwrapResult } from '@/lib/route-helpers.js';
import { paginationQuerySchema } from '@/lib/route-schemas.js';

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

const addEventSchema = z.object({
  content: z.string().trim().min(1).max(5000),
  sessionId: z.string().nullable().optional(),
});

export const agendaRouter = new Hono();

// --- Lists ---

agendaRouter.get('/lists', async (c) => {
  const includeArchived = c.req.query('includeArchived') === 'true';
  const lists = await getAgendaLists({ includeArchived });
  return c.json({ lists });
});

agendaRouter.post('/lists', zValidator('json', createListSchema), async (c) => {
  const body = c.req.valid('json');
  const list = await createAgendaList(body);
  return c.json({ list }, 201);
});

const reorderListsSchema = z.object({
  orderedIds: z.array(z.string()).min(1),
});

agendaRouter.post('/lists/reorder', zValidator('json', reorderListsSchema), async (c) => {
  const { orderedIds } = c.req.valid('json');
  await reorderAgendaLists(orderedIds as PrefixedString<'alist'>[]);
  return c.json({ success: true });
});

agendaRouter.patch('/lists/:id', zValidator('json', updateListSchema), async (c) => {
  const id = c.req.param('id') as PrefixedString<'alist'>;
  const body = c.req.valid('json');
  const list = await updateAgendaList(id, body);
  const result = requireFound(list, 'List');
  return unwrapResult(c, result);
});

agendaRouter.delete('/lists/:id', async (c) => {
  const id = c.req.param('id') as PrefixedString<'alist'>;
  const deleted = await deleteAgendaList(id);
  const result = requireFound(deleted, 'List');
  return unwrapResult(c, result, 204);
});

const mergeListSchema = z.object({
  sourceId: z.string().min(1),
});

agendaRouter.post('/lists/:id/merge', zValidator('json', mergeListSchema), async (c) => {
  const targetId = c.req.param('id') as PrefixedString<'alist'>;
  const { sourceId } = c.req.valid('json');
  const list = await mergeAgendaLists(targetId, sourceId as PrefixedString<'alist'>);
  const result = requireFound(list, 'List');
  return unwrapResult(c, result);
});

// --- Items ---

const reorderSchema = z.object({
  orderedIds: z.array(z.string()).min(1),
});

agendaRouter.post('/items/reorder', zValidator('json', reorderSchema), async (c) => {
  const { orderedIds } = c.req.valid('json');
  await reorderAgendaItems(orderedIds as PrefixedString<'aitm'>[]);
  return c.json({ success: true });
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
    return c.json(result);
  },
);

agendaRouter.post('/items', zValidator('json', createItemSchema), async (c) => {
  const body = c.req.valid('json');
  const item = await createAgendaItem({
    ...body,
    listId: body.listId as PrefixedString<'alist'> | undefined,
    sourceSessionId: body.sourceSessionId as PrefixedString<'ses'> | null | undefined,
    sourceMessageId: body.sourceMessageId as PrefixedString<'msg'> | null | undefined,
  });
  return c.json({ item }, 201);
});

agendaRouter.get('/items/:id', async (c) => {
  const id = c.req.param('id') as PrefixedString<'aitm'>;
  const item = await getAgendaItem(id);
  const result = requireFound(item, 'Item');
  return unwrapResult(c, result);
});

agendaRouter.patch('/items/:id', zValidator('json', updateItemSchema), async (c) => {
  const id = c.req.param('id') as PrefixedString<'aitm'>;
  const body = c.req.valid('json');
  const sessionId = c.req.query('sessionId') as PrefixedString<'ses'> | undefined;
  const item = await updateAgendaItem(
    id,
    { ...body, listId: body.listId as PrefixedString<'alist'> | undefined },
    sessionId,
  );
  const result = requireFound(item, 'Item');
  return unwrapResult(c, result);
});

agendaRouter.delete('/items/:id', async (c) => {
  const id = c.req.param('id') as PrefixedString<'aitm'>;
  const deleted = await deleteAgendaItem(id);
  const result = requireFound(deleted, 'Item');
  return unwrapResult(c, result, 204);
});

// --- Events ---

agendaRouter.get('/items/:id/events', async (c) => {
  const id = c.req.param('id') as PrefixedString<'aitm'>;
  const events = await getAgendaItemEvents(id);
  return c.json({ events });
});

agendaRouter.post('/items/:id/events', zValidator('json', addEventSchema), async (c) => {
  const id = c.req.param('id') as PrefixedString<'aitm'>;
  const body = c.req.valid('json');
  const event = await addAgendaItemEvent(id, {
    content: body.content,
    sessionId: body.sessionId as PrefixedString<'ses'> | null | undefined,
  });
  const result = requireFound(event, 'Item');
  return unwrapResult(c, result, 201);
});
