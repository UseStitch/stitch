import { describe, expect, test } from 'bun:test';

import { setupTestDb } from '@/db/test-helpers.js';
import { validateProviderModel } from '@/llm/resolve-model.js';

setupTestDb();

describe('validateProviderModel', () => {
  test('returns structured provider errors without reading model settings', async () => {
    expect(validateProviderModel('not-a-provider', 'not-a-model')).rejects.toThrow('Provider not found');
  });
});
