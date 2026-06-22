import { describe, expect, test } from 'bun:test';

import { setupTestDb } from '@/db/test-helpers.js';
import { validateProviderModel } from '@/llm/resolve-model.js';

setupTestDb();

describe('validateProviderModel', () => {
  test('returns structured provider errors without reading model settings', async () => {
    const result = await validateProviderModel('not-a-provider', 'not-a-model');

    expect(result.error?.message).toBe('Provider not found');
    expect(result.error?.status).toBe(404);
  });
});
