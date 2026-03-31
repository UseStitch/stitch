import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { MCP_TRANSPORT_TYPES } from '@stitch/shared/mcp/types';

import { isServiceError } from '@/lib/service-result.js';
import { getMcpIconByKey } from '@/mcp/icons.js';
import { createMcpServer, deleteMcpServer, fetchMcpTools, listMcpServers } from '@/mcp/service.js';
import { evictMcpClient, refreshMcpToolsets } from '@/mcp/tool-executor.js';

const noneAuthSchema = z.object({ type: z.literal('none') });
const apiKeyAuthSchema = z.object({ type: z.literal('api_key'), apiKey: z.string().min(1) });
const headersAuthSchema = z.object({
  type: z.literal('headers'),
  headers: z.record(z.string(), z.string()),
});
const authConfigSchema = z.discriminatedUnion('type', [
  noneAuthSchema,
  apiKeyAuthSchema,
  headersAuthSchema,
]);

const createMcpServerSchema = z.object({
  name: z.string().trim().min(1),
  transport: z.enum(MCP_TRANSPORT_TYPES),
  url: z.string().url(),
  authConfig: authConfigSchema,
});

export const mcpRouter = new Hono();

mcpRouter.get('/', async (c) => {
  const servers = await listMcpServers();
  return c.json(servers);
});

mcpRouter.post('/', zValidator('json', createMcpServerSchema), async (c) => {
  const body = c.req.valid('json');
  const result = await createMcpServer({
    name: body.name,
    transport: body.transport,
    url: body.url,
    authConfig: body.authConfig,
  });
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }
  await refreshMcpToolsets({ serverIds: [result.data.id], refreshTools: true });
  return c.json(result.data, 201);
});

mcpRouter.get('/:id/tools', async (c) => {
  const id = c.req.param('id');
  const result = await fetchMcpTools(id);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }
  await refreshMcpToolsets({ serverIds: [id], refreshTools: false });
  return c.json(result.data);
});

mcpRouter.post('/refresh', async (c) => {
  await refreshMcpToolsets({ refreshTools: true });
  return c.body(null, 204);
});

mcpRouter.post('/:id/refresh', async (c) => {
  const id = c.req.param('id');
  await refreshMcpToolsets({ serverIds: [id], refreshTools: true });
  return c.body(null, 204);
});

mcpRouter.get('/icons/:key', async (c) => {
  const key = c.req.param('key');
  const icon = await getMcpIconByKey(key);
  if (!icon) {
    return c.json({ error: 'Icon not found' }, 404);
  }

  c.header('Content-Type', icon.mimeType);
  c.header('Cache-Control', 'public, max-age=86400');
  return c.body(Buffer.from(icon.body), 200);
});

mcpRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await deleteMcpServer(id);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }
  evictMcpClient(id);
  await refreshMcpToolsets({ refreshTools: false });
  return c.body(null, 204);
});
