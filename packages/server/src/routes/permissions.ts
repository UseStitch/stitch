import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { getSessionById } from '@/chat/session-crud.js';
import { routeSchemas } from '@/lib/route-schemas.js';
import {
  allowPermissionResponse,
  alternativePermissionResponse,
  getPendingPermissionResponses,
  rejectPermissionResponse,
} from '@/permission/service.js';

const sessionParamSchema = z.object({ id: routeSchemas.sessionId });

const permissionResponseParamSchema = z.object({
  sessionId: routeSchemas.sessionId,
  permissionResponseId: routeSchemas.permissionResponseId,
});

const setPermissionRuleSchema = z.object({
  permission: z.enum(['allow', 'deny', 'ask']),
  pattern: z.string().nullable().optional(),
});

const alternativeBodySchema = z.object({ entry: z.string().min(1).trim() });

export const permissionsRouter = new Hono();

permissionsRouter.get('/sessions/:id/permission-responses', zValidator('param', sessionParamSchema), async (c) => {
  const { id: sessionId } = c.req.valid('param');

  await getSessionById(sessionId);
  const result = await getPendingPermissionResponses(sessionId);
  return c.json(result);
});

permissionsRouter.post(
  '/sessions/:sessionId/permission-responses/:permissionResponseId/allow',
  zValidator('param', permissionResponseParamSchema),
  zValidator('json', z.object({ setPermission: setPermissionRuleSchema.optional() })),
  async (c) => {
    const { permissionResponseId } = c.req.valid('param');
    const { setPermission } = c.req.valid('json');

    await allowPermissionResponse(permissionResponseId, setPermission);
    return c.json({ ok: true });
  },
);

permissionsRouter.post(
  '/sessions/:sessionId/permission-responses/:permissionResponseId/reject',
  zValidator('param', permissionResponseParamSchema),
  zValidator('json', z.object({ setPermission: setPermissionRuleSchema.optional() })),
  async (c) => {
    const { permissionResponseId } = c.req.valid('param');
    const { setPermission } = c.req.valid('json');

    await rejectPermissionResponse(permissionResponseId, setPermission);
    return c.json({ ok: true });
  },
);

permissionsRouter.post(
  '/sessions/:sessionId/permission-responses/:permissionResponseId/alternative',
  zValidator('param', permissionResponseParamSchema),
  zValidator('json', alternativeBodySchema),
  async (c) => {
    const { permissionResponseId } = c.req.valid('param');
    const { entry } = c.req.valid('json');

    await alternativePermissionResponse(permissionResponseId, entry.trim());
    return c.json({ ok: true });
  },
);
