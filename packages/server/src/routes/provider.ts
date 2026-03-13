import { Hono } from 'hono';
import * as Models from '../provider/models.js';

type ProviderSummary = {
  id: string;
  name: string;
  api: string | undefined;
  model_count: number;
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

function toProviderSummary(provider: Models.RawProvider): ProviderSummary {
  return {
    id: provider.id,
    name: provider.name,
    api: provider.api,
    model_count: Object.keys(provider.models).length,
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
  const data = await Models.get();
  const providers = Object.values(data).map(toProviderSummary);
  return c.json(providers);
});

providerRouter.get('/:providerId', async (c) => {
  const data = await Models.get();
  const provider = data[c.req.param('providerId')];
  if (!provider) return c.json({ error: 'Provider not found' }, 404);
  return c.json(toProviderSummary(provider));
});

providerRouter.get('/:providerId/models', async (c) => {
  const data = await Models.get();
  const provider = data[c.req.param('providerId')];
  if (!provider) return c.json({ error: 'Provider not found' }, 404);
  const models = Object.values(provider.models).map(toModelSummary);
  return c.json(models);
});

providerRouter.get('/:providerId/models/:modelId', async (c) => {
  const data = await Models.get();
  const provider = data[c.req.param('providerId')];
  if (!provider) return c.json({ error: 'Provider not found' }, 404);
  const model = provider.models[c.req.param('modelId')];
  if (!model) return c.json({ error: 'Model not found' }, 404);
  return c.json(toModelSummary(model));
});
