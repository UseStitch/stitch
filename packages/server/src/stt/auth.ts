import { getProviderCredentials } from '@/provider/service.js';
import type { ProviderAuth } from '@/stt/types.js';

/**
 * Resolves STT provider credentials from the existing provider auth system.
 * Parses stored credentials through the shared schema to extract the API key —
 * no per-provider switch required; the schema shape determines the auth kind.
 */
export async function resolveSttAuth(providerId: string): Promise<ProviderAuth | null> {
  try {
    const credentials = await getProviderCredentials(providerId);
    if ('apiKey' in credentials.auth) {
      return { kind: 'apiKey', key: credentials.auth.apiKey };
    }
  } catch {
    return null;
  }

  return null;
}
