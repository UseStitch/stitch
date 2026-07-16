import type { LlmProviderId } from '@stitch/shared/providers/types';

import type { JSONValue } from 'ai';

/**
 * Returns provider-level options for `streamText`.
 *
 * - OpenAI: `promptCacheKey` improves cache hit rates by associating
 *   the session with a stable key, especially important for GPT-5+ where
 *   automatic caching may not activate reliably without it.
 * - OpenRouter: `prompt_cache_key` serves the same purpose for
 *   OpenRouter's caching infrastructure.
 * - NVIDIA: `stream_options.include_usage` requests token usage in
 *   OpenAI-compatible streaming responses.
 * - Vercel (AI Gateway): `caching: 'auto'` lets the gateway
 *   automatically apply the correct caching strategy for the
 *   underlying provider the model routes to.
 */
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

    case 'anthropic':
    case 'amazon-bedrock':
    case 'google':
    case 'google-vertex':
    case 'ollama_local':
    case 'lmstudio_local':
      return undefined;
  }
}
