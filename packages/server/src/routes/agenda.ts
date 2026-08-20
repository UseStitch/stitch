import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { AGENDA_ITEM_PRIORITIES, AGENDA_ITEM_STATUSES } from '@stitch/shared/agenda/types';

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
import { paginationQuerySchema, routeSchemas } from '@/lib/route-schemas.js';

const listIdParamSchema = z.object({ id: routeSchemas.agendaListId });
const itemIdParamSchema = z.object({ id: routeSchemas.agendaItemId });

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

const reorderListsSchema = z.object({ orderedIds: z.array(routeSchemas.agendaListId).min(1) });
const mergeListsSchema = z.object({ sourceId: routeSchemas.agendaListId });

const createItemSchema = z.object({
  listId: routeSchemas.agendaListId.optional(),
  listName: z.string().optional(),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(5000).optional(),
  status: z.enum(AGENDA_ITEM_STATUSES).optional(),
  priority: z.enum(AGENDA_ITEM_PRIORITIES).optional(),
  dueAt: z.number().nullable().optional(),
  sourceSessionId: routeSchemas.sessionId.nullable().optional(),
  sourceMessageId: routeSchemas.messageId.nullable().optional(),
});

const updateItemSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  status: z.enum(AGENDA_ITEM_STATUSES).optional(),
  priority: z.enum(AGENDA_ITEM_PRIORITIES).optional(),
  dueAt: z.number().nullable().optional(),
  listId: routeSchemas.agendaListId.optional(),
});

const reorderItemsSchema = z.object({ orderedIds: z.array(routeSchemas.agendaItemId).min(1) });

const listItemsQuerySchema = paginationQuerySchema({ pageSize: 20 }).extend({
  listId: routeSchemas.agendaListId.optional(),
  status: z.enum(AGENDA_ITEM_STATUSES).optional(),
  priority: z.enum(AGENDA_ITEM_PRIORITIES).optional(),
});

export const agendaRouter = new Hono();

// --- Lists ---

agendaRouter.get('/lists', (c) => {
  const includeArchived = c.req.query('includeArchived') === 'true';
  return c.json({ lists: getAgendaLists({ includeArchived }) });
});

agendaRouter.post('/lists', zValidator('json', createListSchema), (c) => {
  return c.json(createAgendaList(c.req.valid('json')), 201);
});

agendaRouter.post('/lists/reorder', zValidator('json', reorderListsSchema), (c) => {
  reorderAgendaLists(c.req.valid('json').orderedIds);
  return c.body(null, 204);
});

agendaRouter.patch('/lists/:id', zValidator('param', listIdParamSchema), zValidator('json', updateListSchema), (c) => {
  return c.json(updateAgendaList(c.req.valid('param').id, c.req.valid('json')));
});

agendaRouter.delete('/lists/:id', zValidator('param', listIdParamSchema), (c) => {
  deleteAgendaList(c.req.valid('param').id);
  return c.body(null, 204);
});

agendaRouter.post(
  '/lists/:id/merge',
  zValidator('param', listIdParamSchema),
  zValidator('json', mergeListsSchema),
  (c) => {
    return c.json(mergeAgendaLists(c.req.valid('param').id, c.req.valid('json').sourceId));
  },
);

// --- Items ---

agendaRouter.post('/items/reorder', zValidator('json', reorderItemsSchema), (c) => {
  reorderAgendaItems(c.req.valid('json').orderedIds);
  return c.body(null, 204);
});

agendaRouter.get('/items', zValidator('query', listItemsQuerySchema), async (c) => {
  return c.json(await getAgendaItems(c.req.valid('query')));
});

agendaRouter.post('/items', zValidator('json', createItemSchema), (c) => {
  return c.json(createAgendaItem(c.req.valid('json')), 201);
});

agendaRouter.patch('/items/:id', zValidator('param', itemIdParamSchema), zValidator('json', updateItemSchema), (c) => {
  return c.json(updateAgendaItem(c.req.valid('param').id, c.req.valid('json')));
});

agendaRouter.delete('/items/:id', zValidator('param', itemIdParamSchema), (c) => {
  deleteAgendaItem(c.req.valid('param').id);
  return c.body(null, 204);
});
