import type { LlmProviderId } from '@stitch/shared/providers/types';

import type { ModelMessage, JSONValue, Tool } from 'ai';

type ProviderCacheConfig = { namespace: string; key: string; value: JSONValue; breakpointCap: number };

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

export function getCacheConfig(providerId: LlmProviderId, modelId: string): ProviderCacheConfig | null {
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

    // OpenAI: automatic prefix caching, session-level key handled by provider options
    case 'openai':
    // Google, Google Vertex (Gemini): implicit caching enabled by default, no API control
    case 'google':
    // Vercel (AI Gateway): caching handled by gateway via provider options
    case 'vercel':
    // Ollama: local inference, no cache control support
    case 'ollama_local':
    // LM Studio: local inference, no cache control support
    case 'lmstudio_local':
    // NVIDIA: caching handled by API provider
    case 'nvidia':
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
  providerId: LlmProviderId,
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
  providerId: LlmProviderId,
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
      ...(lastTool as { providerOptions?: Record<string, Record<string, JSONValue>> }).providerOptions,
      [config.namespace]: { [config.key]: config.value },
    },
  } as Tool;

  return { ...tools, [lastKey]: markedTool };
}
