import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { MCP_TRANSPORT_TYPES } from '@stitch/shared/mcp/types';

import { ICON_CACHE_CONTROL, SVG_CONTENT_TYPE } from '@/lib/icon-cache.js';
import { unwrapResult } from '@/lib/route-helpers.js';
import { isServiceError } from '@/lib/service-result.js';
import { getMcpInstalledServerRegistryLogo, getMcpRegistryLogo } from '@/mcp/registry-logos.js';
import { listMcpRegistryServers, refreshMcpRegistryCache } from '@/mcp/registry-service.js';
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
  const result = await listMcpServers();
  return unwrapResult(c, result);
});

mcpRouter.post('/', zValidator('json', createMcpServerSchema), async (c) => {
  const body = c.req.valid('json');
  const result = await createMcpServer({
    name: body.name,
    transport: body.transport,
    url: body.url,
    authConfig: body.authConfig,
  });
  if (isServiceError(result)) return unwrapResult(c, result);
  await refreshMcpToolsets({ serverIds: [result.data.id], refreshTools: true });
  return unwrapResult(c, result, 201);
});

mcpRouter.get('/registry', async (c) => {
  const result = await listMcpRegistryServers();
  return unwrapResult(c, result);
});

mcpRouter.post('/registry/refresh', async (c) => {
  const result = await refreshMcpRegistryCache({ force: true });
  return unwrapResult(c, result, 204);
});

mcpRouter.get('/registry/:registryId/logo', async (c) => {
  const registryId = c.req.param('registryId');
  const logo = await getMcpRegistryLogo(registryId);
  if (!logo) {
    return c.json({ error: 'MCP registry logo not found' }, 404);
  }

  c.header('Content-Type', SVG_CONTENT_TYPE);
  c.header('Cache-Control', ICON_CACHE_CONTROL);
  return c.body(logo, 200);
});

mcpRouter.get('/:id/tools', async (c) => {
  const id = c.req.param('id');
  const result = await fetchMcpTools(id);
  if (isServiceError(result)) return unwrapResult(c, result);
  await refreshMcpToolsets({ serverIds: [id], refreshTools: false });
  return unwrapResult(c, result);
});

mcpRouter.get('/:id/logo', async (c) => {
  const id = c.req.param('id');
  const logo = await getMcpInstalledServerRegistryLogo(id);
  if (!logo) {
    return c.json({ error: 'MCP server logo not found' }, 404);
  }

  c.header('Content-Type', SVG_CONTENT_TYPE);
  c.header('Cache-Control', ICON_CACHE_CONTROL);
  return c.body(logo, 200);
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

mcpRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await deleteMcpServer(id);
  if (isServiceError(result)) return unwrapResult(c, result);
  evictMcpClient(id);
  await refreshMcpToolsets({ refreshTools: false });
  return unwrapResult(c, result, 204);
});
