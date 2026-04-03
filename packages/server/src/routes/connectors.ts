import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import * as ConnectorIcons from '@/connectors/icons.js';
import { listConnectorDefinitions, getConnectorDefinition } from '@/connectors/registry.js';
import {
  listConnectorInstances,
  getConnectorInstance,
  createOAuthConnectorInstance,
  createApiKeyConnectorInstance,
  authorizeOAuthInstance,
  updateConnectorInstance,
  deleteConnectorInstance,
  testConnectorInstance,
  upgradeConnectorInstance,
} from '@/connectors/service.js';
import * as Log from '@/lib/log.js';
import { isServiceError } from '@/lib/service-result.js';

export const connectorsRouter = new Hono();
const log = Log.create({ service: 'connectors-route' });

// Serve connector icon SVGs from Simple Icons CDN with local cache.
connectorsRouter.get('/icons/simple-icons/:slug', async (c) => {
  const slug = c.req.param('slug');
  const svg = await ConnectorIcons.get({ type: 'simpleIcons', slug });
  if (!svg) return c.json({ error: 'Icon not found' }, 404);

  c.header('Content-Type', 'image/svg+xml; charset=utf-8');
  c.header('Cache-Control', 'public, max-age=86400');
  return c.body(svg, 200);
});

// List all available connector definitions
connectorsRouter.get('/definitions', (c) => {
  const definitions = listConnectorDefinitions();
  return c.json(definitions);
});

// Get a specific connector definition
connectorsRouter.get('/definitions/:id', (c) => {
  const id = c.req.param('id');
  const definition = getConnectorDefinition(id);
  if (!definition) return c.json({ error: 'Connector not found' }, 404);
  return c.json(definition);
});

// List all connector instances
connectorsRouter.get('/instances', async (c) => {
  const instances = await listConnectorInstances();
  return c.json(instances);
});

// Get a specific connector instance
connectorsRouter.get('/instances/:id', async (c) => {
  const id = c.req.param('id');
  const result = await getConnectorInstance(id);
  if (isServiceError(result)) return c.json({ error: result.error }, result.status);
  return c.json(result.data);
});

// Create an OAuth connector instance
const createOAuthSchema = z
  .object({
    connectorId: z.string().min(1),
    label: z.string().min(1),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    scopes: z.array(z.string()).min(1),
  });

connectorsRouter.post('/instances/oauth', zValidator('json', createOAuthSchema), async (c) => {
  const body = c.req.valid('json');
  const result = await createOAuthConnectorInstance(body);
  if (isServiceError(result)) return c.json({ error: result.error }, result.status);
  return c.json(result.data, 201);
});

// Create an API key connector instance
const createApiKeySchema = z.object({
  connectorId: z.string().min(1),
  label: z.string().min(1),
  apiKey: z.string().min(1),
});

connectorsRouter.post('/instances/api-key', zValidator('json', createApiKeySchema), async (c) => {
  const body = c.req.valid('json');
  const result = await createApiKeyConnectorInstance(body);
  if (isServiceError(result)) return c.json({ error: result.error }, result.status);
  return c.json(result.data, 201);
});

// Start OAuth authorization flow for an instance
connectorsRouter.post('/instances/:id/authorize', async (c) => {
  const id = c.req.param('id');
  const result = await authorizeOAuthInstance(id);
  if (isServiceError(result)) return c.json({ error: result.error }, result.status);

  // Start the token wait in the background - it resolves when the user completes the OAuth flow
  const { waitForTokens } = result.data;
  void waitForTokens().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(
      { event: 'connector.authorize.background_failed', id, error: message },
      'background connector authorization failed',
    );
  });

  return c.json({ authUrl: result.data.authUrl });
});

// Update a connector instance
const updateSchema = z.object({
  label: z.string().min(1).optional(),
  scopes: z.array(z.string()).optional(),
});

const upgradeSchema = z.object({
  apiKey: z.string().min(1).optional(),
});

connectorsRouter.patch('/instances/:id', zValidator('json', updateSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const result = await updateConnectorInstance(id, body);
  if (isServiceError(result)) return c.json({ error: result.error }, result.status);
  return c.json(result.data);
});

// Delete a connector instance
connectorsRouter.delete('/instances/:id', async (c) => {
  const id = c.req.param('id');
  const result = await deleteConnectorInstance(id);
  if (isServiceError(result)) return c.json({ error: result.error }, result.status);
  return c.body(null, 204);
});

// Test a connector instance connection
connectorsRouter.post('/instances/:id/test', async (c) => {
  const id = c.req.param('id');
  const result = await testConnectorInstance(id);
  if (isServiceError(result)) return c.json({ error: result.error }, result.status);
  return c.json({ success: true });
});

// Upgrade a connector instance to the latest connector version
connectorsRouter.post('/instances/:id/upgrade', zValidator('json', upgradeSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const result = await upgradeConnectorInstance(id, body);
  if (isServiceError(result)) return c.json({ error: result.error }, result.status);
  return c.json(result.data);
});
