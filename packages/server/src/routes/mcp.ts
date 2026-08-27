import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { MCP_TRANSPORT_TYPES } from '@stitch/shared/mcp/types';

import { ICON_CACHE_CONTROL, SVG_CONTENT_TYPE } from '@/lib/icon-cache.js';
import * as Log from '@/lib/log.js';
import { routeSchemas } from '@/lib/route-schemas.js';
import { evictMcpClient } from '@/mcp/client.js';
import * as OAuthCallback from '@/mcp/oauth-callback.js';
import { getMcpInstalledServerRegistryLogo, getMcpRegistryLogo } from '@/mcp/registry-logos.js';
import { listMcpRegistryServers, reloadMcpRegistryCacheFromDisk } from '@/mcp/registry-service.js';
import {
  createMcpServer,
  deleteMcpServer,
  fetchMcpTools,
  getMcpAuthStatus,
  listMcpServers,
  logoutMcpAuth,
  startMcpAuth,
} from '@/mcp/service.js';
import { refreshMcpToolsets } from '@/mcp/tool-executor.js';

const log = Log.create({ service: 'mcp-routes' });

const noneAuthSchema = z.object({ type: z.literal('none') });
const apiKeyAuthSchema = z.object({ type: z.literal('api_key'), apiKey: z.string().min(1) });
const headersAuthSchema = z.object({ type: z.literal('headers'), headers: z.record(z.string(), z.string()) });
const oauthAuthSchema = z.object({
  type: z.literal('oauth'),
  scopes: z.array(z.string()).optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
});
const authConfigSchema = z.discriminatedUnion('type', [
  noneAuthSchema,
  apiKeyAuthSchema,
  headersAuthSchema,
  oauthAuthSchema,
]);

const createMcpServerSchema = z.object({
  name: z.string().trim().min(1),
  transport: z.enum(MCP_TRANSPORT_TYPES),
  url: z.url(),
  authConfig: authConfigSchema,
});

const mcpServerIdParamSchema = z.object({ id: routeSchemas.mcpServerId });

export const mcpRouter = new Hono();

mcpRouter.get('/', async (c) => {
  const result = await listMcpServers();
  return c.json(result);
});

mcpRouter.post('/', zValidator('json', createMcpServerSchema), async (c) => {
  const body = c.req.valid('json');
  const result = await createMcpServer({
    name: body.name,
    transport: body.transport,
    url: body.url,
    authConfig: body.authConfig,
  });
  await refreshMcpToolsets({ serverIds: [result.id], refreshTools: true });
  return c.json(result, 201);
});

mcpRouter.get('/registry', async (c) => {
  const result = await listMcpRegistryServers();
  return c.json(result);
});

mcpRouter.post('/registry/refresh', async (c) => {
  await reloadMcpRegistryCacheFromDisk();
  return c.body(null, 204);
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

mcpRouter.get('/:id/tools', zValidator('param', mcpServerIdParamSchema), async (c) => {
  const id = c.req.valid('param').id;
  const result = await fetchMcpTools(id);
  await refreshMcpToolsets({ serverIds: [id], refreshTools: false });
  return c.json(result);
});

mcpRouter.get('/:id/logo', zValidator('param', mcpServerIdParamSchema), async (c) => {
  const id = c.req.valid('param').id;
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

mcpRouter.post('/:id/refresh', zValidator('param', mcpServerIdParamSchema), async (c) => {
  const id = c.req.valid('param').id;
  await refreshMcpToolsets({ serverIds: [id], refreshTools: true });
  return c.body(null, 204);
});

mcpRouter.delete('/:id', zValidator('param', mcpServerIdParamSchema), async (c) => {
  const id = c.req.valid('param').id;
  await deleteMcpServer(id);
  OAuthCallback.cancelPending(id);
  evictMcpClient(id);
  await refreshMcpToolsets({ refreshTools: false });
  return c.body(null, 204);
});

mcpRouter.post('/:id/auth', zValidator('param', mcpServerIdParamSchema), async (c) => {
  const id = c.req.valid('param').id;
  const result = await startMcpAuth(id);

  const { waitForTokens } = result;
  void waitForTokens().catch((error) => {
    const message = Error.isError(error) ? error.message : String(error);
    log.warn({ event: 'mcp.auth.background_failed', id, error: message }, 'background MCP authorization failed');
  });

  return c.json({ authUrl: result.authUrl });
});

mcpRouter.get('/:id/auth/status', zValidator('param', mcpServerIdParamSchema), async (c) => {
  const id = c.req.valid('param').id;
  const result = await getMcpAuthStatus(id);
  return c.json(result);
});

mcpRouter.post('/:id/auth/logout', zValidator('param', mcpServerIdParamSchema), async (c) => {
  const id = c.req.valid('param').id;
  await logoutMcpAuth(id);
  evictMcpClient(id);
  await refreshMcpToolsets({ serverIds: [id], refreshTools: false });
  return c.body(null, 204);
});
