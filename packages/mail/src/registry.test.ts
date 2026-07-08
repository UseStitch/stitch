import { describe, expect, test } from 'bun:test';

import { MailConfigurationError, MailError } from './errors.js';
import { getMailProvider, registerMailProvider } from './registry.js';

import type { MailProviderModule } from './contracts.js';

const module = { sync: { id: 'test' }, ops: { id: 'test' } } as MailProviderModule;

describe('mail provider registry', () => {
  test('registers and resolves providers', () => {
    registerMailProvider(module);
    expect(getMailProvider('test')).toBe(module);
  });

  test('throws typed errors for invalid providers', () => {
    expect(() => getMailProvider('missing')).toThrow(MailConfigurationError);
    expect(() => getMailProvider('missing')).toThrow(MailError);
    expect(() => registerMailProvider({ sync: { id: 'sync' }, ops: { id: 'ops' } } as MailProviderModule)).toThrow(
      MailConfigurationError,
    );
  });
});
