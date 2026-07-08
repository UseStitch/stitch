import { describe, expect, test } from 'bun:test';

import type { MailProviderModule } from './contracts.js';
import { getMailProvider, registerMailProvider } from './registry.js';

const module = {
  sync: { id: 'test' },
  ops: { id: 'test' },
} as MailProviderModule;

describe('mail provider registry', () => {
  test('registers and resolves providers', () => {
    registerMailProvider(module);
    expect(getMailProvider('test')).toBe(module);
  });
});
