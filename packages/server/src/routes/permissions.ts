import { eq } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { sessions } from '@/db/schema.js';
import {
  allowPermissionResponse,
  alternativePermissionResponse,
  getPendingPermissionResponses,
  rejectPermissionResponse,
} from '@/permission/service.js';

const setPermissionRuleSchema = z.object({
  permission: z.enum(['allow', 'deny', 'ask']),
  pattern: z.string().nullable().optional(),
});

const alternativeBodySchema = z.object({
  entry: z.string().min(1).trim(),
});

export const permissionsRouter = new Hono();



permissionsRouter.get('/sessions/:id/permission-responses', async (c) => {
  const db = getDb();
  const sessionId = c.req.param('id') as PrefixedString<'ses'>;

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) return c.json({ error: 'Session not found' }, 404);

  const rows = await getPendingPermissionResponses(sessionId);
  return c.json(rows);
});

permissionsRouter.post(
  '/sessions/:sessionId/permission-responses/:permissionResponseId/allow',
  zValidator('json', z.object({ setPermission: setPermissionRuleSchema.optional() })),
  async (c) => {
    const permissionResponseId = c.req.param('permissionResponseId') as PrefixedString<'permres'>;
    const { setPermission } = c.req.valid('json');

    await allowPermissionResponse(permissionResponseId, setPermission);
    return c.json({ ok: true });
  },
);

permissionsRouter.post(
  '/sessions/:sessionId/permission-responses/:permissionResponseId/reject',
  zValidator('json', z.object({ setPermission: setPermissionRuleSchema.optional() })),
  async (c) => {
    const permissionResponseId = c.req.param('permissionResponseId') as PrefixedString<'permres'>;
    const { setPermission } = c.req.valid('json');

    await rejectPermissionResponse(permissionResponseId, setPermission);
    return c.json({ ok: true });
  },
);

permissionsRouter.post(
  '/sessions/:sessionId/permission-responses/:permissionResponseId/alternative',
  zValidator('json', alternativeBodySchema),
  async (c) => {
    const permissionResponseId = c.req.param('permissionResponseId') as PrefixedString<'permres'>;
    const { entry } = c.req.valid('json');

    await alternativePermissionResponse(permissionResponseId, entry.trim());
    return c.json({ ok: true });
  },
);
