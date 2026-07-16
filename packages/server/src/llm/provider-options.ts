import type { LlmProviderId } from '@stitch/shared/providers/types';

import type { JSONValue } from 'ai';

/** Returns provider-level options for `streamText`. */
export function getProviderOptions(
  providerId: LlmProviderId,
  sessionId: string,
): Record<string, Record<string, JSONValue>> | undefined {
  switch (providerId) {
    case 'openai':
      return { openai: { promptCacheKey: sessionId } };

    case 'openrouter':
      return { openrouter: { prompt_cache_key: sessionId } };

    case 'nvidia':
      return { nvidia: { stream_options: { include_usage: true } } };

    case 'vercel':
      return { gateway: { caching: 'auto' } };

    case 'ollama_local':
      return { ollama_local: { stream_options: { include_usage: true } } };

    case 'lmstudio_local':
      return { lmstudio_local: { stream_options: { include_usage: true } } };

    case 'anthropic':
    case 'amazon-bedrock':
    case 'google':
    case 'google-vertex':
      return undefined;
  }
}
