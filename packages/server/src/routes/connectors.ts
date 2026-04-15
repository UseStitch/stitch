import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

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
import { requireFound, unwrapResult } from '@/lib/route-helpers.js';

export const connectorsRouter = new Hono();
const log = Log.create({ service: 'connectors-route' });

// List all available connector definitions
connectorsRouter.get('/definitions', (c) => {
  const definitions = listConnectorDefinitions();
  return c.json(definitions);
});

// Get a specific connector definition
connectorsRouter.get('/definitions/:id', (c) => {
  const id = c.req.param('id');
  const definition = getConnectorDefinition(id);
  const result = requireFound(definition, 'Connector');
  return unwrapResult(c, result);
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
  return unwrapResult(c, result);
});

// Create an OAuth connector instance
const createOAuthSchema = z.object({
  connectorId: z.string().min(1),
  label: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  scopes: z.array(z.string()).min(1),
});

connectorsRouter.post('/instances/oauth', zValidator('json', createOAuthSchema), async (c) => {
  const body = c.req.valid('json');
  const result = await createOAuthConnectorInstance(body);
  return unwrapResult(c, result, 201);
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
  return unwrapResult(c, result, 201);
});

// Start OAuth authorization flow for an instance
connectorsRouter.post('/instances/:id/authorize', async (c) => {
  const id = c.req.param('id');
  const result = await authorizeOAuthInstance(id);
  if (isServiceError(result)) return unwrapResult(c, result);

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
  return unwrapResult(c, result);
});

// Delete a connector instance
connectorsRouter.delete('/instances/:id', async (c) => {
  const id = c.req.param('id');
  const result = await deleteConnectorInstance(id);
  return unwrapResult(c, result, 204);
});

// Test a connector instance connection
connectorsRouter.post('/instances/:id/test', async (c) => {
  const id = c.req.param('id');
  const result = await testConnectorInstance(id);
  if (isServiceError(result)) return unwrapResult(c, result);
  return c.json({ success: true });
});

// Upgrade a connector instance to the latest connector version
connectorsRouter.post('/instances/:id/upgrade', zValidator('json', upgradeSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const result = await upgradeConnectorInstance(id, body);
  return unwrapResult(c, result);
});
