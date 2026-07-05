import type { ProviderId } from '@stitch/shared/providers/types';

import type { ModelMessage, JSONValue, Tool } from 'ai';

type ProviderCacheConfig = {
  namespace: string;
  key: string;
  value: JSONValue;
  breakpointCap: number;
};

const ANTHROPIC_CACHE: ProviderCacheConfig = {
  namespace: 'anthropic',
  key: 'cacheControl',
  value: { type: 'ephemeral' },
  breakpointCap: 4,
};

const BEDROCK_CACHE: ProviderCacheConfig = {
  namespace: 'bedrock',
  key: 'cachePoint',
  value: { type: 'default' },
  breakpointCap: 4,
};

const OPENROUTER_CACHE: ProviderCacheConfig = {
  namespace: 'openrouter',
  key: 'cacheControl',
  value: { type: 'ephemeral' },
  breakpointCap: 4,
};

export function getCacheConfig(
  providerId: ProviderId,
  modelId: string,
): ProviderCacheConfig | null {
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
    // Ollama: local inference, no cache control support
    case 'ollama_local':
    // NVIDIA: caching handled by API provider
    case 'nvidia':
    // ElevenLabs: STT-only, no LLM cache control
    case 'elevenlabs':
    // AssemblyAI: STT-only, no LLM cache control
    case 'assemblyai':
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
 * Marks the first two system messages and the latest user message with
 * cache control directives, reserving one breakpoint for tools (applied
 * separately via `addCacheControlToTools`).
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

  // Budget: reserve 1 slot for tools, use remaining for messages
  let remaining = config.breakpointCap - 1;

  const toMark = new Set<number>();

  // First system message
  if (remaining > 0) {
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === 'system') {
        toMark.add(i);
        remaining--;
        break;
      }
    }
  }

  // Second system message
  if (remaining > 0) {
    let systemCount = 0;
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === 'system') {
        systemCount++;
        if (systemCount === 2) {
          toMark.add(i);
          remaining--;
          break;
        }
      }
    }
  }

  // Latest user message
  if (remaining > 0) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        toMark.add(i);
        remaining--;
        break;
      }
    }
  }

  if (toMark.size === 0) return messages;

  const result = [...messages];
  for (const index of toMark) {
    result[index] = withCacheMarker(result[index], config);
  }

  return result;
}

/**
 * Marks the last tool definition with a cache control breakpoint.
 * For providers with implicit caching, tools are returned unchanged.
 */
export function addCacheControlToTools(
  tools: Record<string, Tool>,
  providerId: ProviderId,
  modelId: string,
): Record<string, Tool> {
  const config = getCacheConfig(providerId, modelId);
  if (!config) return tools;

  const entries = Object.entries(tools);
  if (entries.length === 0) return tools;

  const [lastKey, lastTool] = entries[entries.length - 1];

  const markedTool = {
    ...lastTool,
    providerOptions: {
      ...(lastTool as { providerOptions?: Record<string, Record<string, JSONValue>> })
        .providerOptions,
      [config.namespace]: {
        [config.key]: config.value,
      },
    },
  } as Tool;

  return { ...tools, [lastKey]: markedTool };
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
 * - NVIDIA: `stream_options.include_usage` requests token usage in
 *   OpenAI-compatible streaming responses.
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

    case 'nvidia':
      return { nvidia: { stream_options: { include_usage: true } } };

    // Anthropic, Bedrock: caching is handled by message-level markers only
    case 'anthropic':
    case 'amazon-bedrock':
    // Google, Google Vertex: implicit caching, no session key mechanism
    case 'google':
    case 'google-vertex':
    // ElevenLabs, AssemblyAI: STT-only, no LLM cache control
    case 'elevenlabs':
    case 'assemblyai':
    // Ollama: local inference, no cache control support
    case 'ollama_local':
      return undefined;

    // Vercel (AI Gateway): automatic caching based on underlying provider
    case 'vercel':
      return { gateway: { caching: 'auto' } };
  }
}
