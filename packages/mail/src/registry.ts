import { MailConfigurationError } from './errors.js';

import type { MailProviderModule } from './contracts.js';

const providers = new Map<string, MailProviderModule>();

export function registerMailProvider(module: MailProviderModule): void {
  if (module.sync.id !== module.ops.id) throw new MailConfigurationError('Mail provider sync and ops ids must match');
  providers.set(module.sync.id, module);
}

export function getMailProvider(id: string): MailProviderModule {
  const provider = providers.get(id);
  if (!provider) throw new MailConfigurationError(`Mail provider not registered: ${id}`);
  return provider;
}
