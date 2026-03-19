import type { ProviderId } from '@stitch/shared/providers/types';
import type { ModelMessage, JSONValue } from 'ai';

type ProviderCacheConfig = {
  namespace: string;
  key: string;
  value: JSONValue;
};

const ANTHROPIC_CACHE: ProviderCacheConfig = {
  namespace: 'anthropic',
  key: 'cacheControl',
  value: { type: 'ephemeral' },
};

const BEDROCK_CACHE: ProviderCacheConfig = {
  namespace: 'bedrock',
  key: 'cachePoint',
  value: { type: 'default' },
};

const OPENROUTER_CACHE: ProviderCacheConfig = {
  namespace: 'openrouter',
  key: 'cacheControl',
  value: { type: 'ephemeral' },
};

export function getCacheConfig(providerId: ProviderId, modelId: string): ProviderCacheConfig | null {
  switch (providerId) {
    case 'anthropic':
      return ANTHROPIC_CACHE;

    case 'amazon-bedrock':
      return BEDROCK_CACHE;

    case 'openrouter':
      return OPENROUTER_CACHE;

    case 'google-vertex':
      if (modelId.includes('claude') || modelId.includes('anthropic')) {
        return ANTHROPIC_CACHE;
      }
      return null;

    // OpenAI: automatic prefix caching, session-level key handled by getProviderOptions
    case 'openai':
    // Google, Google Vertex (Gemini): implicit caching enabled by default, no API control
    case 'google':
    // Vercel (AI Gateway): caching handled by gateway via getProviderOptions
    case 'vercel':
      return null;
  }
}

function withCacheMarker(message: ModelMessage, config: ProviderCacheConfig): ModelMessage {
  return {
    ...message,
    providerOptions: {
      ...message.providerOptions,
      [config.namespace]: {
        ...(message.providerOptions?.[config.namespace] as Record<string, JSONValue> | undefined),
        [config.key]: config.value,
      },
    },
  };
}

/**
 * Adds provider-specific prompt caching markers to messages.
 *
 * For providers with explicit caching (Anthropic, Bedrock, OpenRouter),
 * this marks the first two system messages and the last two non-system
 * messages with cache control directives. System prompts are large and
 * static, making them ideal for caching. The last two messages are marked
 * to give the provider more flexibility to cache the longest matching
 * conversation prefix (per Anthropic's recommended pattern).
 *
 * For providers with implicit caching (OpenAI, Google, Vercel),
 * messages are returned unchanged.
 */
export function addCacheControlToMessages(
  messages: ModelMessage[],
  providerId: ProviderId,
  modelId: string,
): ModelMessage[] {
  if (messages.length === 0) return messages;

  const config = getCacheConfig(providerId, modelId);
  if (!config) return messages;

  // Collect up to 2 system messages and up to 2 trailing non-system messages
  const systemIndices: number[] = [];
  for (let i = 0; i < messages.length && systemIndices.length < 2; i++) {
    if (messages[i].role === 'system') {
      systemIndices.push(i);
    }
  }

  const tailIndices: number[] = [];
  for (let i = messages.length - 1; i >= 0 && tailIndices.length < 2; i--) {
    if (messages[i].role !== 'system') {
      tailIndices.push(i);
    }
  }

  // Deduplicate indices (a system message could overlap with a tail message
  // in very short conversations)
  const toMark = new Set([...systemIndices, ...tailIndices]);

  const result = [...messages];
  for (const index of toMark) {
    result[index] = withCacheMarker(result[index], config);
  }

  return result;
}

/**
 * Returns provider-level options for the `streamText` call that enable
 * session-based prompt caching. This is separate from the message-level
 * cache markers added by `addCacheControlToMessages`.
 *
 * - OpenAI: `promptCacheKey` improves cache hit rates by associating
 *   the session with a stable key, especially important for GPT-5+ where
 *   automatic caching may not activate reliably without it.
 * - OpenRouter: `prompt_cache_key` serves the same purpose for
 *   OpenRouter's caching infrastructure.
 * - Vercel (AI Gateway): `caching: 'auto'` lets the gateway
 *   automatically apply the correct caching strategy for the
 *   underlying provider the model routes to.
 */
export function getProviderOptions(
  providerId: ProviderId,
  sessionId: string,
): Record<string, Record<string, JSONValue>> | undefined {
  switch (providerId) {
    case 'openai':
      return { openai: { promptCacheKey: sessionId } };

    case 'openrouter':
      return { openrouter: { prompt_cache_key: sessionId } };

    // Anthropic, Bedrock: caching is handled by message-level markers only
    case 'anthropic':
    case 'amazon-bedrock':
    // Google, Google Vertex: implicit caching, no session key mechanism
    case 'google':
    case 'google-vertex':
      return undefined;

    // Vercel (AI Gateway): automatic caching based on underlying provider
    case 'vercel':
      return { gateway: { caching: 'auto' } };
  }
}
