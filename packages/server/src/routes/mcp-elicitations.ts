import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { getSessionById } from '@/chat/session-crud.js';
import { unwrapResult } from '@/lib/route-helpers.js';
import { routeSchemas } from '@/lib/route-schemas.js';
import { getPendingMcpElicitations, resolveMcpElicitation } from '@/mcp/elicitation-service.js';

const sessionParamSchema = z.object({ id: routeSchemas.sessionId });
const elicitationParamSchema = z.object({
  sessionId: routeSchemas.sessionId,
  elicitationId: routeSchemas.mcpElicitationId,
});
const contentValueSchema = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);
const responseSchema = z.object({
  action: z.enum(['accept', 'decline', 'cancel']),
  content: z.record(z.string(), contentValueSchema).optional(),
});

export const mcpElicitationsRouter = new Hono();

mcpElicitationsRouter.get('/sessions/:id/mcp-elicitations', zValidator('param', sessionParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const session = await getSessionById(id);
  if (session.error) return unwrapResult(c, session);
  return unwrapResult(c, await getPendingMcpElicitations(id));
});

mcpElicitationsRouter.post(
  '/sessions/:sessionId/mcp-elicitations/:elicitationId/respond',
  zValidator('param', elicitationParamSchema),
  zValidator('json', responseSchema),
  async (c) => {
    const { elicitationId } = c.req.valid('param');
    const { action, content } = c.req.valid('json');
    return unwrapResult(c, await resolveMcpElicitation(elicitationId, action, content));
  },
);
