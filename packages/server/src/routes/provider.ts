import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { getDb } from '../db/client.js';
import { providerConfig } from '../db/schema.js';
import * as Log from '../lib/log.js';
import * as Models from '../provider/models.js';
import { ProviderCredentialsSchema } from '../provider/provider.js';

const log = Log.create({ service: 'provider-routes' });

function assertAllowed(providerId: string): boolean {
  return (Models.ALLOWERD_PROVIDER_IDS as readonly string[]).includes(providerId);
}

type ProviderSummary = {
  id: string;
  name: string;
  api: string | undefined;
  model_count: number;
  enabled: boolean;
};

type ModelSummary = {
  id: string;
  name: string;
  family: string | undefined;
  release_date: string;
  cost: Models.RawModel['cost'];
  limit: Models.RawModel['limit'];
  modalities: Models.RawModel['modalities'];
};

function toProviderSummary(provider: Models.RawProvider, enabled: boolean): ProviderSummary {
  return {
    id: provider.id,
    name: provider.name,
    api: provider.api,
    model_count: Object.keys(provider.models).length,
    enabled,
  };
}

function toModelSummary(model: Models.RawModel): ModelSummary {
  return {
    id: model.id,
    name: model.name,
    family: model.family,
    release_date: model.release_date,
    cost: model.cost,
    limit: model.limit,
    modalities: model.modalities,
  };
}

export const providerRouter = new Hono();

providerRouter.get('/', async (c) => {
  const db = getDb();
  const [data, configs] = await Promise.all([
    Models.get(),
    db.select({ providerId: providerConfig.providerId }).from(providerConfig),
  ]);
  const enabledIds = new Set(configs.map((r) => r.providerId));
  const providers = Object.values(data).map((p) => toProviderSummary(p, enabledIds.has(p.id)));
  return c.json(providers);
});

providerRouter.get('/:providerId', async (c) => {
  const providerId = c.req.param('providerId');
  if (!assertAllowed(providerId)) {
    log.warn('Blocked access to non-allowed provider', { providerId });
    return c.json({ error: 'Provider not found' }, 404);
  }
  const data = await Models.get();
  const provider = data[providerId];
  if (!provider) return c.json({ error: 'Provider not found' }, 404);
  const db = getDb();
  const [config] = await db
    .select({ providerId: providerConfig.providerId })
    .from(providerConfig)
    .where(eq(providerConfig.providerId, providerId));
  return c.json(toProviderSummary(provider, config !== undefined));
});

providerRouter.get('/:providerId/models', async (c) => {
  const providerId = c.req.param('providerId');
  if (!assertAllowed(providerId)) {
    log.warn('Blocked access to non-allowed provider', { providerId });
    return c.json({ error: 'Provider not found' }, 404);
  }
  const data = await Models.get();
  const provider = data[providerId];
  if (!provider) return c.json({ error: 'Provider not found' }, 404);
  const models = Object.values(provider.models).map(toModelSummary);
  return c.json(models);
});

providerRouter.get('/:providerId/models/:modelId', async (c) => {
  const providerId = c.req.param('providerId');
  if (!assertAllowed(providerId)) {
    log.warn('Blocked access to non-allowed provider', { providerId });
    return c.json({ error: 'Provider not found' }, 404);
  }
  const data = await Models.get();
  const provider = data[providerId];
  if (!provider) return c.json({ error: 'Provider not found' }, 404);
  const model = provider.models[c.req.param('modelId')];
  if (!model) return c.json({ error: 'Model not found' }, 404);
  return c.json(toModelSummary(model));
});

providerRouter.get('/:providerId/config', async (c) => {
  const providerId = c.req.param('providerId');
  if (!assertAllowed(providerId)) {
    log.warn('Blocked access to non-allowed provider', { providerId });
    return c.json({ error: 'Provider not found' }, 404);
  }
  const db = getDb();
  const [config] = await db
    .select()
    .from(providerConfig)
    .where(eq(providerConfig.providerId, providerId));
  if (!config) return c.json({ error: 'Provider not configured' }, 404);
  return c.json(config.credentials);
});

providerRouter.put('/:providerId/config', async (c) => {
  const providerId = c.req.param('providerId');
  if (!assertAllowed(providerId)) {
    log.warn('Blocked access to non-allowed provider', { providerId });
    return c.json({ error: 'Provider not found' }, 404);
  }
  const body = await c.req.json();
  const result = ProviderCredentialsSchema.safeParse({ ...body, providerId });
  if (!result.success) {
    return c.json({ error: 'Invalid credentials', details: result.error.flatten() }, 400);
  }
  const db = getDb();
  await db
    .insert(providerConfig)
    .values({ providerId, credentials: result.data })
    .onConflictDoUpdate({
      target: providerConfig.providerId,
      set: { credentials: result.data, updatedAt: new Date() },
    });
  return c.body(null, 204);
});

providerRouter.delete('/:providerId/config', async (c) => {
  const providerId = c.req.param('providerId');
  if (!assertAllowed(providerId)) {
    log.warn('Blocked access to non-allowed provider', { providerId });
    return c.json({ error: 'Provider not found' }, 404);
  }
  const db = getDb();
  const result = await db
    .delete(providerConfig)
    .where(eq(providerConfig.providerId, providerId))
    .returning({ providerId: providerConfig.providerId });
  if (result.length === 0) return c.json({ error: 'Provider not configured' }, 404);
  return c.body(null, 204);
});
