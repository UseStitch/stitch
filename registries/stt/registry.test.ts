import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

type JsonSchema = Parameters<typeof z.fromJSONSchema>[0];

type SttProvider = { providerId: string; models: Array<{ modelId: string }> };

const registryDir = import.meta.dir;
const modelsDir = join(registryDir, 'models');
const schema = z.fromJSONSchema(
  readJson(join(registryDir, 'schema', 'stt-provider.schema.json')) as JsonSchema,
) as z.ZodType<SttProvider>;

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function modelFiles() {
  return readdirSync(modelsDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(modelsDir, name));
}

function expectValidProvider(path: string) {
  const result = schema.safeParse(readJson(path));
  if (!result.success) {
    throw new Error(result.error.message);
  }

  return result.data;
}

describe('STT registry', () => {
  test('provider configs match the schema', () => {
    for (const filePath of modelFiles()) {
      expectValidProvider(filePath);
    }
  });

  test('provider and model ids are unique', () => {
    const providerIds = new Set<string>();

    for (const filePath of modelFiles()) {
      const provider = expectValidProvider(filePath);
      const modelIds = new Set<string>();

      expect(providerIds.has(provider.providerId), `Duplicate provider id: ${provider.providerId}`).toBe(false);
      providerIds.add(provider.providerId);

      for (const model of provider.models) {
        expect(modelIds.has(model.modelId), `${filePath}: duplicate model id ${model.modelId}`).toBe(false);
        modelIds.add(model.modelId);
      }
    }
  });
});
