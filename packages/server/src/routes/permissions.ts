import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import type { PrefixedString } from '@openwork/shared';

type SetPermissionRuleInput = {
  permission: 'allow' | 'deny' | 'ask';
  pattern?: string | null;
};

import { getDb } from '@/db/client.js';
import { sessions } from '@/db/schema.js';
import {
  allowPermissionResponse,
  alternativePermissionResponse,
  getPendingPermissionResponses,
  rejectPermissionResponse,
} from '@/permission/service.js';

export const permissionsRouter = new Hono();

function parseSetPermissionRuleInput(value: unknown): SetPermissionRuleInput | null {
  if (value === undefined) return null;
  if (typeof value !== 'object' || value === null) return null;

  const permission = (value as { permission?: unknown }).permission;
  if (permission !== 'allow' && permission !== 'deny' && permission !== 'ask') {
    return null;
  }

  const patternValue = (value as { pattern?: unknown }).pattern;
  if (patternValue === undefined || patternValue === null) {
    return { permission, pattern: null };
  }

  if (typeof patternValue !== 'string') return null;
  const pattern = patternValue.trim();
  return { permission, pattern: pattern.length > 0 ? pattern : null };
}

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
  async (c) => {
    const permissionResponseId = c.req.param('permissionResponseId') as PrefixedString<'permres'>;
    const body = (await c.req.json().catch(() => ({}))) as { setPermission?: unknown };
    const setPermission = parseSetPermissionRuleInput(body.setPermission);
    if (body.setPermission !== undefined && setPermission === null) {
      return c.json({ error: 'Invalid setPermission payload' }, 400);
    }

    await allowPermissionResponse(permissionResponseId, setPermission ?? undefined);
    return c.json({ ok: true });
  },
);

permissionsRouter.post(
  '/sessions/:sessionId/permission-responses/:permissionResponseId/reject',
  async (c) => {
    const permissionResponseId = c.req.param('permissionResponseId') as PrefixedString<'permres'>;
    const body = (await c.req.json().catch(() => ({}))) as { setPermission?: unknown };
    const setPermission = parseSetPermissionRuleInput(body.setPermission);
    if (body.setPermission !== undefined && setPermission === null) {
      return c.json({ error: 'Invalid setPermission payload' }, 400);
    }

    await rejectPermissionResponse(permissionResponseId, setPermission ?? undefined);
    return c.json({ ok: true });
  },
);

permissionsRouter.post(
  '/sessions/:sessionId/permission-responses/:permissionResponseId/alternative',
  async (c) => {
    const permissionResponseId = c.req.param('permissionResponseId') as PrefixedString<'permres'>;
    const body = (await c.req.json()) as { entry?: unknown };
    if (typeof body.entry !== 'string' || body.entry.trim().length === 0) {
      return c.json({ error: 'entry is required' }, 400);
    }

    await alternativePermissionResponse(permissionResponseId, body.entry.trim());
    return c.json({ ok: true });
  },
);
