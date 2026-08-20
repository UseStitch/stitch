import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { listConnectorDefinitions } from '@/connectors/registry.js';
import {
  listConnectors,
  listConnectorInstances,
  getConnectorInstance,
  createOAuthConnector,
  createOAuthConnectorInstance,
  createApiKeyConnectorInstance,
  authorizeOAuthInstance,
  updateConnectorInstance,
  deleteConnector,
  deleteConnectorInstance,
  testConnectorInstance,
  upgradeConnectorInstance,
} from '@/connectors/service.js';
import * as Log from '@/lib/log.js';

export const connectorsRouter = new Hono();
const log = Log.create({ service: 'connectors-route' });

// List all available connector definitions
connectorsRouter.get('/definitions', (c) => {
  const definitions = listConnectorDefinitions();
  return c.json(definitions);
});

// List configured connector credentials
connectorsRouter.get('/', async (c) => {
  const result = await listConnectors();
  return c.json(result);
});

// Create OAuth connector credentials
const createConnectorOAuthSchema = z.object({
  connectorId: z.string().min(1),
  label: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

connectorsRouter.post('/oauth', zValidator('json', createConnectorOAuthSchema), async (c) => {
  const body = c.req.valid('json');
  const result = await createOAuthConnector(body);
  return c.json(result, 201);
});

// List all connector instances
connectorsRouter.get('/instances', async (c) => {
  const result = await listConnectorInstances();
  return c.json(result);
});

// Get a specific connector instance
connectorsRouter.get('/instances/:id', async (c) => {
  const id = c.req.param('id');
  const result = await getConnectorInstance(id);
  return c.json(result);
});

// Create an OAuth connector instance
const createOAuthSchema = z.object({
  connectorRefId: z.string().min(1),
  label: z.string().min(1),
  scopes: z.array(z.string()).min(1),
});

connectorsRouter.post('/instances/oauth', zValidator('json', createOAuthSchema), async (c) => {
  const body = c.req.valid('json');
  const result = await createOAuthConnectorInstance(body);
  return c.json(result, 201);
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
  return c.json(result, 201);
});

// Start OAuth authorization flow for an instance
connectorsRouter.post('/instances/:id/authorize', async (c) => {
  const id = c.req.param('id');
  const result = await authorizeOAuthInstance(id);

  const { waitForTokens } = result;
  void waitForTokens().catch((error) => {
    const message = Error.isError(error) ? error.message : String(error);
    log.warn(
      { event: 'connector.authorize.background_failed', id, error: message },
      'background connector authorization failed',
    );
  });

  return c.json({ authUrl: result.authUrl });
});

// Update a connector instance
const updateSchema = z.object({ label: z.string().min(1).optional(), scopes: z.array(z.string()).optional() });

const upgradeSchema = z.object({ apiKey: z.string().min(1).optional() });

connectorsRouter.patch('/instances/:id', zValidator('json', updateSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const result = await updateConnectorInstance(id, body);
  return c.json(result);
});

// Delete a connector instance
connectorsRouter.delete('/instances/:id', async (c) => {
  const id = c.req.param('id');
  await deleteConnectorInstance(id);
  return c.body(null, 204);
});

// Delete connector credentials and all linked accounts
connectorsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await deleteConnector(id);
  return c.body(null, 204);
});

// Test a connector instance connection
connectorsRouter.post('/instances/:id/test', async (c) => {
  const id = c.req.param('id');
  await testConnectorInstance(id);
  return c.json({ success: true });
});

// Upgrade a connector instance to the latest connector version
connectorsRouter.post('/instances/:id/upgrade', zValidator('json', upgradeSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const result = await upgradeConnectorInstance(id, body);
  return c.json(result);
});
