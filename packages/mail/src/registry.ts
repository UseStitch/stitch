import type { MailProviderModule } from './contracts.js';

const providers = new Map<string, MailProviderModule>();

export function registerMailProvider(module: MailProviderModule): void {
  if (module.sync.id !== module.ops.id) throw new Error('Mail provider sync and ops ids must match');
  providers.set(module.sync.id, module);
}

export function getMailProvider(id: string): MailProviderModule {
  const provider = providers.get(id);
  if (!provider) throw new Error(`Mail provider not registered: ${id}`);
  return provider;
}
