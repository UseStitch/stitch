import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { getSessionById } from '@/chat/service.js';
import { requireFound, unwrapResult } from '@/lib/route-helpers.js';
import { isServiceError } from '@/lib/service-result.js';
import {
  allowPermissionResponse,
  alternativePermissionResponse,
  getPendingPermissionResponses,
  rejectPermissionResponse,
} from '@/permission/service.js';

const sessionParamSchema = z.object({
  id: z.templateLiteral(['ses_', z.string()]),
});

const permissionResponseParamSchema = z.object({
  sessionId: z.templateLiteral(['ses_', z.string()]),
  permissionResponseId: z.templateLiteral(['permres_', z.string()]),
});

const setPermissionRuleSchema = z.object({
  permission: z.enum(['allow', 'deny', 'ask']),
  pattern: z.string().nullable().optional(),
});

const alternativeBodySchema = z.object({
  entry: z.string().min(1).trim(),
});

export const permissionsRouter = new Hono();

permissionsRouter.get(
  '/sessions/:id/permission-responses',
  zValidator('param', sessionParamSchema),
  async (c) => {
    const { id: sessionId } = c.req.valid('param');

    const sessionResult = requireFound(await getSessionById(sessionId), 'Session');
    if (isServiceError(sessionResult)) return unwrapResult(c, sessionResult);

    const rows = await getPendingPermissionResponses(sessionId);
    return c.json(rows);
  },
);

permissionsRouter.post(
  '/sessions/:sessionId/permission-responses/:permissionResponseId/allow',
  zValidator('param', permissionResponseParamSchema),
  zValidator('json', z.object({ setPermission: setPermissionRuleSchema.optional() })),
  async (c) => {
    const { permissionResponseId } = c.req.valid('param');
    const { setPermission } = c.req.valid('json');

    const result = await allowPermissionResponse(permissionResponseId, setPermission);
    return unwrapResult(c, result);
  },
);

permissionsRouter.post(
  '/sessions/:sessionId/permission-responses/:permissionResponseId/reject',
  zValidator('param', permissionResponseParamSchema),
  zValidator('json', z.object({ setPermission: setPermissionRuleSchema.optional() })),
  async (c) => {
    const { permissionResponseId } = c.req.valid('param');
    const { setPermission } = c.req.valid('json');

    const result = await rejectPermissionResponse(permissionResponseId, setPermission);
    return unwrapResult(c, result);
  },
);

permissionsRouter.post(
  '/sessions/:sessionId/permission-responses/:permissionResponseId/alternative',
  zValidator('param', permissionResponseParamSchema),
  zValidator('json', alternativeBodySchema),
  async (c) => {
    const { permissionResponseId } = c.req.valid('param');
    const { entry } = c.req.valid('json');

    const result = await alternativePermissionResponse(permissionResponseId, entry.trim());
    return unwrapResult(c, result);
  },
);
